"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  createPatientReport,
  deletePatientReport,
  downloadPatientReportAnalysisPdf,
  downloadPatientReportOriginal,
  errorMessageFromUnknown,
  fetchPatientReports,
  type PatientReportRow,
  uploadPatientReportFile,
} from "@/lib/api-client";

const ACCEPT_UPLOADS = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

export default function PatientReportsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PatientReportRow[] | null>(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);

  const docFileRef = useRef<HTMLInputElement>(null);
  const [docUploadTitle, setDocUploadTitle] = useState("");
  const [docUploadNotes, setDocUploadNotes] = useState("");
  const [docReportType, setDocReportType] = useState<"lab" | "pathology" | "other">("lab");
  const [docUploadFileName, setDocUploadFileName] = useState("");

  const imgFileRef = useRef<HTMLInputElement>(null);
  const [imgUploadTitle, setImgUploadTitle] = useState("");
  const [imgUploadNotes, setImgUploadNotes] = useState("");
  const [imgReportType, setImgReportType] = useState<"radiology" | "imaging" | "other">("radiology");
  const [imgUploadFileName, setImgUploadFileName] = useState("");

  const [uploading, setUploading] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<null | { id: string; title: string }>(
    null
  );
  const [reportActionBusy, setReportActionBusy] = useState(false);
  /** Controlled reset for per-report Actions select (value always returns to ""). */
  const [reportListActionValue, setReportListActionValue] = useState<Record<string, string>>({});

  async function refresh() {
    const r = await fetchPatientReports();
    setRows(r.reports);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (cancelled) return;
      } catch (e) {
        if (!cancelled) setError(errorMessageFromUnknown(e));
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function addReport(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("Enter a title.");
      return;
    }
    setSaving(true);
    try {
      await createPatientReport({ title: title.trim(), summary: summary.trim() || undefined });
      setTitle("");
      setSummary("");
      await refresh();
    } catch (err) {
      setError(errorMessageFromUnknown(err));
    } finally {
      setSaving(false);
    }
  }

  async function onUploadDocuments(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const input = docFileRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setError("Choose a file for lab & document reports.");
      return;
    }
    setUploading(true);
    try {
      await uploadPatientReportFile({
        file,
        title: docUploadTitle.trim() || undefined,
        reportType: docReportType,
        notes: docUploadNotes.trim() || undefined,
      });
      setDocUploadTitle("");
      setDocUploadNotes("");
      setDocReportType("lab");
      if (input) input.value = "";
      setDocUploadFileName("");
      await refresh();
    } catch (err) {
      setError(errorMessageFromUnknown(err));
    } finally {
      setUploading(false);
    }
  }

  async function onUploadImaging(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const input = imgFileRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setError("Choose a file for X-rays & images.");
      return;
    }
    setUploading(true);
    try {
      await uploadPatientReportFile({
        file,
        title: imgUploadTitle.trim() || undefined,
        reportType: imgReportType,
        notes: imgUploadNotes.trim() || undefined,
      });
      setImgUploadTitle("");
      setImgUploadNotes("");
      setImgReportType("radiology");
      if (input) input.value = "";
      setImgUploadFileName("");
      await refresh();
    } catch (err) {
      setError(errorMessageFromUnknown(err));
    } finally {
      setUploading(false);
    }
  }

  function statusLabel(r: PatientReportRow): string {
    const s = r.aiAnalysisStatus || "none";
    if (s === "completed") return "Analyzed";
    if (s === "failed") return "Analysis failed";
    if (s === "processing" || s === "pending") return "Analyzing…";
    return "Text only";
  }

  function canDownloadAnalysisPdf(r: PatientReportRow): boolean {
    return (r.aiAnalysisStatus || "") === "completed";
  }

  async function confirmDeleteReport() {
    if (!reportToDelete) return;
    setError("");
    setReportActionBusy(true);
    try {
      await deletePatientReport(reportToDelete.id);
      setReportToDelete(null);
      await refresh();
    } catch (e) {
      setError(errorMessageFromUnknown(e));
    } finally {
      setReportActionBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">Reports</h1>

      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={onUploadDocuments}
          className="space-y-4 rounded-lg border border-clinical-100 bg-slate-50/90 p-5"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Lab &amp; document reports</h2>
            <p className="mt-1 text-xs text-slate-600">
              Blood work, pathology, referral letters, and other documents.{" "}
              <span className="font-mono">.pdf</span>, <span className="font-mono">.jpeg</span>,{" "}
              <span className="font-mono">.jpg</span>, <span className="font-mono">.png</span> — max 15 MB.
            </p>
          </div>
          <div>
            <span className="block text-xs font-medium text-slate-600">File</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <input
                ref={docFileRef}
                id="patient-report-file-documents"
                type="file"
                accept={ACCEPT_UPLOADS}
                className="sr-only"
                onChange={(e) => setDocUploadFileName(e.target.files?.[0]?.name ?? "")}
              />
              <label
                htmlFor="patient-report-file-documents"
                className="inline-flex cursor-pointer rounded-lg bg-clinical-600 px-3 py-2 text-sm font-medium text-white hover:bg-clinical-900"
              >
                Choose file
              </label>
              {docUploadFileName ? (
                <span className="text-sm text-slate-700">{docUploadFileName}</span>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-1">
            <div>
              <label className="block text-xs font-medium text-slate-600">Title (optional)</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={docUploadTitle}
                onChange={(e) => setDocUploadTitle(e.target.value)}
                placeholder="e.g. CBC — Apr 2026"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Report type</label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={docReportType}
                onChange={(e) => setDocReportType(e.target.value as typeof docReportType)}
              >
                <option value="lab">Lab / blood work</option>
                <option value="pathology">Pathology</option>
                <option value="other">Other document</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Notes (optional)</label>
            <textarea
              className="mt-1 min-h-[72px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={docUploadNotes}
              onChange={(e) => setDocUploadNotes(e.target.value)}
              placeholder="Context for your clinician (not required for AI analysis)"
            />
          </div>
          <button
            type="submit"
            disabled={uploading}
            className="w-full rounded-lg bg-clinical-600 px-4 py-2 text-sm font-medium text-white hover:bg-clinical-900 disabled:opacity-50 sm:w-auto"
          >
            {uploading ? "Uploading and analyzing…" : "Upload and analyze"}
          </button>
        </form>

        <form
          onSubmit={onUploadImaging}
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900">X-rays &amp; clinical images</h2>
            <p className="mt-1 text-xs text-slate-600">
              X-ray, CT, MRI, or other photos. Same formats —{" "}
              <span className="font-mono">.pdf</span>, <span className="font-mono">.jpeg</span>,{" "}
              <span className="font-mono">.jpg</span>, <span className="font-mono">.png</span> — max 15 MB. Vision
              analysis runs when configured.
            </p>
          </div>
          <div>
            <span className="block text-xs font-medium text-slate-600">File</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <input
                ref={imgFileRef}
                id="patient-report-file-imaging"
                type="file"
                accept={ACCEPT_UPLOADS}
                className="sr-only"
                onChange={(e) => setImgUploadFileName(e.target.files?.[0]?.name ?? "")}
              />
              <label
                htmlFor="patient-report-file-imaging"
                className="inline-flex cursor-pointer rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200"
              >
                Choose image or PDF
              </label>
              {imgUploadFileName ? (
                <span className="text-sm text-slate-700">{imgUploadFileName}</span>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-1">
            <div>
              <label className="block text-xs font-medium text-slate-600">Title (optional)</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={imgUploadTitle}
                onChange={(e) => setImgUploadTitle(e.target.value)}
                placeholder="e.g. Chest X-ray — Apr 2026"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">Image type</label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={imgReportType}
                onChange={(e) => setImgReportType(e.target.value as typeof imgReportType)}
              >
                <option value="radiology">Radiology / X-ray / CT / MRI</option>
                <option value="imaging">Other clinical imaging</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Notes (optional)</label>
            <textarea
              className="mt-1 min-h-[72px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={imgUploadNotes}
              onChange={(e) => setImgUploadNotes(e.target.value)}
              placeholder="Body site, contrast, or other context"
            />
          </div>
          <button
            type="submit"
            disabled={uploading}
            className="w-full rounded-lg bg-clinical-600 px-4 py-2 text-sm font-medium text-white hover:bg-clinical-900 disabled:opacity-50 sm:w-auto"
          >
            {uploading ? "Uploading and analyzing…" : "Upload and analyze"}
          </button>
        </form>
      </div>

      <form onSubmit={addReport} className="mt-8 space-y-3 rounded-lg border border-slate-100 bg-white p-4">
        <p className="text-sm font-medium text-slate-800">Or add a short text summary only</p>
        <div>
          <label className="block text-xs font-medium text-slate-600">Title</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Lipid panel — Jan 2026"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Summary (optional)</label>
          <textarea
            className="mt-1 min-h-[100px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Key values or notes"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save text report"}
        </button>
      </form>

      <div className="mt-10">
        <h2 className="text-sm font-semibold text-slate-900">Your reports (archive)</h2>
        {rows === null ? (
          <p className="mt-2 text-sm text-slate-600">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No reports yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/patient/reports/${encodeURIComponent(r.id)}`}
                    className="font-medium text-clinical-700 hover:underline"
                  >
                    {r.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {r.createdAt}
                    {r.reportType ? ` · ${r.reportType}` : ""}
                    {r.hasAttachment ? ` · ${r.originalFilename || "attachment"}` : ""}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-600">{statusLabel(r)}</p>
                  {r.analysisSnippet ? (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-700">{r.analysisSnippet}</p>
                  ) : null}
                  {r.aiError ? (
                    <p className="mt-1 text-xs text-amber-800">{r.aiError}</p>
                  ) : null}
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`report-actions-${r.id}`}>
                    Actions for {r.title}
                  </label>
                  <select
                    id={`report-actions-${r.id}`}
                    className="max-w-[13rem] cursor-pointer rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-clinical-500/30"
                    value={reportListActionValue[r.id] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setReportListActionValue((prev) => ({ ...prev, [r.id]: "" }));
                      if (v === "original" && r.hasAttachment) {
                        downloadPatientReportOriginal(
                          r.id,
                          r.originalFilename || "report"
                        ).catch((err) => setError(errorMessageFromUnknown(err)));
                      } else if (v === "open") {
                        router.push(`/patient/reports/${encodeURIComponent(r.id)}`);
                      } else if (v === "analysis" && canDownloadAnalysisPdf(r)) {
                        downloadPatientReportAnalysisPdf(r.id).catch((err) =>
                          setError(errorMessageFromUnknown(err))
                        );
                      } else if (v === "delete") {
                        setReportToDelete({ id: r.id, title: r.title });
                      }
                    }}
                  >
                    <option value="">Report actions…</option>
                    <option value="open">Open</option>
                    {canDownloadAnalysisPdf(r) ? (
                      <option value="analysis">Analysis report</option>
                    ) : r.hasAttachment &&
                      (r.aiAnalysisStatus === "pending" || r.aiAnalysisStatus === "processing") ? (
                      <option value="__analysis_pending__" disabled>
                        Analysis report (when ready)
                      </option>
                    ) : null}
                    {r.hasAttachment ? <option value="original">Original file</option> : null}
                    <option value="delete">Delete report</option>
                  </select>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {reportToDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-action-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <h3 id="report-action-title" className="text-sm font-semibold text-slate-900">
              Delete this report?
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              <span className="font-medium text-slate-800">{reportToDelete.title}</span>
            </p>
            <p className="mt-2 text-xs text-slate-600">
              This permanently removes the list entry. Any uploaded file and all stored AI output for this report are
              deleted and cannot be recovered.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={reportActionBusy}
                onClick={() => setReportToDelete(null)}
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
    </div>
  );
}
