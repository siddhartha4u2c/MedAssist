"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPatientPaymentRequest,
  downloadPaymentRequestProof,
  errorMessageFromUnknown,
  fetchPatientPaymentRequests,
  type PatientPaymentRequestRow,
} from "@/lib/api-client";
import { getStoredAccessToken } from "@/lib/auth-storage";

const TREATMENT_OPTIONS = [
  { value: "consultation", label: "Consultation" },
  { value: "diagnosis", label: "Diagnosis" },
  { value: "medical_tests", label: "Medical tests" },
  { value: "surgery", label: "Surgery" },
  { value: "others", label: "Others" },
] as const;

function formatTreatment(v: string): string {
  const row = TREATMENT_OPTIONS.find((o) => o.value === v);
  return row?.label ?? v;
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "approved") {
    return "bg-emerald-100 text-emerald-900 ring-emerald-600/20";
  }
  if (s === "rejected") {
    return "bg-rose-100 text-rose-900 ring-rose-600/20";
  }
  return "bg-amber-100 text-amber-900 ring-amber-600/20";
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

export default function PatientBillingPage() {
  const [rows, setRows] = useState<PatientPaymentRequestRow[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [treatmentType, setTreatmentType] = useState<string>("consultation");
  const [paymentMode, setPaymentMode] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [validTill, setValidTill] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitOk, setSubmitOk] = useState("");
  const [detailRequest, setDetailRequest] = useState<PatientPaymentRequestRow | null>(null);

  const reload = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) {
      setRows([]);
      return;
    }
    const data = await fetchPatientPaymentRequests();
    setRows(data.requests);
  }, []);

  useEffect(() => {
    if (!detailRequest) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setDetailRequest(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [detailRequest]);

  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    reload()
      .catch((e) => {
        if (!cancelled) {
          setLoadError(errorMessageFromUnknown(e));
          setRows([]);
        }
      })
      .then(() => {
        if (cancelled) return;
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  function openModal() {
    setSubmitError("");
    setSubmitOk("");
    setAmount("");
    setTreatmentType("consultation");
    setPaymentMode("");
    setPaymentDate("");
    setValidTill("");
    setProofFile(null);
    setModalOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    setSubmitOk("");
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("amount", amount.trim());
      fd.set("treatmentType", treatmentType);
      fd.set("paymentMode", paymentMode.trim());
      fd.set("paymentDate", paymentDate);
      fd.set("validTill", validTill);
      if (proofFile) {
        fd.set("proof", proofFile);
      }
      const res = await createPatientPaymentRequest(fd);
      setSubmitOk(res.message || "Submitted.");
      setModalOpen(false);
      await reload();
    } catch (err) {
      setSubmitError(errorMessageFromUnknown(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Billing details</h1>
        <p className="mt-2 text-sm text-slate-600">
          Generate a payment request for the admin team to review. After approval, the status
          appears as approved below. You can attach a screenshot, photo, or PDF as proof of payment
          mode when applicable.
        </p>
        <button
          type="button"
          onClick={openModal}
          className="mt-6 rounded-lg bg-clinical-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-clinical-900"
        >
          Generate payment request
        </button>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Your payment requests</h2>
        <p className="mt-1 text-xs text-slate-500">
          Tap a request to open it full screen—easier to capture a screenshot on your phone.
        </p>
        {loadError ? <p className="mt-3 text-sm text-red-700">{loadError}</p> : null}
        {rows === null && !loadError ? (
          <p className="mt-4 text-sm text-slate-600">Loading…</p>
        ) : rows && rows.length === 0 && !loadError ? (
          <p className="mt-4 text-sm text-slate-600">No requests yet.</p>
        ) : rows && rows.length > 0 ? (
          <ul className="mt-4 space-y-4">
            {rows.map((r) => (
              <li
                key={r.id}
                className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50/80 text-sm shadow-sm"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetailRequest(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDetailRequest(r);
                    }
                  }}
                  className="cursor-pointer p-4 text-left transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-clinical-600"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">
                      {r.amount ? `${r.amount} · ` : ""}
                      {formatTreatment(r.treatmentType)}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadge(r.status)}`}
                    >
                      {r.status === "approved"
                        ? "Approved"
                        : r.status === "pending"
                          ? "Pending"
                          : r.status}
                    </span>
                  </div>
                  <p className="mt-2 text-slate-600">
                    Mode: <span className="text-slate-800">{r.paymentMode}</span>
                    {" · "}
                    Payment date: {r.paymentOn || "—"}
                    {" · "}
                    Valid till: {r.validUntil || "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Submitted {formatWhen(r.createdAt)}</p>
                </div>
                {r.hasProof ? (
                  <div className="flex flex-wrap gap-3 border-t border-slate-100 bg-white px-4 py-3">
                    <button
                      type="button"
                      className="text-xs font-medium text-clinical-700 underline hover:text-clinical-900"
                      onClick={() =>
                        void downloadPaymentRequestProof(
                          r.id,
                          r.originalFilename || "payment-proof"
                        ).catch((err) => alert(errorMessageFromUnknown(err)))
                      }
                    >
                      Download proof attachment
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {detailRequest ? (
        <div
          className="fixed inset-0 z-[60] flex min-h-0 flex-col bg-white pb-[env(safe-area-inset-bottom,0px)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-request-detail-title"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <h2 id="payment-request-detail-title" className="text-base font-semibold text-slate-900">
              Payment request
            </h2>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDetailRequest(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6">
            <div className="mx-auto max-w-lg space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  {detailRequest.amount || "—"}
                </p>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${statusBadge(detailRequest.status)}`}
                >
                  {detailRequest.status === "approved"
                    ? "Approved"
                    : detailRequest.status === "pending"
                      ? "Pending"
                      : detailRequest.status}
                </span>
              </div>
              <dl className="space-y-4 text-base text-slate-700 sm:text-lg">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 sm:text-sm">
                    Treatment
                  </dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {formatTreatment(detailRequest.treatmentType)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 sm:text-sm">
                    Mode of payment
                  </dt>
                  <dd className="mt-1 font-medium text-slate-900">{detailRequest.paymentMode || "—"}</dd>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 sm:text-sm">
                      Payment date
                    </dt>
                    <dd className="mt-1 font-medium text-slate-900">{detailRequest.paymentOn || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 sm:text-sm">
                      Valid till
                    </dt>
                    <dd className="mt-1 font-medium text-slate-900">{detailRequest.validUntil || "—"}</dd>
                  </div>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 sm:text-sm">
                    Submitted
                  </dt>
                  <dd className="mt-1 font-medium text-slate-900">{formatWhen(detailRequest.createdAt)}</dd>
                </div>
                {detailRequest.reviewedAt ? (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 sm:text-sm">
                      Reviewed
                    </dt>
                    <dd className="mt-1 font-medium text-slate-900">{formatWhen(detailRequest.reviewedAt)}</dd>
                  </div>
                ) : null}
              </dl>
              {detailRequest.hasProof ? (
                <button
                  type="button"
                  className="w-full rounded-xl border-2 border-clinical-200 bg-clinical-50 py-3 text-base font-semibold text-clinical-900 hover:bg-clinical-100 sm:text-lg"
                  onClick={() =>
                    void downloadPaymentRequestProof(
                      detailRequest.id,
                      detailRequest.originalFilename || "payment-proof"
                    ).catch((err) => alert(errorMessageFromUnknown(err)))
                  }
                >
                  Download proof attachment
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(ev) => {
            if (ev.target === ev.currentTarget) setModalOpen(false);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-labelledby="billing-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="billing-modal-title" className="text-lg font-semibold text-slate-900">
              Generate payment request
            </h2>
            <form className="mt-4 space-y-4" onSubmit={(e) => void onSubmit(e)}>
              <div>
                <label className="block text-xs font-medium text-slate-700" htmlFor="amt">
                  Amount
                </label>
                <input
                  id="amt"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="e.g. 1500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700" htmlFor="tr">
                  Treatment
                </label>
                <select
                  id="tr"
                  value={treatmentType}
                  onChange={(e) => setTreatmentType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {TREATMENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700" htmlFor="mode">
                  Mode of payment
                </label>
                <input
                  id="mode"
                  type="text"
                  required
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="e.g. UPI, bank transfer, card"
                  maxLength={120}
                />
              </div>
              <div>
                <span className="block text-xs font-medium text-slate-700">Attach proof (optional)</span>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <input
                    id="billing-proof-file"
                    type="file"
                    accept="image/jpeg,image/png,image/jpg,application/pdf,.pdf,.jpg,.jpeg,.png"
                    className="sr-only"
                    onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                  />
                  <label
                    htmlFor="billing-proof-file"
                    className="inline-flex cursor-pointer rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200"
                  >
                    Choose file
                  </label>
                  {proofFile ? (
                    <span className="text-sm text-slate-700">{proofFile.name}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">Screenshot, photo, or PDF (max 15 MB).</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700" htmlFor="pd">
                    Payment date
                  </label>
                  <input
                    id="pd"
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700" htmlFor="vt">
                    Valid till
                  </label>
                  <input
                    id="vt"
                    type="date"
                    required
                    value={validTill}
                    onChange={(e) => setValidTill(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {submitError ? <p className="text-sm text-red-700">{submitError}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-clinical-600 px-4 py-2 text-sm font-medium text-white hover:bg-clinical-900 disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Submit request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {submitOk ? (
        <p className="mt-4 text-center text-sm text-emerald-800" role="status">
          {submitOk}
        </p>
      ) : null}
    </main>
  );
}
