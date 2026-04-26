"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { downloadPatientMedicationsPdf, errorMessageFromUnknown } from "@/lib/api-client";
import { getStoredAccessToken } from "@/lib/auth-storage";
import {
  formLabelForMedication,
  isStructuredMedicationsStorage,
  parseMedicationsFromStorage,
} from "@/lib/patient-medications-storage";

type ProfileRecord = Record<string, unknown>;

export default function PatientMedicationsPage() {
  const [profileBase, setProfileBase] = useState<ProfileRecord | null>(null);
  const [rawMedications, setRawMedications] = useState("");
  const [legacyBanner, setLegacyBanner] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfRowId, setPdfRowId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Sign in to view medications.");
      setLoading(false);
      setProfileBase(null);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/patient/profile", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = (await res.json()) as { profile?: ProfileRecord | null; error?: string };
      if (!res.ok) throw new Error(data.error || "Could not load profile.");
      const p = data.profile;
      if (!p) {
        setProfileBase({});
        setRawMedications("");
        setLegacyBanner(false);
        return;
      }
      setProfileBase({ ...p });
      const raw = String(p.currentMedications ?? "").trim();
      setRawMedications(raw);
      const parsed = parseMedicationsFromStorage(raw);
      setLegacyBanner(Boolean(parsed.legacyText));
    } catch (e) {
      setError(errorMessageFromUnknown(e));
      setProfileBase(null);
      setRawMedications("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function safeMedFilename(name: string): string {
    const base = (name || "medication").trim().slice(0, 48).replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "");
    return base || "medication";
  }

  async function onDownloadFullPdf() {
    setError("");
    setPdfLoading(true);
    setPdfRowId(null);
    try {
      await downloadPatientMedicationsPdf();
    } catch (e) {
      setError(errorMessageFromUnknown(e));
    } finally {
      setPdfLoading(false);
    }
  }

  async function onDownloadRowPdf(row: { id: string; medicineName: string }) {
    setError("");
    setPdfLoading(true);
    setPdfRowId(row.id);
    try {
      const slug = safeMedFilename(row.medicineName);
      await downloadPatientMedicationsPdf({
        rowId: row.id,
        downloadFileName: `medassist-med-${slug}.pdf`,
      });
    } catch (e) {
      setError(errorMessageFromUnknown(e));
    } finally {
      setPdfLoading(false);
      setPdfRowId(null);
    }
  }

  const parsed = parseMedicationsFromStorage(rawMedications);
  const structuredRows = isStructuredMedicationsStorage(rawMedications)
    ? parsed.rows
    : [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold text-slate-900">Medications</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your medication list is maintained by your assigned care team (or approved automation
          connected to your account). For structured lists, use{" "}
          <strong className="font-medium text-slate-800">Download PDF</strong> on each row; free-text lists use a
          single PDF for the whole list.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Other medical details stay on your{" "}
          <Link href="/patient/profile" className="font-medium text-clinical-700 hover:underline">
            Profile
          </Link>{" "}
          page.
        </p>

        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        {legacyBanner ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Your list was stored as free text. Your care team can move it into structured rows when
            they update your record.
          </p>
        ) : null}

        {rawMedications.trim() && !isStructuredMedicationsStorage(rawMedications) ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void onDownloadFullPdf()}
              disabled={pdfLoading || !profileBase}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {pdfLoading && !pdfRowId ? "Preparing PDF…" : "Download list as PDF"}
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="mt-6 text-sm text-slate-600">Loading…</p>
        ) : (
          <div className="mt-6">
            {rawMedications.trim() ? (
              isStructuredMedicationsStorage(rawMedications) ? (
                structuredRows.length === 0 ? (
                  <p className="text-sm text-slate-500">No medications listed.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-100">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-600">
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Doctor</th>
                          <th className="px-3 py-2">Medicine</th>
                          <th className="px-3 py-2">Form</th>
                          <th className="px-3 py-2">Frequency</th>
                          <th className="px-3 py-2">Notes</th>
                          <th className="whitespace-nowrap px-3 py-2 text-right">PDF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {structuredRows.map((r) => (
                          <tr key={r.id} className="border-b border-slate-100 align-top last:border-0">
                            <td className="whitespace-nowrap px-3 py-2 text-slate-900">{r.date || "—"}</td>
                            <td className="px-3 py-2 text-slate-800">{r.doctorName || "—"}</td>
                            <td className="px-3 py-2 text-slate-800">{r.medicineName || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                              {formLabelForMedication(r.form)}
                            </td>
                            <td className="px-3 py-2 text-slate-800">{r.frequency || "—"}</td>
                            <td className="max-w-[14rem] px-3 py-2 whitespace-pre-wrap text-slate-700">
                              {r.notes || "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right align-middle">
                              <button
                                type="button"
                                className="text-xs font-medium text-clinical-700 underline decoration-clinical-300 hover:text-clinical-900 disabled:opacity-50"
                                disabled={pdfLoading}
                                onClick={() => void onDownloadRowPdf(r)}
                              >
                                {pdfLoading && pdfRowId === r.id ? "…" : "Download PDF"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-900 whitespace-pre-wrap">
                  {parsed.legacyText || rawMedications}
                </div>
              )
            ) : (
              <p className="text-sm text-slate-500">No medications listed yet.</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
