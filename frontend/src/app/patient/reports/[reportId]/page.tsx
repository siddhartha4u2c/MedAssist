"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  deletePatientReport,
  downloadPatientReportAnalysisPdf,
  downloadPatientReportOriginal,
  errorMessageFromUnknown,
  fetchPatientReportDetail,
  type PatientReportAiAnalysis,
  type PatientReportRow,
} from "@/lib/api-client";

function AnalysisSections({ a }: { a: PatientReportAiAnalysis }) {
  const list = (xs: string[] | undefined, title: string) =>
    xs?.length ? (
      <div className="mt-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-800">
          {xs.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
    ) : null;

  const vals = a.extractedValues;
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4">
      {a.summaryForPatient ? (
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{a.summaryForPatient}</p>
        </div>
      ) : null}
      {list(a.findingsNormal, "Within normal / reassuring")}
      {list(a.findingsAbnormalOrNotable, "Notable or abnormal findings")}
      {vals?.length ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-slate-900">Values mentioned</h3>
          <div className="mt-2 overflow-x-auto rounded border border-slate-200 bg-white text-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2">Test</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">Ref / flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vals.map((v, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{v.name || "—"}</td>
                    <td className="px-3 py-2">{v.value ?? "—"}</td>
                    <td className="px-3 py-2">{v.unit || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {[v.referenceOrRange, v.flag].filter(Boolean).join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {a.imagingInterpretation?.trim() ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-slate-900">Imaging / X-ray interpretation</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{a.imagingInterpretation}</p>
        </div>
      ) : null}
      {list(a.recommendedActions, "Recommended actions")}
      {a.urgency ? (
        <p className="mt-4 text-sm text-slate-700">
          <span className="font-medium">Suggested urgency:</span> {a.urgency}
        </p>
      ) : null}
      {a.disclaimer ? (
        <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-600">{a.disclaimer}</p>
      ) : null}
    </div>
  );
}

export default function PatientReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = typeof params?.reportId === "string" ? params.reportId : "";
  const [row, setRow] = useState<PatientReportRow | null>(null);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reportActionBusy, setReportActionBusy] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchPatientReportDetail(reportId);
        if (!cancelled) setRow(r.report);
      } catch (e) {
        if (!cancelled) setError(errorMessageFromUnknown(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  async function confirmDeleteReport() {
    if (!reportId || !row) return;
    setReportActionBusy(true);
    setError("");
    try {
      await deletePatientReport(reportId);
      setConfirmingDelete(false);
      router.push("/patient/reports");
    } catch (e) {
      setError(errorMessageFromUnknown(e));
    } finally {
      setReportActionBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <Link href="/patient/reports" className="text-sm text-clinical-700 hover:underline">
        ← All reports
      </Link>

      {error ? (
        <p className="mt-4 text-sm text-red-700">{error}</p>
      ) : !row ? (
        <p className="mt-4 text-sm text-slate-600">Loading…</p>
      ) : (
        <>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">{row.title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Uploaded {row.createdAt}
            {row.analyzedAt ? ` · Analyzed ${row.analyzedAt}` : ""}
            {row.reportType ? ` · Type: ${row.reportType}` : ""}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {row.hasAttachment ? (
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                onClick={() =>
                  downloadPatientReportOriginal(
                    row.id,
                    row.originalFilename || "report"
                  ).catch((e) => setError(errorMessageFromUnknown(e)))
                }
              >
                Download original file
              </button>
            ) : null}
            {row.aiAnalysisStatus === "completed" && row.aiAnalysis ? (
              <button
                type="button"
                className="rounded-lg bg-clinical-600 px-3 py-2 text-sm font-medium text-white hover:bg-clinical-900"
                onClick={() =>
                  downloadPatientReportAnalysisPdf(row.id).catch((e) =>
                    setError(errorMessageFromUnknown(e))
                  )
                }
              >
                Analysis report
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-50"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete report
            </button>
          </div>

          {row.summary ? (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-slate-900">Your notes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{row.summary}</p>
            </div>
          ) : null}

          {row.aiAnalysisStatus === "failed" && row.aiError ? (
            <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Analysis could not be completed: {row.aiError}
            </p>
          ) : null}

          {row.aiAnalysis ? (
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-slate-900">AI analysis (Report Reader)</h2>
              <AnalysisSections a={row.aiAnalysis} />
            </div>
          ) : row.hasAttachment && row.aiAnalysisStatus !== "failed" ? (
            <p className="mt-6 text-sm text-slate-600">No structured analysis stored for this report.</p>
          ) : null}

          {confirmingDelete ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="report-detail-action-title"
            >
              <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                <h3 id="report-detail-action-title" className="text-sm font-semibold text-slate-900">
                  Delete this report?
                </h3>
                <p className="mt-2 text-xs text-slate-600">
                  This permanently removes the entry, any uploaded file, and all stored AI output. This cannot be
                  undone.
                </p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={reportActionBusy}
                    onClick={() => setConfirmingDelete(false)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={reportActionBusy}
                    onClick={() => void confirmDeleteReport()}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {reportActionBusy ? "Working…" : "Delete permanently"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
