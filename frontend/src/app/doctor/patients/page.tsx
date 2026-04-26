"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  errorMessageFromUnknown,
  fetchDoctorMyPatients,
  type DoctorMyPatientRow,
} from "@/lib/api-client";

export default function DoctorMyPatientsPage() {
  const [rows, setRows] = useState<DoctorMyPatientRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchDoctorMyPatients();
        if (!cancelled) setRows(r.patients);
      } catch (e) {
        if (!cancelled) setError(errorMessageFromUnknown(e));
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">My patients</h1>
      <p className="mt-2 text-sm text-slate-600">
        Patients assigned to you by an administrator appear here. Open a patient to review profile,
        medications, reports, and edit their care plan.
      </p>

      {error ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {rows === null ? (
        <p className="mt-8 text-slate-600">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-950">
          No patients assigned yet. An admin can link your account to patients from the admin portal.
        </p>
      ) : (
        <ul className="mt-8 space-y-2">
          {rows.map((p) => (
            <li key={p.patientUserId}>
              <Link
                href={`/doctor/patients/${encodeURIComponent(p.patientUserId)}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-clinical-300 hover:bg-clinical-50/30"
              >
                <div>
                  <p className="font-medium text-slate-900">{p.displayName}</p>
                  <p className="text-sm text-slate-500">{p.email}</p>
                </div>
                <span className="text-xs font-medium text-clinical-700">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
