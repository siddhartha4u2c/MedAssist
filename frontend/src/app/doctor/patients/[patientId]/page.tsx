"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  errorMessageFromUnknown,
  fetchDoctorPatientCarePlan,
  fetchDoctorPatientMedications,
  fetchDoctorPatientProfileView,
  fetchDoctorPatientReports,
  fetchDoctorPatientSummary,
  saveDoctorPatientCarePlan,
  saveDoctorPatientMedications,
  type PatientReportRow,
} from "@/lib/api-client";
import {
  emptyMedicationRow,
  MEDICATION_FORM_OPTIONS,
  parseMedicationsFromStorage,
  serializeMedicationsToStorage,
  type MedicationRow,
} from "@/lib/patient-medications-storage";

type Tab = "profile" | "medications" | "reports" | "care";

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number | boolean | null | undefined | "";
}) {
  const s =
    value === null || value === undefined || value === ""
      ? "—"
      : typeof value === "boolean"
        ? value
          ? "Yes"
          : "No"
        : String(value);
  return (
    <div className="border-b border-slate-100 py-2 last:border-0">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">{s}</p>
    </div>
  );
}

export default function DoctorPatientDetailPage() {
  const params = useParams();
  const patientId = typeof params.patientId === "string" ? params.patientId : "";

  const [tab, setTab] = useState<Tab>("profile");
  const [summary, setSummary] = useState<{ displayName: string; email: string } | null>(null);
  const [loadErr, setLoadErr] = useState("");

  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [medicationsText, setMedicationsText] = useState("");
  const [reports, setReports] = useState<PatientReportRow[]>([]);
  const [careText, setCareText] = useState("");
  const [careDraft, setCareDraft] = useState("");
  const [careMsg, setCareMsg] = useState("");
  const [savingCare, setSavingCare] = useState(false);

  const [medRows, setMedRows] = useState<MedicationRow[]>([emptyMedicationRow()]);
  const [medMsg, setMedMsg] = useState("");
  const [savingMed, setSavingMed] = useState(false);

  const loadAll = useCallback(async () => {
    if (!patientId) return;
    setLoadErr("");
    try {
      const s = await fetchDoctorPatientSummary(patientId);
      setSummary({ displayName: s.displayName, email: s.email });
      const [pv, med, rep, cp] = await Promise.all([
        fetchDoctorPatientProfileView(patientId),
        fetchDoctorPatientMedications(patientId),
        fetchDoctorPatientReports(patientId),
        fetchDoctorPatientCarePlan(patientId),
      ]);
      setProfile((pv.profile || {}) as Record<string, unknown>);
      setMedicationsText(med.currentMedications || "");
      setReports(rep.reports || []);
      const c = cp.carePlanText || "";
      setCareText(c);
      setCareDraft(c);
    } catch (e) {
      setLoadErr(errorMessageFromUnknown(e));
      setSummary(null);
    }
  }, [patientId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!patientId) return;
    const parsed = parseMedicationsFromStorage(medicationsText || "");
    if (parsed.legacyText) {
      setMedRows([{ ...emptyMedicationRow(), notes: parsed.legacyText }]);
    } else {
      setMedRows(
        parsed.rows.length ? parsed.rows.map((r) => ({ ...r })) : [emptyMedicationRow()]
      );
    }
  }, [patientId, medicationsText]);

  function updateMedRow(id: string, patch: Partial<MedicationRow>) {
    setMedMsg("");
    setMedRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addMedRow() {
    setMedMsg("");
    setMedRows((prev) => [...prev, emptyMedicationRow()]);
  }

  function addFiveMedRows() {
    setMedMsg("");
    setMedRows((prev) => [...prev, ...Array.from({ length: 5 }, () => emptyMedicationRow())]);
  }

  function removeMedRow(id: string) {
    setMedMsg("");
    setMedRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : [emptyMedicationRow()];
    });
  }

  async function saveMedications() {
    if (!patientId) return;
    setMedMsg("");
    setSavingMed(true);
    try {
      const raw = serializeMedicationsToStorage(medRows);
      const r = await saveDoctorPatientMedications(patientId, raw);
      setMedicationsText(r.currentMedications);
      setMedMsg("Medications saved.");
    } catch (e) {
      setMedMsg(errorMessageFromUnknown(e));
    } finally {
      setSavingMed(false);
    }
  }

  async function saveCare() {
    if (!patientId) return;
    setCareMsg("");
    setSavingCare(true);
    try {
      const r = await saveDoctorPatientCarePlan(patientId, careDraft);
      setCareText(r.carePlanText);
      setCareMsg("Care plan saved.");
    } catch (e) {
      setCareMsg(errorMessageFromUnknown(e));
    } finally {
      setSavingCare(false);
    }
  }

  if (!patientId) {
    return <p className="text-red-700">Invalid patient.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href="/doctor/patients" className="font-medium text-clinical-700 hover:underline">
          ← My patients
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">
        {summary?.displayName || "Patient"}
      </h1>
      <p className="text-sm text-slate-600">{summary?.email}</p>

      {loadErr ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {loadErr}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-px">
        {(
          [
            ["profile", "Profile"],
            ["medications", "Medications"],
            ["reports", "Reports"],
            ["care", "Care plan"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={
              tab === k
                ? "rounded-t-lg border border-b-0 border-slate-200 bg-white px-4 py-2 text-sm font-medium text-clinical-900"
                : "rounded-t-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-b-xl rounded-tr-xl border border-t-0 border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        {tab === "profile" && profile && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Full name" value={profile.fullName as string} />
            <Field label="Age" value={profile.age as string | number} />
            <Field label="Gender" value={profile.gender as string} />
            <Field label="Phone" value={profile.phone as string} />
            <Field label="Emergency contact" value={profile.emergencyContact as string} />
            <Field label="Blood group" value={profile.bloodGroup as string} />
            <Field label="Allergies" value={profile.allergies as string} />
            <Field label="Chronic conditions" value={profile.chronicConditions as string} />
            <Field label="Primary doctor (self-reported)" value={profile.primaryDoctor as string} />
            <Field label="Insurance" value={profile.insuranceProvider as string} />
            <div className="sm:col-span-2">
              <Field label="Medical history" value={profile.medicalHistory as string} />
            </div>
          </div>
        )}

        {tab === "medications" && (
          <div>
            <p className="text-sm text-slate-600">
              Edit this patient&apos;s medication list. Patients see a read-only copy and can download a
              PDF. Add several rows at once with &quot;Add 5 medications&quot; when you are entering
              multiple items.
            </p>
            {medMsg ? (
              <p
                className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                  medMsg.includes("saved") || medMsg.includes("Saved")
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-800"
                }`}
                role="status"
              >
                {medMsg}
              </p>
            ) : null}
            <div className="mt-4 space-y-6">
              {medRows.map((r, index) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Medication {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeMedRow(r.id)}
                      className="text-xs font-medium text-rose-700 hover:text-rose-900"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Date</span>
                      <input
                        type="date"
                        value={r.date}
                        onChange={(e) => updateMedRow(r.id, { date: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Doctor name</span>
                      <input
                        type="text"
                        value={r.doctorName}
                        onChange={(e) => updateMedRow(r.id, { doctorName: e.target.value })}
                        placeholder="e.g. Dr. Sharma"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        maxLength={200}
                      />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="font-medium text-slate-700">Medicine</span>
                      <input
                        type="text"
                        value={r.medicineName}
                        onChange={(e) => updateMedRow(r.id, { medicineName: e.target.value })}
                        placeholder="Medicine name"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        maxLength={300}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Form</span>
                      <select
                        value={r.form}
                        onChange={(e) =>
                          updateMedRow(r.id, { form: e.target.value as MedicationRow["form"] })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      >
                        {MEDICATION_FORM_OPTIONS.map((o) => (
                          <option key={o.value || "none"} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Frequency</span>
                      <input
                        type="text"
                        value={r.frequency}
                        onChange={(e) => updateMedRow(r.id, { frequency: e.target.value })}
                        placeholder="e.g. Twice daily, with meals"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        maxLength={200}
                      />
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="font-medium text-slate-700">Notes</span>
                      <textarea
                        value={r.notes}
                        onChange={(e) => updateMedRow(r.id, { notes: e.target.value })}
                        placeholder="Dosage strength, instructions, side effects to watch…"
                        rows={3}
                        className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        maxLength={2000}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={addMedRow}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Add medication
              </button>
              <button
                type="button"
                onClick={addFiveMedRows}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                Add 5 medications
              </button>
              <button
                type="button"
                onClick={() => void saveMedications()}
                disabled={savingMed}
                className="rounded-lg bg-clinical-600 px-4 py-2 text-sm font-medium text-white hover:bg-clinical-900 disabled:opacity-50"
              >
                {savingMed ? "Saving…" : "Save medications"}
              </button>
            </div>
          </div>
        )}

        {tab === "reports" && (
          <div>
            <p className="text-sm text-slate-600">
              Reports and uploads from the patient (including AI-assisted summaries). Read-only here.
            </p>
            {reports.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No reports yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {reports.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2"
                  >
                    <p className="font-medium text-slate-900">{r.title}</p>
                    <p className="text-xs text-slate-500">
                      {r.createdAt}
                      {r.hasAttachment ? " · File upload" : ""}
                      {r.aiAnalysisStatus === "completed" ? " · AI analyzed" : ""}
                    </p>
                    {r.analysisSnippet ? (
                      <p className="mt-1 text-sm text-slate-700">{r.analysisSnippet}</p>
                    ) : null}
                    {r.summary ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{r.summary}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "care" && (
          <div>
            <p className="text-sm text-slate-600">
              Edit the shared care plan for this patient. They can read it from their Care plan page.
            </p>
            {careMsg ? (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {careMsg}
              </p>
            ) : null}
            <textarea
              className="mt-4 min-h-[220px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={careDraft}
              onChange={(e) => setCareDraft(e.target.value)}
              placeholder="Goals, follow-up, lifestyle, referrals, medication notes for the care team…"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveCare()}
                disabled={savingCare}
                className="rounded-lg bg-clinical-600 px-4 py-2 text-sm font-medium text-white hover:bg-clinical-900 disabled:opacity-50"
              >
                {savingCare ? "Saving…" : "Save care plan"}
              </button>
              <button
                type="button"
                onClick={() => setCareDraft(careText)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Reset to saved
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
