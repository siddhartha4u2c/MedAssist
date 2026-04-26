"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  adminApprovePaymentRequest,
  adminRejectPaymentRequest,
  adminDeleteLead,
  adminRemoveUserPortalProfile,
  adminPatientDoctorLink,
  adminSetUserBlocked,
  downloadPaymentRequestProof,
  errorMessageFromUnknown,
  fetchAdminDoctorsList,
  fetchAdminPaymentRequests,
  fetchAdminPatients,
  fetchAdminPortalUsers,
  fetchAdminAiLogs,
  type AdminAiBreakdownRow,
  type AdminAiLogsResponse,
  type AdminAiRecentEvent,
  type AdminAiUsageTotals,
  type AdminDoctorRow,
  type AdminPatientRow,
  type AdminPaymentRequestRow,
  type AdminUserMgmtRow,
} from "@/lib/api-client";
import { getStoredAccessToken } from "@/lib/auth-storage";

type LeadRow = {
  id: string;
  name: string;
  mobile: string;
  email: string;
  createdAt: string;
};

type AdminTabId = "billing" | "leads" | "assignments" | "ai-logs" | "users";

const TABS: { id: AdminTabId; label: string }[] = [
  { id: "billing", label: "Billing payment requests" },
  { id: "leads", label: "Prospective clients & enquiries" },
  { id: "assignments", label: "Patient ↔ Doctor assignments" },
  { id: "ai-logs", label: "AI logs" },
  { id: "users", label: "User management" },
];

function parseTab(raw: string | null): AdminTabId {
  if (
    raw === "leads" ||
    raw === "assignments" ||
    raw === "billing" ||
    raw === "users" ||
    raw === "ai-logs"
  )
    return raw;
  return "billing";
}

