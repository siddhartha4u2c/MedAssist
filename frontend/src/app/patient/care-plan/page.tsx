"use client";

import { useEffect, useState } from "react";
import { errorMessageFromUnknown, fetchPatientAssistantCarePlans } from "@/lib/api-client";

import { getStoredAccessToken } from "@/lib/auth-storage";

type Assigned = { id: string; displayName: string; email: string } | null;
type CarePlanItem = { id: string; planText: string; source: string; createdAt: string };

function apiUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
  if (!base) return `/api/v1/${path.replace(/^\/+/, "")}`;
  return `${base}/${path.replace(/^\/+/, "")}`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString();
}

export default function PatientCarePlanPage() {
  const [care, setCare] = useState("");
  const [carePlans, setCarePlans] = useState<CarePlanItem[]>([]);
  const [assigned, setAssigned] = useState<Assigned>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getStoredAccessToken();
      if (!token) {
        setError("Sign in to view your care plan.");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(apiUrl("patient/profile"), {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = (await res.json()) as {
          profile?: {
            carePlanText?: string;
            assignedDoctor?: { id: string; displayName: string; email: string } | null;
          };
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Could not load profile.");
        if (cancelled) return;
        setCare(data.profile?.carePlanText?.trim() || "");
        setAssigned(data.profile?.assignedDoctor ?? null);
        const plans = await fetchPatientAssistantCarePlans();
        if (!cancelled) setCarePlans(plans.carePlans || []);
      } catch (e) {
        if (!cancelled) setError(errorMessageFromUnknown(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">Care plan</h1>
      <p className="mt-2 text-sm text-slate-600">
        When a clinic assigns you to a doctor, they can document a shared care plan here. You can
        read it on this page; only your assigned clinician can update it.
      </p>

      {assigned ? (
        <p className="mt-4 text-sm text-slate-700">
          <span className="font-medium">Assigned clinician:</span> {assigned.displayName}
          {assigned.email ? <span className="text-slate-500"> ({assigned.email})</span> : null}
        </p>
      ) : (
        <p className="mt-4 text-sm text-amber-800">
          You are not linked to a doctor in this portal yet. Ask your administrator to complete the
          assignment.
        </p>
      )}

      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

      {loading ? (
        <p className="mt-6 text-sm text-slate-600">Loading…</p>
      ) : (
        <div className="mt-6 space-y-3">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-900 whitespace-pre-wrap">
            {care || "No care plan documented yet."}
          </div>
          {carePlans.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">AI care plan history</p>
                <p className="text-xs text-slate-600">Generated after assistant discussion sessions.</p>
              </div>
              <div className="max-h-[28rem] overflow-auto p-3">
                <div className="space-y-3">
                  {carePlans.map((it) => (
                    <article key={it.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-medium text-slate-600">{fmtDateTime(it.createdAt)}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900">{it.planText || "—"}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