function formatWhen(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

const TREATMENT_LABELS: Record<string, string> = {
  consultation: "Consultation",
  diagnosis: "Diagnosis",
  medical_tests: "Medical tests",
  surgery: "Surgery",
  others: "Others",
};

function formatTreatment(v: string): string {
  return TREATMENT_LABELS[v] ?? v;
}

function assignedDoctorsForPatientRow(row: AdminPatientRow) {
  if (row.assignedDoctors?.length) return row.assignedDoctors;
  if (row.assignedDoctor) return [row.assignedDoctor];
  return [];
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat().format(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(2)}%`;
}

function AiTotalsCards({ title, t }: { title: string; t: AdminAiUsageTotals }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-500">Requests</dt>
          <dd className="font-semibold text-slate-900">{fmtInt(t.requests)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Total tokens</dt>
          <dd className="font-semibold text-slate-900">{fmtInt(t.totalTokens)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Prompt tokens</dt>
          <dd className="font-semibold text-slate-900">{fmtInt(t.promptTokens)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Completion tokens</dt>
          <dd className="font-semibold text-slate-900">{fmtInt(t.completionTokens)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Avg latency</dt>
          <dd className="font-semibold text-slate-900">
            {t.avgLatencyMs != null ? `${fmtInt(t.avgLatencyMs)} ms` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Errors</dt>
          <dd className="font-semibold text-red-800">{fmtInt(t.errors)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Success rate</dt>
          <dd className="font-semibold text-emerald-800">{fmtPct(t.successRatePct)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">OK requests</dt>
          <dd className="font-semibold text-slate-900">{fmtInt(t.successfulRequests)}</dd>
        </div>
      </dl>
    </div>
  );
}

function AiBreakdownTable({
  rows,
  labelHeader,
  labelOf,
}: {
  rows: AdminAiBreakdownRow[];
  labelHeader: string;
  labelOf: (r: AdminAiBreakdownRow) => string;
}) {
  if (!rows.length) {
    return <p className="text-xs text-slate-500">No rows in this period.</p>;
  }
  return (
    <div className="max-h-56 overflow-auto rounded-lg border border-slate-100">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 bg-slate-50 text-slate-600">
          <tr className="border-b border-slate-200">
            <th className="py-1.5 pl-2 pr-2 font-medium">{labelHeader}</th>
            <th className="py-1.5 pr-2 text-right font-medium">Req</th>
            <th className="py-1.5 pr-2 text-right font-medium">Tokens</th>
            <th className="py-1.5 pr-2 text-right font-medium">Avg ms</th>
            <th className="py-1.5 pr-2 text-right font-medium">Err</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${labelOf(r)}-${i}`} className="border-b border-slate-100">
              <td className="max-w-[10rem] truncate py-1 pl-2 pr-2 text-slate-800" title={labelOf(r)}>
                {labelOf(r) || "—"}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">{fmtInt(r.requests)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{fmtInt(r.totalTokens)}</td>
              <td className="py-1 pr-2 text-right tabular-nums text-slate-600">
                {r.avgLatencyMs != null ? fmtInt(Math.round(r.avgLatencyMs)) : "—"}
              </td>
              <td className="py-1 pr-2 text-right text-red-800">{fmtInt(r.errors)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AiRecentTable({ rows, emptyHint }: { rows: AdminAiRecentEvent[]; emptyHint: string }) {
  if (!rows.length) {
    return <p className="text-sm text-slate-500">{emptyHint}</p>;
  }
  return (
    <div className="max-h-[min(50vh,24rem)] overflow-auto rounded-lg border border-slate-100">
      <table className="min-w-full border-collapse text-left text-xs sm:text-sm">
        <thead className="sticky top-0 z-[1] bg-slate-50 shadow-sm">
          <tr className="border-b border-slate-200 text-slate-600">
            <th className="py-2 pl-3 pr-2 font-medium">When</th>
            <th className="py-2 pr-2 font-medium">Op</th>
            <th className="py-2 pr-2 font-medium">Source</th>
            <th className="py-2 pr-2 font-medium">Model</th>
            <th className="py-2 pr-2 font-medium text-right">Tokens</th>
            <th className="py-2 pr-2 font-medium text-right">ms</th>
            <th className="py-2 pr-3 font-medium">OK</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 align-top">
              <td className="whitespace-nowrap py-1.5 pl-3 pr-2 text-slate-800">{formatWhen(r.createdAt)}</td>
              <td className="py-1.5 pr-2 font-mono text-[11px] text-slate-700">{r.operation}</td>
              <td className="max-w-[8rem] truncate py-1.5 pr-2 text-slate-600" title={r.source}>
                {r.source || "—"}
              </td>
              <td className="max-w-[10rem] truncate py-1.5 pr-2 text-slate-600" title={r.model}>
                {r.model || "—"}
              </td>
              <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums text-slate-800">
                {fmtInt(r.totalTokens ?? r.promptTokens ?? 0)}
              </td>
              <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums text-slate-700">
                {r.latencyMs != null ? fmtInt(r.latencyMs) : "—"}
              </td>
              <td className="py-1.5 pr-3">
                {r.success ? (
                  <span className="text-emerald-700">Yes</span>
                ) : (
                  <span className="text-red-800" title={r.errorSummary}>
                    No
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminDashboardInner() {
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [leadsError, setLeadsError] = useState("");
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);

  const [patients, setPatients] = useState<AdminPatientRow[] | null>(null);
  const [doctors, setDoctors] = useState<AdminDoctorRow[] | null>(null);
  const [portalError, setPortalError] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignmentFilterDoctorId, setAssignmentFilterDoctorId] = useState("");
  const [doctorPickToAdd, setDoctorPickToAdd] = useState<Record<string, string>>({});

  const [paymentReqs, setPaymentReqs] = useState<AdminPaymentRequestRow[] | null>(null);
  const [paymentPending, setPaymentPending] = useState(0);
  const [paymentError, setPaymentError] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const [portalUsers, setPortalUsers] = useState<AdminUserMgmtRow[] | null>(null);
  const [usersError, setUsersError] = useState("");
  const [userActionId, setUserActionId] = useState<string | null>(null);

  const [aiLogs, setAiLogs] = useState<AdminAiLogsResponse | null>(null);
  const [aiLogsLoading, setAiLogsLoading] = useState(false);
  const [aiLogsError, setAiLogsError] = useState("");
  const [aiLogFrom, setAiLogFrom] = useState("");
  const [aiLogTo, setAiLogTo] = useState("");

  async function reloadAssignmentPicklists() {
    const token = getStoredAccessToken();
    if (!token) return;
    try {
      const [p, d] = await Promise.all([
        fetchAdminPatients().catch(() => ({ patients: [] as AdminPatientRow[] })),
        fetchAdminDoctorsList().catch(() => ({ doctors: [] as AdminDoctorRow[] })),
      ]);
      setPatients(p.patients);
      setDoctors(d.doctors);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      setLeads([]);
      return;
    }
    let cancelled = false;
    fetch("/api/v1/admin/leads", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (res) => {
        const data = (await res.json()) as { leads?: LeadRow[]; error?: string };
        if (!res.ok) throw new Error(data.error || "Could not load leads.");
        if (!cancelled) setLeads(data.leads ?? []);
      })
      .catch((e) => {
        if (!cancelled) {
          setLeadsError(e instanceof Error ? e.message : "Could not load leads.");
          setLeads([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredAccessToken();
    if (!token) {
      setPatients([]);
      setDoctors([]);
      return;
    }
    Promise.all([
      fetchAdminPatients().catch(() => ({ patients: [] })),
      fetchAdminDoctorsList().catch(() => ({ doctors: [] })),
    ])
      .then(([p, d]) => {
        if (cancelled) return;
        setPatients(p.patients);
        setDoctors(d.doctors);
      })
      .catch((e) => {
        if (!cancelled) setPortalError(errorMessageFromUnknown(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredAccessToken();
    if (!token) {
      setPaymentReqs([]);
      setPaymentPending(0);
      return;
    }
    fetchAdminPaymentRequests()
      .then((d) => {
        if (cancelled) return;
        setPaymentReqs(d.requests);
        setPaymentPending(d.pendingCount);
        setPaymentError("");
      })
      .catch((e) => {
        if (!cancelled) {
          setPaymentError(errorMessageFromUnknown(e));
          setPaymentReqs([]);
          setPaymentPending(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab !== "users") return;
    let cancelled = false;
    const token = getStoredAccessToken();
    if (!token) {
      setPortalUsers([]);
      return;
    }
    setUsersError("");
    setPortalUsers(null);
    fetchAdminPortalUsers()
      .then((d) => {
        if (!cancelled) setPortalUsers(d.users);
      })
      .catch((e) => {
        if (!cancelled) {
          setUsersError(errorMessageFromUnknown(e));
          setPortalUsers([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  useEffect(() => {
    if (tab !== "ai-logs") return;
    let cancelled = false;
    setAiLogsLoading(true);
    setAiLogsError("");
    fetchAdminAiLogs({})
      .then((d) => {
        if (cancelled) return;
        setAiLogs(d);
        setAiLogFrom(d.range.from);
        setAiLogTo(d.range.to);
      })
      .catch((e) => {
        if (!cancelled) {
          setAiLogsError(errorMessageFromUnknown(e));
          setAiLogs(null);
        }
      })
      .finally(() => {
        if (!cancelled) setAiLogsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  async function reloadAiLogsWithRange() {
    setAiLogsLoading(true);
    setAiLogsError("");
    try {
      const d = await fetchAdminAiLogs({
        from: aiLogFrom.trim() || undefined,
        to: aiLogTo.trim() || undefined,
      });
      setAiLogs(d);
    } catch (e) {
      setAiLogsError(errorMessageFromUnknown(e));
    } finally {
      setAiLogsLoading(false);
    }
  }

  const filteredAssignmentPatients = useMemo(() => {
    if (!patients) return [];
    if (!assignmentFilterDoctorId) return patients;
    if (assignmentFilterDoctorId === "__unassigned__") {
      return patients.filter((p) => assignedDoctorsForPatientRow(p).length === 0);
    }
    return patients.filter((p) =>
      assignedDoctorsForPatientRow(p).some((d) => d.userId === assignmentFilterDoctorId)
    );
  }, [patients, assignmentFilterDoctorId]);

  async function addLinkedDoctor(patientUserId: string) {
    const doctorUserId = doctorPickToAdd[patientUserId] ?? "";
    if (!doctorUserId) {
      setPortalError("Choose a doctor in the dropdown, then click Add.");
      return;
    }
    setPortalError("");
    setAssigning(patientUserId);
    try {
      await adminPatientDoctorLink({ patientUserId, doctorUserId, action: "add" });
      setDoctorPickToAdd((m) => ({ ...m, [patientUserId]: "" }));
      const p = await fetchAdminPatients();
      setPatients(p.patients);
    } catch (e) {
      setPortalError(errorMessageFromUnknown(e));
    } finally {
      setAssigning(null);
    }
  }

  async function removeLinkedDoctor(patientUserId: string, doctorUserId: string) {
    setPortalError("");
    setAssigning(patientUserId);
    try {
      await adminPatientDoctorLink({ patientUserId, doctorUserId, action: "remove" });
      const p = await fetchAdminPatients();
      setPatients(p.patients);
    } catch (e) {
      setPortalError(errorMessageFromUnknown(e));
    } finally {
      setAssigning(null);
    }
  }

  async function reviewPaymentRequest(requestId: string, action: "approve" | "reject") {
    if (action === "reject") {
      const ok = window.confirm(
        "Reject this payment request? The patient may receive an email if SMTP is configured."
      );
      if (!ok) return;
    }
    setPaymentError("");
    setApprovingId(requestId);
    try {
      if (action === "approve") {
        await adminApprovePaymentRequest(requestId);
      } else {
        await adminRejectPaymentRequest(requestId);
      }
      const d = await fetchAdminPaymentRequests();
      setPaymentReqs(d.requests);
      setPaymentPending(d.pendingCount);
    } catch (e) {
      setPaymentError(errorMessageFromUnknown(e));
    } finally {
      setApprovingId(null);
    }
  }

  async function toggleUserBlocked(row: AdminUserMgmtRow) {
    if (row.accountRemoved) return;
    setUsersError("");
    setUserActionId(`block:${row.userId}`);
    try {
      await adminSetUserBlocked(row.userId, !row.accessBlocked);
      const d = await fetchAdminPortalUsers();
      setPortalUsers(d.users);
      await reloadAssignmentPicklists();
    } catch (e) {
      setUsersError(errorMessageFromUnknown(e));
    } finally {
      setUserActionId(null);
    }
  }

  async function removeUserProfile(row: AdminUserMgmtRow) {
    if (row.accountRemoved) return;
    const ok = window.confirm(
      `Remove portal profile for ${row.displayName} (${row.email})?\n\n` +
        "They will not be able to sign in and will disappear from directories. Past appointments and records stay in the system."
    );
    if (!ok) return;
    setUsersError("");
    setUserActionId(`remove:${row.userId}`);
    try {
      await adminRemoveUserPortalProfile(row.userId);
      const d = await fetchAdminPortalUsers();
      setPortalUsers(d.users);
      await reloadAssignmentPicklists();
    } catch (e) {
      setUsersError(errorMessageFromUnknown(e));
    } finally {
      setUserActionId(null);
    }
  }

  async function deleteLeadRow(row: LeadRow) {
    const ok = window.confirm(
      `Delete this enquiry for ${row.name} (${row.email})?\n\nThis cannot be undone.`
    );
    if (!ok) return;
    setLeadsError("");
    setDeletingLeadId(row.id);
    try {
      await adminDeleteLead(row.id);
      setLeads((prev) => (prev ? prev.filter((x) => x.id !== row.id) : prev));
    } catch (e) {
      setLeadsError(errorMessageFromUnknown(e));
    } finally {
      setDeletingLeadId(null);
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-slate-50 md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-slate-200 bg-white md:h-[calc(100dvh-3.5rem)] md:w-60 md:border-b-0 md:border-r md:border-slate-200">
        <div className="shrink-0 px-3 py-3 md:border-b md:border-slate-100 md:py-4">
          <h1 className="text-sm font-semibold text-slate-900 md:text-base">Admin dashboard</h1>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto px-2 pb-2 md:min-h-0 md:flex-1 md:flex-col md:gap-0.5 md:overflow-y-auto md:overflow-x-hidden md:px-2 md:pb-3"
          aria-label="Admin sections"
        >
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <Link
                key={item.id}
                href={`/admin?tab=${item.id}`}
                scroll={false}
                className={
                  active
                    ? "whitespace-nowrap rounded-lg bg-clinical-50 px-3 py-2.5 text-left text-sm font-medium text-clinical-900 ring-1 ring-clinical-200 md:whitespace-normal"
                    : "whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 md:whitespace-normal"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-5xl">
            {paymentPending > 0 ? (
              <div
                className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                role="status"
              >
                <strong className="font-semibold">{paymentPending}</strong> payment request
                {paymentPending === 1 ? "" : "s"} awaiting your review.
              </div>
            ) : null}

            {tab === "assignments" ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                <h2 className="text-lg font-semibold text-slate-900">Patient ↔ Doctor assignments</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Patients can have several doctors. Use the filter to list everyone who shares the same
                  doctor. Remove a tag to unlink; pick a doctor below the list and click Add.
                </p>
                {portalError ? <p className="mt-3 text-sm text-red-700">{portalError}</p> : null}
                {patients === null || doctors === null ? (
                  <p className="mt-4 text-sm text-slate-600">Loading patients and doctors…</p>
                ) : doctors.length === 0 ? (
                  <p className="mt-4 text-sm text-amber-800">No doctor accounts in the portal yet.</p>
                ) : patients.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-600">No patient accounts in the portal yet.</p>
                ) : (
                  <>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                        <span className="font-medium">Filter by doctor</span>
                        <select
                          className="min-w-[12rem] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          value={assignmentFilterDoctorId}
                          onChange={(e) => setAssignmentFilterDoctorId(e.target.value)}
                        >
                          <option value="">All patients</option>
                          <option value="__unassigned__">Unassigned (no doctors)</option>
                          {doctors.map((d) => (
                            <option key={d.userId} value={d.userId}>
                              {d.displayName}
                              {d.specialization ? ` (${d.specialization})` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <span className="text-xs text-slate-500">
                        Showing {filteredAssignmentPatients.length} of {patients.length}
                      </span>
                    </div>
                    <div className="mt-4 max-h-[min(70vh,32rem)] overflow-auto rounded-lg border border-slate-100">
                      {filteredAssignmentPatients.length === 0 ? (
                        <p className="p-4 text-sm text-slate-600">No patients match this filter.</p>
                      ) : (
                        <table className="min-w-full border-collapse text-left text-sm">
                          <thead className="sticky top-0 z-[1] bg-slate-50 shadow-sm">
                            <tr className="border-b border-slate-200 text-slate-600">
                              <th className="py-2 pl-3 pr-4 font-medium">Patient</th>
                              <th className="py-2 pr-4 font-medium">Email</th>
                              <th className="py-2 pr-4 font-medium">Assigned doctors</th>
                              <th className="py-2 pr-3 font-medium">Add doctor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredAssignmentPatients.map((row) => {
                              const linked = assignedDoctorsForPatientRow(row);
                              const assignedIds = new Set(linked.map((d) => d.userId));
                              const addable = doctors.filter((d) => !assignedIds.has(d.userId));
                              return (
                                <tr key={row.userId} className="border-b border-slate-100 align-top">
                                  <td className="py-2 pl-3 pr-4 text-slate-900">{row.displayName}</td>
                                  <td className="py-2 pr-4 text-slate-600">{row.email}</td>
                                  <td className="py-2 pr-4">
                                    {linked.length === 0 ? (
                                      <span className="text-slate-400">—</span>
                                    ) : (
                                      <ul className="flex flex-col gap-1.5">
                                        {linked.map((d) => (
                                          <li
                                            key={d.userId}
                                            className="flex flex-wrap items-center gap-2 rounded-md bg-slate-100 px-2 py-1 text-slate-800"
                                          >
                                            <span>{d.displayName}</span>
                                            <button
                                              type="button"
                                              disabled={assigning === row.userId}
                                              onClick={() => void removeLinkedDoctor(row.userId, d.userId)}
                                              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
                                            >
                                              Remove
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </td>
                                  <td className="py-2 pr-3">
                                    {addable.length === 0 ? (
                                      <span className="text-xs text-slate-500">All doctors linked</span>
                                    ) : (
                                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <select
                                          className="max-w-[min(100%,14rem)] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                                          value={doctorPickToAdd[row.userId] ?? ""}
                                          onChange={(e) =>
                                            setDoctorPickToAdd((m) => ({
                                              ...m,
                                              [row.userId]: e.target.value,
                                            }))
                                          }
                                        >
                                          <option value="">Choose…</option>
                                          {addable.map((d) => (
                                            <option key={d.userId} value={d.userId}>
                                              {d.displayName}
                                              {d.specialization ? ` (${d.specialization})` : ""}
                                            </option>
                                          ))}
                                        </select>
                                        <button
                                          type="button"
                                          disabled={assigning === row.userId}
                                          onClick={() => void addLinkedDoctor(row.userId)}
                                          className="shrink-0 rounded-lg bg-clinical-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-clinical-900 disabled:opacity-50"
                                        >
                                          {assigning === row.userId ? "Saving…" : "Add"}
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                )}
              </section>
            ) : null}

            {tab === "billing" ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                <h2 className="text-lg font-semibold text-slate-900">Billing payment requests</h2>
                {paymentError ? <p className="mt-3 text-sm text-red-700">{paymentError}</p> : null}
                {paymentReqs === null ? (
                  <p className="mt-4 text-sm text-slate-600">Loading payment requests…</p>
                ) : paymentReqs.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-600">No payment requests yet.</p>
                ) : (
                  <div className="mt-4 max-h-[min(70vh,32rem)] overflow-auto rounded-lg border border-slate-100">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead className="sticky top-0 z-[1] bg-slate-50 shadow-sm">
                        <tr className="border-b border-slate-200 text-slate-600">
                          <th className="py-2 pl-3 pr-4 font-medium">Submitted</th>
                          <th className="py-2 pr-4 font-medium">Patient</th>
                          <th className="py-2 pr-4 font-medium">Amount</th>
                          <th className="py-2 pr-4 font-medium">Treatment</th>
                          <th className="py-2 pr-4 font-medium">Mode</th>
                          <th className="py-2 pr-4 font-medium">Dates</th>
                          <th className="py-2 pr-4 font-medium">Status</th>
                          <th className="py-2 pr-4 font-medium">Attachment</th>
                          <th className="py-2 pr-3 font-medium">Review</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentReqs.map((r) => (
                          <tr key={r.id} className="border-b border-slate-100 align-top">
                            <td className="whitespace-nowrap py-2 pl-3 pr-4 text-slate-800">
                              {formatWhen(r.createdAt)}
                            </td>
                            <td className="py-2 pr-4">
                              <div className="text-slate-900">{r.patientDisplayName || "—"}</div>
                              <div className="text-xs text-slate-500">{r.patientEmail}</div>
                            </td>
                            <td className="py-2 pr-4 text-slate-800">{r.amount}</td>
                            <td className="py-2 pr-4">{formatTreatment(r.treatmentType)}</td>
                            <td className="max-w-[10rem] py-2 pr-4 break-words text-slate-700">
                              {r.paymentMode}
                            </td>
                            <td className="whitespace-nowrap py-2 pr-4 text-xs text-slate-600">
                              Pay {r.paymentOn}
                              <br />
                              Valid {r.validUntil}
                            </td>
                            <td className="py-2 pr-4 capitalize text-slate-800">{r.status}</td>
                            <td className="max-w-[12rem] py-2 pr-4">
                              {r.hasProof ? (
                                <button
                                  type="button"
                                  title={r.originalFilename || "Download attachment"}
                                  className="max-w-full truncate text-left text-sm font-medium text-clinical-700 underline decoration-clinical-600/40 underline-offset-2 hover:text-clinical-900"
                                  onClick={() =>
                                    void downloadPaymentRequestProof(
                                      r.id,
                                      r.originalFilename || "payment-proof"
                                    ).catch((e) => setPaymentError(errorMessageFromUnknown(e)))
                                  }
                                >
                                  {r.originalFilename?.trim() || "Attachment"}
                                </button>
                              ) : (
                                <span className="text-sm text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              {r.status === "pending" ? (
                                <select
                                  key={`${r.id}-${r.status}`}
                                  defaultValue=""
                                  disabled={approvingId === r.id}
                                  className="max-w-[11rem] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 disabled:opacity-50"
                                  onChange={(e) => {
                                    const el = e.currentTarget;
                                    const v = el.value as "" | "approve" | "reject";
                                    if (!v) return;
                                    el.value = "";
                                    void reviewPaymentRequest(r.id, v);
                                  }}
                                >
                                  <option value="">Choose action…</option>
                                  <option value="approve">Approve</option>
                                  <option value="reject">Reject</option>
                                </select>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : null}

            {tab === "ai-logs" ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                <h2 className="text-lg font-semibold text-slate-900">AI logs</h2>
                <p className="mt-2 text-sm text-slate-600">
                  LLM and embedding usage recorded by the backend: request counts, token totals
                  (prompt / completion / total), latency, errors, and breakdowns by day, model,
                  source, and operation. Lifetime totals include all history; the selected range
                  drives daily charts and segment tables.
                </p>
                {aiLogsError ? <p className="mt-3 text-sm text-red-700">{aiLogsError}</p> : null}
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="text-sm text-slate-700">
                    <span className="mb-1 block text-xs font-medium text-slate-500">From</span>
                    <input
                      type="date"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      value={aiLogFrom}
                      onChange={(e) => setAiLogFrom(e.target.value)}
                    />
                  </label>
                  <label className="text-sm text-slate-700">
                    <span className="mb-1 block text-xs font-medium text-slate-500">To</span>
                    <input
                      type="date"
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      value={aiLogTo}
                      onChange={(e) => setAiLogTo(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={aiLogsLoading}
                    onClick={() => void reloadAiLogsWithRange()}
                    className="rounded-lg bg-clinical-600 px-4 py-2 text-sm font-medium text-white hover:bg-clinical-900 disabled:opacity-50"
                  >
                    {aiLogsLoading ? "Loading…" : "Apply range"}
                  </button>
                </div>
                {aiLogsLoading && !aiLogs ? (
                  <p className="mt-6 text-sm text-slate-600">Loading AI usage…</p>
                ) : aiLogs ? (
                  <div className="mt-6 space-y-8">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-slate-800">All time (entire database)</p>
                        <p className="text-xs text-slate-500">
                          First event: {aiLogs.lifetime.firstEventAt ? formatWhen(aiLogs.lifetime.firstEventAt) : "—"}
                          {" · "}
                          Last: {aiLogs.lifetime.lastEventAt ? formatWhen(aiLogs.lifetime.lastEventAt) : "—"}
                        </p>
                        <AiTotalsCards title="Lifetime totals" t={aiLogs.lifetime.totals} />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-slate-800">
                          Selected range ({aiLogs.range.from} → {aiLogs.range.to})
                        </p>
                        <p className="text-xs text-slate-500">
                          First in range:{" "}
                          {aiLogs.inRange.firstEventAt ? formatWhen(aiLogs.inRange.firstEventAt) : "—"}
                          {" · "}
                          Last: {aiLogs.inRange.lastEventAt ? formatWhen(aiLogs.inRange.lastEventAt) : "—"}
                        </p>
                        <AiTotalsCards title="Range totals" t={aiLogs.inRange.totals} />
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Daily usage (selected range)</h3>
                      <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-100">
                        {aiLogs.inRange.byDay.length === 0 ? (
                          <p className="p-4 text-sm text-slate-500">No calls in this date range.</p>
                        ) : (
                          <table className="min-w-full border-collapse text-left text-sm">
                            <thead className="sticky top-0 z-[1] bg-slate-50 shadow-sm">
                              <tr className="border-b border-slate-200 text-slate-600">
                                <th className="py-2 pl-3 pr-4 font-medium">Date</th>
                                <th className="py-2 pr-4 text-right font-medium">Requests</th>
                                <th className="py-2 pr-4 text-right font-medium">Prompt tok</th>
                                <th className="py-2 pr-4 text-right font-medium">Completion tok</th>
                                <th className="py-2 pr-4 text-right font-medium">Total tok</th>
                                <th className="py-2 pr-4 text-right font-medium">Avg ms</th>
                                <th className="py-2 pr-3 text-right font-medium">Errors</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...aiLogs.inRange.byDay].reverse().map((r) => (
                                <tr key={r.date} className="border-b border-slate-100">
                                  <td className="py-2 pl-3 pr-4 text-slate-900">{r.date}</td>
                                  <td className="py-2 pr-4 text-right tabular-nums">{fmtInt(r.requests)}</td>
                                  <td className="py-2 pr-4 text-right tabular-nums text-slate-700">
                                    {fmtInt(r.promptTokens)}
                                  </td>
                                  <td className="py-2 pr-4 text-right tabular-nums text-slate-700">
                                    {fmtInt(r.completionTokens)}
                                  </td>
                                  <td className="py-2 pr-4 text-right tabular-nums font-medium text-slate-900">
                                    {fmtInt(r.totalTokens)}
                                  </td>
                                  <td className="py-2 pr-4 text-right tabular-nums text-slate-600">
                                    {r.avgLatencyMs != null ? fmtInt(Math.round(r.avgLatencyMs)) : "—"}
                                  </td>
                                  <td className="py-2 pr-3 text-right text-red-800">{fmtInt(r.errors)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">By model</h3>
                        <div className="mt-2">
                          <AiBreakdownTable
                            rows={aiLogs.inRange.byModel}
                            labelHeader="Model"
                            labelOf={(r) => r.model ?? ""}
                          />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">By source</h3>
                        <p className="mt-0.5 text-xs text-slate-500">Caller (e.g. agent name)</p>
                        <div className="mt-2">
                          <AiBreakdownTable
                            rows={aiLogs.inRange.bySource}
                            labelHeader="Source"
                            labelOf={(r) => r.source ?? ""}
                          />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">By operation</h3>
                        <p className="mt-0.5 text-xs text-slate-500">chat · chat_vision · embedding</p>
                        <div className="mt-2">
                          <AiBreakdownTable
                            rows={aiLogs.inRange.byOperation}
                            labelHeader="Operation"
                            labelOf={(r) => r.operation ?? ""}
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Recent calls (selected range)</h3>
                      <div className="mt-2">
                        <AiRecentTable
                          rows={aiLogs.recentEventsInRange}
                          emptyHint="No individual events in this range yet."
                        />
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Recent calls (all time, latest 80)
                      </h3>
                      <div className="mt-2">
                        <AiRecentTable
                          rows={aiLogs.recentEvents}
                          emptyHint="No AI calls logged yet. Usage appears after patients or doctors trigger LLM features."
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {tab === "users" ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                <h2 className="text-lg font-semibold text-slate-900">User management</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Suspend sign-in for a patient or doctor, or remove their portal profile. Removed
                  users cannot log in and no longer appear in booking search; historical activity
                  remains linked to their user id.
                </p>
                {usersError ? <p className="mt-3 text-sm text-red-700">{usersError}</p> : null}
                {portalUsers === null ? (
                  <p className="mt-4 text-sm text-slate-600">Loading users…</p>
                ) : usersError ? (
                  <p className="mt-4 text-sm text-slate-600">
                    The list could not be loaded. Confirm Flask is running,{" "}
                    <code className="rounded bg-slate-100 px-1 text-xs">BACKEND_URL</code> in Next points at it,
                    and you are logged in as an admin, then open this tab again.
                  </p>
                ) : portalUsers.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-600">No patient or doctor accounts yet.</p>
                ) : (
                  <div className="mt-4 max-h-[min(70vh,32rem)] overflow-auto rounded-lg border border-slate-100">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead className="sticky top-0 z-[1] bg-slate-50 shadow-sm">
                        <tr className="border-b border-slate-200 text-slate-600">
                          <th className="py-2 pl-3 pr-4 font-medium">Name</th>
                          <th className="py-2 pr-4 font-medium">Email</th>
                          <th className="py-2 pr-4 font-medium">Role</th>
                          <th className="py-2 pr-4 font-medium">Verified</th>
                          <th className="py-2 pr-4 font-medium">Status</th>
                          <th className="py-2 pr-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portalUsers.map((row) => {
                          const rowBusy =
                            userActionId === `block:${row.userId}` ||
                            userActionId === `remove:${row.userId}`;
                          const removed = row.accountRemoved;
                          const statusParts: string[] = [];
                          if (removed) statusParts.push("Profile removed");
                          else if (row.accessBlocked) statusParts.push("Access blocked");
                          else statusParts.push("Active");
                          return (
                            <tr key={row.userId} className="border-b border-slate-100 align-top">
                              <td className="py-2 pl-3 pr-4 text-slate-900">{row.displayName}</td>
                              <td className="py-2 pr-4 text-slate-600">{row.email}</td>
                              <td className="py-2 pr-4 capitalize text-slate-800">{row.role}</td>
                              <td className="py-2 pr-4 text-slate-800">{row.isVerified ? "Yes" : "No"}</td>
                              <td className="max-w-[14rem] py-2 pr-4 text-xs text-slate-600">
                                {statusParts.join(" · ")}
                                {row.removedAt ? (
                                  <>
                                    <br />
                                    <span className="text-slate-500">Removed {formatWhen(row.removedAt)}</span>
                                  </>
                                ) : null}
                              </td>
                              <td className="space-y-1 py-2 pr-3">
                                <button
                                  type="button"
                                  disabled={removed || rowBusy}
                                  className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
                                  onClick={() => void toggleUserBlocked(row)}
                                >
                                  {userActionId === `block:${row.userId}`
                                    ? "…"
                                    : row.accessBlocked
                                      ? "Unblock access"
                                      : "Block access"}
                                </button>
                                <button
                                  type="button"
                                  disabled={removed || rowBusy}
                                  className="block w-full rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-900 hover:bg-red-100 disabled:opacity-40"
                                  onClick={() => void removeUserProfile(row)}
                                >
                                  {userActionId === `remove:${row.userId}` ? "…" : "Remove profile"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : null}

            {tab === "leads" ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                <h2 className="text-lg font-semibold text-slate-900">
                  Prospective clients &amp; enquiries
                </h2>
                {leadsError ? (
                  <p className="mt-3 text-sm text-red-700">{leadsError}</p>
                ) : leads === null ? (
                  <p className="mt-4 text-sm text-slate-600">Loading…</p>
                ) : leads.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-600">
                    No enquiries yet, or sign in as admin to view this list.
                  </p>
                ) : (
                  <div className="mt-4 max-h-[min(70vh,32rem)] overflow-auto rounded-lg border border-slate-100">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead className="sticky top-0 z-[1] bg-slate-50 shadow-sm">
                        <tr className="border-b border-slate-200 text-slate-600">
                          <th className="py-2 pl-3 pr-4 font-medium">Submitted</th>
                          <th className="py-2 pr-4 font-medium">Name</th>
                          <th className="py-2 pr-4 font-medium">Mobile</th>
                          <th className="py-2 pr-4 font-medium">Email</th>
                          <th className="py-2 pr-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leads.map((r) => (
                          <tr key={r.id} className="border-b border-slate-100">
                            <td className="whitespace-nowrap py-2 pl-3 pr-4 text-slate-800">
                              {formatWhen(r.createdAt)}
                            </td>
                            <td className="py-2 pr-4">{r.name}</td>
                            <td className="py-2 pr-4">{r.mobile}</td>
                            <td className="py-2 pr-4">{r.email}</td>
                            <td className="py-2 pr-3">
                              <button
                                type="button"
                                disabled={deletingLeadId === r.id}
                                className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-900 hover:bg-red-100 disabled:opacity-50"
                                onClick={() => void deleteLeadRow(r)}
                              >
                                {deletingLeadId === r.id ? "Deleting…" : "Delete"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminHomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-600">
          Loading…
        </div>
      }
    >
      <AdminDashboardInner />
    </Suspense>
  );
}
