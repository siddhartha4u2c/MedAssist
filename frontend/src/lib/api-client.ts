import { getStoredAccessToken } from "./auth-storage";

/**
 * If NEXT_PUBLIC_API_URL is only `http://host:port` (no path), append `/api/v1`.
 * Otherwise `fetch(.../auth/forgot-password)` hits `/auth/...` on Flask → 404 NOT_FOUND.
 */
function normalizePublicApiBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    const p = (u.pathname || "/").replace(/\/$/, "") || "/";
    if (p === "/") {
      return `${u.origin}/api/v1`;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Auth endpoints always use this prefix (never `base()`), so a bad `NEXT_PUBLIC_API_URL`
 * cannot turn `/auth/forgot-password` into `/api/v1/api/v1/...` or skip `/api/v1` → NOT_FOUND.
 */
const AUTH_API = "/api/v1";

/**
 * API base path without trailing slash (must match Flask `/api/v1` prefix).
 * Same-origin proxy: `src/app/api/v1/[...path]/route.ts` → BACKEND_URL (Flask).
 */
function base(): string {
  let raw = normalizePublicApiBase(process.env.NEXT_PUBLIC_API_URL || "");
  if (!raw) return "/api/v1";

  // Never call LLM / EURI hosts from the browser — wrong paths return NOT_FOUND JSON.
  if (/euron\.one|openai\.com|api\.openai\.com/i.test(raw)) {
    return typeof window !== "undefined"
      ? `${window.location.origin}/api/v1`.replace(/\/$/, "")
      : "/api/v1";
  }

  if (typeof window !== "undefined") {
    try {
      const api = new URL(raw);
      const page = window.location;
      const loopbackApi =
        api.hostname === "localhost" || api.hostname === "127.0.0.1";
      const loopbackPage =
        page.hostname === "localhost" || page.hostname === "127.0.0.1";
      if (loopbackApi && loopbackPage && api.port === "5000") {
        return `${page.origin}/api/v1`.replace(/\/$/, "");
      }
    } catch {
      /* invalid NEXT_PUBLIC_API_URL — fall through */
    }
  }
  return raw;
}

/** Hide Python email_validator / browser wording that confuses users (e.g. "@-sign"). */
function sanitizeEmailValidatorMessage(s: string): string {
  const t = s.trim();
  if (/@-sign|email address must have/i.test(t)) {
    return "Invalid email format.";
  }
  return t;
}

/** Turn API `error` (string or nested object) into readable text. */
export function formatApiError(value: unknown): string {
  if (value == null) return "Request failed";
  if (typeof value === "string") return sanitizeEmailValidatorMessage(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatApiError).join("; ");
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.message === "string") return sanitizeEmailValidatorMessage(o.message);
    if (typeof o.detail === "string") return sanitizeEmailValidatorMessage(o.detail);
    if (typeof o.msg === "string") return sanitizeEmailValidatorMessage(o.msg);
    if (typeof o.error === "string") return sanitizeEmailValidatorMessage(o.error);
    try {
      return JSON.stringify(value);
    } catch {
      return "Request failed";
    }
  }
  return String(value);
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Safe message for any thrown value (use in catch blocks). */
export function errorMessageFromUnknown(err: unknown): string {
  if (err instanceof ApiError) return sanitizeEmailValidatorMessage(err.message);
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return (
      "Could not reach the API (network error). Start Flask on port 5000, set BACKEND_URL in " +
      "frontend/.env.local, and leave NEXT_PUBLIC_API_URL unset so calls use /api/v1 (same-origin proxy)."
    );
  }
  if (err instanceof Error) {
    return sanitizeEmailValidatorMessage(err.message || "Something went wrong");
  }
  return formatApiError(err);
}

export function errorCodeFromUnknown(err: unknown): string | undefined {
  if (err instanceof ApiError) return err.code;
  return undefined;
}

function extractErrorCode(parsed: unknown): string | undefined {
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const p = parsed as Record<string, unknown>;
  if (typeof p.code === "string") return p.code;
  const e = p.error;
  if (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code: string }).code === "string"
  ) {
    return (e as { code: string }).code;
  }
  return undefined;
}

/** Build user-facing text from Flask or Pydantic-style JSON error bodies. */
function formatErrorFromResponseBody(parsed: unknown): string {
  if (typeof parsed !== "object" || parsed === null) return "Request failed";
  const p = parsed as Record<string, unknown>;
  if (typeof p.error === "string" && p.error.trim()) {
    return sanitizeEmailValidatorMessage(p.error.trim());
  }
  if (typeof p.error === "object" && p.error !== null) {
    const inner = p.error as Record<string, unknown>;
    if (typeof inner.message === "string" && inner.message.trim()) {
      const code = typeof inner.code === "string" ? inner.code.trim() : "";
      const m = sanitizeEmailValidatorMessage(inner.message.trim());
      return code ? `${m} (${code})` : m;
    }
    return formatApiError(p.error);
  }
  if (typeof p.message === "string" && p.message.trim()) {
    return sanitizeEmailValidatorMessage(p.message.trim());
  }
  if (p.details && Array.isArray(p.details)) {
    const lines = (p.details as unknown[]).map((item) => {
      if (typeof item !== "object" || item === null) return "";
      const d = item as { loc?: unknown[]; msg?: string };
      const loc = Array.isArray(d.loc)
        ? d.loc
            .filter((x) => x !== "body" && typeof x === "string")
            .join(" → ")
        : "";
      const m = sanitizeEmailValidatorMessage((d.msg || "").trim());
      if (loc && m) return `${loc}: ${m}`;
      return m;
    });
    const joined = lines.filter(Boolean).join(" ");
    if (joined) return joined;
  }
  try {
    return JSON.stringify(parsed);
  } catch {
    return "Request failed";
  }
}

/** Read body once; throw ApiError with optional `code` from API. */
async function readJsonRes<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    if (typeof parsed === "object" && parsed !== null) {
      const code = extractErrorCode(parsed);
      const msg = formatErrorFromResponseBody(parsed);
      if (msg && msg !== "{}") {
        throw new ApiError(msg, res.status, code);
      }
    }
    const hint = text.trim().slice(0, 300);
    throw new ApiError(
      hint || res.statusText || `Request failed (${res.status})`,
      res.status
    );
  }
  return parsed as T;
}

const VERIFY_TIMEOUT_MS = 25_000;

export type UserRole = "patient" | "doctor" | "admin";

export type RegisterSuccess = {
  success?: boolean;
  message: string;
  email: string;
  /** `"console"` when `DEV_SKIP_EMAIL=true` — link is printed in the Flask terminal only. */
  email_delivery?: "smtp" | "console";
  next_steps?: string[];
};

export async function authRegister(body: {
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  password_confirm: string;
  role: UserRole;
}): Promise<RegisterSuccess> {
  const res = await fetch(`${AUTH_API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJsonRes<RegisterSuccess>(res);
}

export async function authRejectRegistration(body: {
  token: string;
  reason?: string;
}): Promise<{ message: string }> {
  const res = await fetch(`${AUTH_API}/auth/reject-registration`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJsonRes<{ message: string }>(res);
}

export async function authVerifyEmail(token: string): Promise<{ message: string }> {
  const q = new URLSearchParams({ token });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(`${AUTH_API}/auth/verify-email?${q.toString()}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return readJsonRes<{ message: string }>(res);
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        "Request timed out. Start the Flask backend on port 5000, then try again."
      );
    }
    if (e instanceof TypeError) {
      throw new Error(
        "Could not reach the server. Start the backend (Flask on port 5000). If the API runs elsewhere, set NEXT_PUBLIC_API_URL in frontend/.env.local or BACKEND_URL for the dev proxy, then restart Next.js (npm run dev)."
      );
    }
    throw e;
  }
}

export async function authLogin(
  email: string,
  password: string,
  role?: UserRole
): Promise<{
  access_token: string;
  token_type: string;
  user: { id: string; email: string; role: string };
}> {
  const res = await fetch(`${AUTH_API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role }),
  });
  return readJsonRes(res);
}

export async function authForgotPassword(email: string): Promise<{ message: string }> {
  const res = await fetch(`${AUTH_API}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return readJsonRes<{ message: string }>(res);
}

/** New activation link for an unverified account (forgot password does not email until verified). */
export async function authResendVerification(email: string): Promise<{
  message: string;
  email_delivery?: "smtp" | "console";
}> {
  const res = await fetch(`${AUTH_API}/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return readJsonRes<{ message: string; email_delivery?: "smtp" | "console" }>(res);
}

export async function authResetPassword(body: {
  token: string;
  password: string;
  password_confirm: string;
}): Promise<{ message: string }> {
  const res = await fetch(`${AUTH_API}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJsonRes<{ message: string }>(res);
}

/** Doctor directory entry (patient-facing). */
export type PortalDoctor = {
  id: string;
  displayName: string;
  email: string;
  specialization: string;
  department?: string | null;
  hospitalAffiliation?: string | null;
  yearsExperience?: number | null;
  availableForTelemedicine?: boolean;
  bio?: string | null;
  academicRecords?: string | null;
  professionalExperience?: string | null;
  achievements?: string | null;
  /** Data URL when present and small enough for directory payloads. */
  photoDataUrl?: string | null;
};

export async function fetchPatientDoctorDirectory(): Promise<{ doctors: PortalDoctor[] }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/patient/doctors`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return readJsonRes<{ doctors: PortalDoctor[] }>(res);
}

export type DoctorSelfProfile = {
  displayName: string;
  email: string;
  specialization: string;
  department: string;
  hospitalAffiliation: string;
  yearsExperience: number | "";
  consultationFee: number | "";
  bio: string;
  academicRecords: string;
  professionalExperience: string;
  achievements: string;
  availableForTelemedicine: boolean;
  photoDataUrl?: string;
};

export async function fetchDoctorProfile(): Promise<{ profile: DoctorSelfProfile | null }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/doctor/profile`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return readJsonRes<{ profile: DoctorSelfProfile | null }>(res);
}

export async function saveDoctorProfile(body: {
  specialization?: string;
  department?: string;
  hospitalAffiliation?: string;
  yearsExperience?: number | "";
  consultationFee?: number | "";
  bio?: string;
  academicRecords?: string;
  professionalExperience?: string;
  achievements?: string;
  availableForTelemedicine?: boolean;
  photoDataUrl?: string;
}): Promise<{ message: string; profile: DoctorSelfProfile }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/doctor/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return readJsonRes<{ message: string; profile: DoctorSelfProfile }>(res);
}

/** --- Doctor: assigned patients --- */

export type DoctorMyPatientRow = {
  patientUserId: string;
  displayName: string;
  email: string;
  updatedAt: string;
};

export async function fetchDoctorMyPatients(): Promise<{ patients: DoctorMyPatientRow[] }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/doctor/my-patients`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  return readJsonRes<{ patients: DoctorMyPatientRow[] }>(res);
}

export async function fetchDoctorPatientSummary(patientUserId: string): Promise<{
  patientUserId: string;
  displayName: string;
  email: string;
}> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/doctor/patients/${encodeURIComponent(patientUserId)}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  return readJsonRes(res);
}

/** Full patient profile fields (same shape as patient self profile API). */
export async function fetchDoctorPatientProfileView(
  patientUserId: string
): Promise<{ profile: Record<string, string | number | boolean | object | null | ""> }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(
    `${base()}/doctor/patients/${encodeURIComponent(patientUserId)}/profile-view`,
    {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: "no-store",
    }
  );
  return readJsonRes(res);
}

export async function fetchDoctorPatientMedications(patientUserId: string): Promise<{
  currentMedications: string;
}> {
  const token =
    getStoredAccessToken();
  const res = await fetch(
    `${base()}/doctor/patients/${encodeURIComponent(patientUserId)}/medications-view`,
    {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: "no-store",
    }
  );
  return readJsonRes(res);
}

export async function saveDoctorPatientMedications(
  patientUserId: string,
  currentMedications: string
): Promise<{ message: string; currentMedications: string }> {
  const token = getStoredAccessToken();
  const res = await fetch(
    `${base()}/doctor/patients/${encodeURIComponent(patientUserId)}/medications`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ currentMedications }),
    }
  );
  return readJsonRes(res);
}

/** Patient: download medications PDF — full list, or one structured row with `rowId`. */
export async function downloadPatientMedicationsPdf(opts?: {
  rowId?: string;
  /** Suggested download filename (ASCII). */
  downloadFileName?: string;
}): Promise<void> {
  const token = getStoredAccessToken();
  const qs = opts?.rowId?.trim() ? `?rowId=${encodeURIComponent(opts.rowId.trim())}` : "";
  const res = await fetch(`${base()}/patient/medications/pdf${qs}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = "Could not download PDF.";
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    (opts?.downloadFileName && opts.downloadFileName.trim()) ||
    (opts?.rowId ? "medassist-medication.pdf" : "medassist-medications.pdf");
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type PatientReportAiAnalysis = {
  reportKind?: string;
  summaryForPatient?: string;
  findingsNormal?: string[];
  findingsAbnormalOrNotable?: string[];
  extractedValues?: Array<{
    name?: string;
    value?: string;
    unit?: string;
    referenceOrRange?: string;
    flag?: string;
  }>;
  imagingInterpretation?: string;
  recommendedActions?: string[];
  urgency?: string;
  disclaimer?: string;
};

export type PatientReportRow = {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  hasAttachment?: boolean;
  originalFilename?: string;
  mimeType?: string;
  reportType?: string;
  aiAnalysisStatus?: string;
  analyzedAt?: string;
  analysisSnippet?: string;
  aiError?: string;
  aiAnalysis?: PatientReportAiAnalysis;
};

export async function fetchDoctorPatientReports(patientUserId: string): Promise<{
  reports: PatientReportRow[];
}> {
  const token =
    getStoredAccessToken();
  const res = await fetch(
    `${base()}/doctor/patients/${encodeURIComponent(patientUserId)}/reports-view`,
    {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: "no-store",
    }
  );
  return readJsonRes<{ reports: PatientReportRow[] }>(res);
}

export async function fetchDoctorPatientCarePlan(patientUserId: string): Promise<{
  carePlanText: string;
}> {
  const token =
    getStoredAccessToken();
  const res = await fetch(
    `${base()}/doctor/patients/${encodeURIComponent(patientUserId)}/care-plan`,
    {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: "no-store",
    }
  );
  return readJsonRes(res);
}

export async function saveDoctorPatientCarePlan(
  patientUserId: string,
  carePlanText: string
): Promise<{ message: string; carePlanText: string }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(
    `${base()}/doctor/patients/${encodeURIComponent(patientUserId)}/care-plan`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ carePlanText }),
    }
  );
  return readJsonRes(res);
}

/** --- Patient: clinical reports --- */

export async function fetchPatientReports(): Promise<{ reports: PatientReportRow[] }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/patient/reports`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  return readJsonRes<{ reports: PatientReportRow[] }>(res);
}

export async function createPatientReport(body: {
  title: string;
  summary?: string;
}): Promise<{ report: PatientReportRow }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/patient/reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return readJsonRes(res);
}

/** Upload PDF / JPEG / PNG; server runs Report Reader (Agent 2) analysis. */
export async function uploadPatientReportFile(body: {
  file: File;
  title?: string;
  reportType?: "lab" | "imaging" | "radiology" | "pathology" | "other";
  notes?: string;
}): Promise<{ report: PatientReportRow }> {
  const token =
    getStoredAccessToken();
  const fd = new FormData();
  fd.append("file", body.file);
  if (body.title?.trim()) fd.append("title", body.title.trim());
  if (body.reportType) fd.append("reportType", body.reportType);
  if (body.notes?.trim()) fd.append("notes", body.notes.trim());
  const res = await fetch(`${base()}/patient/reports/upload`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: fd,
  });
  return readJsonRes(res);
}

export async function fetchPatientReportDetail(
  reportId: string
): Promise<{ report: PatientReportRow }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/patient/reports/${encodeURIComponent(reportId)}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  return readJsonRes(res);
}

/** Permanently delete a report (uploaded file, AI fields, and row). */
export async function deletePatientReport(reportId: string): Promise<{ ok: boolean; deletedId: string }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/patient/reports/${encodeURIComponent(reportId)}`, {
    method: "DELETE",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return readJsonRes(res);
}

function _triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Download original uploaded file (PDF or image). */
export async function downloadPatientReportOriginal(
  reportId: string,
  fallbackName: string
): Promise<void> {
  const token =
    getStoredAccessToken();
  const res = await fetch(
    `${base()}/patient/reports/${encodeURIComponent(reportId)}/file`,
    {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Download failed (${res.status})`);
  }
  const cd = res.headers.get("Content-Disposition");
  let name = fallbackName || "report";
  const m = cd?.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
  if (m?.[1]) name = decodeURIComponent(m[1].trim());
  const blob = await res.blob();
  _triggerBlobDownload(blob, name);
}

/** Download AI analysis as PDF. */
export async function downloadPatientReportAnalysisPdf(reportId: string): Promise<void> {
  const token =
    getStoredAccessToken();
  const res = await fetch(
    `${base()}/patient/reports/${encodeURIComponent(reportId)}/analysis.pdf`,
    {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  _triggerBlobDownload(blob, `medassist-analysis-${reportId.slice(0, 8)}.pdf`);
}

/** Payment request proof (patient or admin JWT). */
export async function downloadPaymentRequestProof(
  requestId: string,
  fallbackName: string
): Promise<void> {
  const token =
    getStoredAccessToken();
  const res = await fetch(
    `${base()}/patient/payment-requests/${encodeURIComponent(requestId)}/proof`,
    {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Download failed (${res.status})`);
  }
  const cd = res.headers.get("Content-Disposition");
  let name = fallbackName || "payment-proof";
  const m = cd?.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
  if (m?.[1]) name = decodeURIComponent(m[1].trim());
  const blob = await res.blob();
  _triggerBlobDownload(blob, name);
}

/** Approved payment request receipt as PDF (patient JWT only). */
export async function fetchPatientPaymentRequestReceiptPdf(requestId: string): Promise<Blob> {
  const token = getStoredAccessToken();
  const res = await fetch(
    `${base()}/patient/payment-requests/${encodeURIComponent(requestId)}/receipt.pdf`,
    {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Receipt download failed (${res.status})`);
  }
  return res.blob();
}

export async function downloadPatientPaymentRequestReceiptPdf(requestId: string): Promise<void> {
  const blob = await fetchPatientPaymentRequestReceiptPdf(requestId);
  _triggerBlobDownload(blob, `medassist-payment-receipt-${requestId.slice(0, 8)}.pdf`);
}

/** --- Admin: portal --- */

export type AdminPatientDoctorBrief = {
  userId: string;
  displayName: string;
  email: string;
};

export type AdminPatientRow = {
  userId: string;
  email: string;
  displayName: string;
  assignedDoctors: AdminPatientDoctorBrief[];
  assignedDoctor: AdminPatientDoctorBrief | null;
  isVerified: boolean;
};

export type AdminDoctorRow = {
  userId: string;
  email: string;
  displayName: string;
  specialization: string;
};

export async function fetchAdminPatients(): Promise<{ patients: AdminPatientRow[] }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/admin/patients`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  return readJsonRes(res);
}

export async function fetchAdminDoctorsList(): Promise<{ doctors: AdminDoctorRow[] }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/admin/doctors`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  return readJsonRes(res);
}

export async function adminPatientDoctorLink(body: {
  patientUserId: string;
  doctorUserId: string;
  action: "add" | "remove";
}): Promise<{ message: string; assignedDoctors?: AdminPatientDoctorBrief[] }> {
  const token = getStoredAccessToken();
  const res = await fetch(`${base()}/admin/assignments`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return readJsonRes(res);
}

export type PatientPaymentRequestRow = {
  id: string;
  amount: string;
  treatmentType: string;
  paymentMode: string;
  paymentOn: string;
  validUntil: string;
  status: string;
  hasProof: boolean;
  originalFilename?: string;
  createdAt: string;
  reviewedAt?: string;
};

export type AdminPaymentRequestRow = PatientPaymentRequestRow & {
  patientUserId: string;
  patientDisplayName: string;
  patientEmail: string;
};

export async function fetchPatientPaymentRequests(): Promise<{
  requests: PatientPaymentRequestRow[];
}> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/patient/payment-requests`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  return readJsonRes(res);
}

export async function createPatientPaymentRequest(
  form: FormData
): Promise<{ request: PatientPaymentRequestRow; message: string }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/patient/payment-requests`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  return readJsonRes(res);
}

export async function fetchAdminPaymentRequests(): Promise<{
  requests: AdminPaymentRequestRow[];
  pendingCount: number;
}> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/admin/payment-requests`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  return readJsonRes(res);
}

export type AdminUserMgmtRow = {
  userId: string;
  email: string;
  role: "patient" | "doctor";
  displayName: string;
  isVerified: boolean;
  accessBlocked: boolean;
  accountRemoved: boolean;
  removedAt: string;
  hasProfile: boolean;
};

export async function fetchAdminPortalUsers(): Promise<{ users: AdminUserMgmtRow[] }> {
  const token = getStoredAccessToken();
  const res = await fetch(`${base()}/admin/users`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  return readJsonRes<{ users: AdminUserMgmtRow[] }>(res);
}

export type AdminAiMetricRow = {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  avgLatencyMs: number | null;
  errors: number;
};

export type AdminAiUsageTotals = AdminAiMetricRow & {
  successfulRequests: number;
  successRatePct: number | null;
};

export type AdminAiBreakdownRow = AdminAiMetricRow & {
  model?: string;
  source?: string;
  operation?: string;
  date?: string;
};

export type AdminAiUsageWindow = {
  totals: AdminAiUsageTotals;
  firstEventAt: string | null;
  lastEventAt: string | null;
  byModel: AdminAiBreakdownRow[];
  bySource: AdminAiBreakdownRow[];
  byOperation: AdminAiBreakdownRow[];
  byDay: AdminAiBreakdownRow[];
};

export type AdminAiRecentEvent = {
  id: string;
  createdAt: string;
  operation: string;
  source: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
  success: boolean;
  errorSummary: string;
  userId: string;
};

export type AdminAiLogsResponse = {
  range: { from: string; to: string };
  lifetime: AdminAiUsageWindow;
  inRange: AdminAiUsageWindow;
  recentEvents: AdminAiRecentEvent[];
  recentEventsInRange: AdminAiRecentEvent[];
};

export async function fetchAdminAiLogs(params?: {
  from?: string;
  to?: string;
}): Promise<AdminAiLogsResponse> {
  const token = getStoredAccessToken();
  const sp = new URLSearchParams();
  if (params?.from) sp.set("from", params.from);
  if (params?.to) sp.set("to", params.to);
  const q = sp.toString();
  const suffix = q ? `?${q}` : "";
  const urls = [`${base()}/admin/ai-logs${suffix}`, `${base()}/admin/ai_logs${suffix}`];
  let last: Response | undefined;
  for (const url of urls) {
    const res = await fetch(url, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: "no-store",
    });
    last = res;
    if (res.status !== 404) {
      return readJsonRes<AdminAiLogsResponse>(res);
    }
  }
  try {
    if (!last) throw new ApiError("Could not load AI logs.", 0);
    return readJsonRes<AdminAiLogsResponse>(last);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      throw new ApiError(
        "AI logs were not found on the API server. Restart Flask with the current MedAssist backend code, and ensure the Next.js proxy BACKEND_URL points at that server (not the LLM host).",
        404,
        e.code
      );
    }
    throw e;
  }
}

export async function adminSetUserBlocked(
  userId: string,
  blocked: boolean
): Promise<{ user: AdminUserMgmtRow }> {
  const token = getStoredAccessToken();
  const res = await fetch(
    `${base()}/admin/users/${encodeURIComponent(userId)}/blocked`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ blocked }),
    }
  );
  return readJsonRes(res);
}

export async function adminDeleteLead(leadId: string): Promise<{ message: string; id: string }> {
  const token = getStoredAccessToken();
  const res = await fetch(`${base()}/admin/leads/${encodeURIComponent(leadId)}`, {
    method: "DELETE",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return readJsonRes(res);
}

export async function adminRemoveUserPortalProfile(
  userId: string
): Promise<{ message: string; user: AdminUserMgmtRow }> {
  const token = getStoredAccessToken();
  const res = await fetch(
    `${base()}/admin/users/${encodeURIComponent(userId)}/remove-profile`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: "{}",
    }
  );
  return readJsonRes(res);
}

export async function adminApprovePaymentRequest(
  requestId: string
): Promise<{ message: string; request: AdminPaymentRequestRow }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(
    `${base()}/admin/payment-requests/${encodeURIComponent(requestId)}/approve`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: "{}",
    }
  );
  return readJsonRes(res);
}

export async function adminRejectPaymentRequest(
  requestId: string
): Promise<{ message: string; request: AdminPaymentRequestRow }> {
  const token = getStoredAccessToken();
  const res = await fetch(
    `${base()}/admin/payment-requests/${encodeURIComponent(requestId)}/reject`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: "{}",
    }
  );
  return readJsonRes(res);
}

/** --- Appointments (patient + doctor) --- */

export type AppointmentRow = {
  id: string;
  patientUserId: string;
  doctorUserId: string;
  patientDisplayName?: string;
  doctorDisplayName?: string;
  mode: "telemedicine" | "in_person";
  startsAt: string;
  endsAt: string;
  status: string;
  reason: string;
  cancellationReason?: string;
  videoRoomId: string | null;
  videoJoinUrl?: string | null;
};

export type AppointmentBusyBlock = {
  startsAt: string;
  endsAt: string;
  appointmentId?: string | null;
  mode: string;
  unavailableBlockId?: string | null;
};

export type AppointmentDirectoryDoctor = {
  userId: string;
  displayName: string;
  email: string;
  specialization: string;
  department?: string | null;
  hospitalAffiliation?: string | null;
  yearsExperience?: number | null;
  availableForTelemedicine?: boolean;
  bio?: string | null;
  academicRecords?: string | null;
  professionalExperience?: string | null;
  achievements?: string | null;
};

export type AppointmentDirectoryPerson = {
  userId: string;
  displayName: string;
  email: string;
  role: "patient" | "doctor";
  specialization?: string;
};

export async function appointmentsDirectorySearch(q: string): Promise<{
  doctors: AppointmentDirectoryDoctor[];
  patients: AppointmentDirectoryPerson[];
}> {
  const token =
    getStoredAccessToken();
  const qs = new URLSearchParams();
  if (q.trim()) qs.set("q", q.trim());
  const res = await fetch(`${base()}/appointments/directory-search?${qs.toString()}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  return readJsonRes(res);
}

export async function appointmentsDoctorProfileForPatient(
  doctorUserId: string,
  detail: "directory" | "full"
): Promise<{ profile: AppointmentDirectoryDoctor & Record<string, unknown> }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(
    `${base()}/appointments/doctor/${encodeURIComponent(doctorUserId)}/profile?detail=${detail}`,
    { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: "no-store" }
  );
  return readJsonRes(res);
}

export type DoctorUnavailableBlock = {
  id: string;
  doctorUserId: string;
  startsAt: string;
  endsAt: string;
  note: string;
};

export async function appointmentsUnavailableBlocksList(params: {
  from: string;
  to: string;
}): Promise<{ blocks: DoctorUnavailableBlock[] }> {
  const token = getStoredAccessToken();
  const qs = new URLSearchParams();
  qs.set("from", params.from);
  qs.set("to", params.to);
  const res = await fetch(`${base()}/appointments/unavailable-blocks?${qs.toString()}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  return readJsonRes(res);
}

export async function appointmentsUnavailableBlocksCreate(body: {
  startsAt: string;
  endsAt: string;
  note?: string;
}): Promise<{ block: DoctorUnavailableBlock }> {
  const token = getStoredAccessToken();
  const res = await fetch(`${base()}/appointments/unavailable-blocks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return readJsonRes(res);
}

export async function appointmentsUnavailableBlocksDelete(blockId: string): Promise<{ deleted: boolean }> {
  const token = getStoredAccessToken();
  const res = await fetch(
    `${base()}/appointments/unavailable-blocks/${encodeURIComponent(blockId)}`,
    {
      method: "DELETE",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }
  );
  return readJsonRes(res);
}

export async function appointmentsBusy(params: {
  userIds: string[];
  from: string;
  to: string;
}): Promise<{ busyByUserId: Record<string, AppointmentBusyBlock[]>; from: string; to: string }> {
  const token =
    getStoredAccessToken();
  const qs = new URLSearchParams();
  qs.set("userIds", params.userIds.join(","));
  qs.set("from", params.from);
  qs.set("to", params.to);
  const res = await fetch(`${base()}/appointments/busy?${qs.toString()}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  return readJsonRes(res);
}

export async function appointmentsMine(params: {
  from: string;
  to: string;
  status?: string;
}): Promise<{ appointments: AppointmentRow[] }> {
  const token =
    getStoredAccessToken();
  const qs = new URLSearchParams();
  qs.set("from", params.from);
  qs.set("to", params.to);
  if (params.status) qs.set("status", params.status);
  const res = await fetch(`${base()}/appointments/mine?${qs.toString()}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  return readJsonRes(res);
}

export async function appointmentsGet(appointmentId: string): Promise<{ appointment: AppointmentRow }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(
    `${base()}/appointments/${encodeURIComponent(appointmentId)}`,
    {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: "no-store",
    }
  );
  return readJsonRes(res);
}

export async function appointmentsCreate(body: {
  doctorUserId?: string;
  patientUserId?: string;
  mode: "telemedicine" | "in_person";
  startsAt: string;
  endsAt: string;
  reason?: string;
}): Promise<{ appointment: AppointmentRow; videoProvisioningWarning?: string }> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/appointments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return readJsonRes(res);
}

export async function appointmentsCancel(
  appointmentId: string,
  opts?: { cancellationReason?: string }
): Promise<{
  appointment: AppointmentRow;
}> {
  const token =
    getStoredAccessToken();
  const body: Record<string, string> = {};
  const r = opts?.cancellationReason?.trim();
  if (r) body.cancellationReason = r;
  const res = await fetch(`${base()}/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return readJsonRes(res);
}

/** Create Daily.co / video room for an existing telemedicine appointment with no join URL. */
export async function appointmentsProvisionVideo(appointmentId: string): Promise<{
  appointment: AppointmentRow;
  message?: string;
  videoProvisioningWarning?: string;
}> {
  const token =
    getStoredAccessToken();
  const res = await fetch(
    `${base()}/appointments/${encodeURIComponent(appointmentId)}/provision-video`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: "{}",
    }
  );
  return readJsonRes(res);
}

export type SymptomChatMessage = { role: "user" | "assistant"; content: string };

/** Structured triage payload returned with each Symptom Analyst reply (also parsed server-side). */
export type SymptomAssessment = {
  urgencyLevel: string;
  urgencyLabel: string;
  urgencyScore: number;
  holisticSummary: string;
  suggestions: string[];
  differentialIdeas: Array<{ condition?: string; confidence?: string }>;
  seeDoctorWithin: string;
  source?: string;
};

/** Multi-turn Symptom Analyst chat (JWT required). */
export async function symptomChat(messages: SymptomChatMessage[]): Promise<{
  reply: string;
  agent?: string;
  assessment: SymptomAssessment;
}> {
  const token =
    getStoredAccessToken();
  const res = await fetch(`${base()}/symptoms/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages }),
  });
  return readJsonRes<{ reply: string; agent?: string; assessment: SymptomAssessment }>(res);
}

/** Patient AI assistant chat (comprehensive, multilingual, JWT required). */
export async function patientAssistantChat(
  messages: SymptomChatMessage[],
  opts?: { locale?: string }
): Promise<{ reply: string; agent?: string; carePlan?: string }> {
  const token = getStoredAccessToken();
  const res = await fetch(`${base()}/assistant/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      messages,
      ...(opts?.locale ? { locale: opts.locale } : {}),
    }),
  });
  return readJsonRes<{ reply: string; agent?: string; carePlan?: string }>(res);
}

export type PatientAssistantCarePlanItem = {
  id: string;
  planText: string;
  source: string;
  createdAt: string;
};

export async function fetchPatientAssistantCarePlans(): Promise<{
  carePlans: PatientAssistantCarePlanItem[];
}> {
  const token = getStoredAccessToken();
  const res = await fetch(`${base()}/patient/care-plans`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  return readJsonRes<{ carePlans: PatientAssistantCarePlanItem[] }>(res);
}

/** GET — no auth; confirms MedAssist Flask + LLM wiring for the symptom tab. */
export async function fetchSymptomTrackerInfo(): Promise<{
  service: string;
  symptom_agent: string;
  llm_configured: boolean;
  /** True when PINECONE_API_KEY and PINECONE_INDEX_NAME are set on the server. */
  rag_configured?: boolean;
  llm_base_url?: string;
  llm_model_primary?: string;
  hint?: string;
}> {
  const url = `${base()}/symptoms/info`;
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (err) {
    throw new Error(
      `Network error requesting ${url}: ${errorMessageFromUnknown(err)}. Check that this page’s origin matches your Next dev URL (same port as the terminal).`
    );
  }
  const text = await res.text();
  if (!res.ok) {
    let detail = text.trim().slice(0, 400);
    try {
      const j = JSON.parse(text) as {
        error?: string | { message?: string; code?: string };
        message?: string;
      };
      if (typeof j.error === "string" && j.error) detail = j.error;
      else if (j.error && typeof j.error === "object" && j.message === undefined) {
        const inner = j.error as { message?: string; code?: string };
        if (inner.message) detail = inner.code ? `${inner.message} (${inner.code})` : inner.message;
      } else if (typeof j.message === "string" && j.message) detail = j.message;
    } catch {
      /* keep raw detail */
    }
    throw new Error(
      `symptoms/info HTTP ${res.status}: ${detail || res.statusText}. If 502, Flask was unreachable from Next (see BACKEND_URL). If 404, update/restart the MedAssist backend so GET /api/v1/symptoms/info exists.`
    );
  }
  try {
    return JSON.parse(text) as {
      service: string;
      symptom_agent: string;
      llm_configured: boolean;
      llm_base_url?: string;
      llm_model_primary?: string;
      hint?: string;
    };
  } catch {
    throw new Error(`symptoms/info: expected JSON, got: ${text.slice(0, 200)}`);
  }
}

export type PortalNotificationApiRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  patientUserId: string;
  read: boolean;
  readAt: string;
  createdAt: string;
};

export async function fetchPortalNotifications(): Promise<{
  notifications: PortalNotificationApiRow[];
}> {
  const token = getStoredAccessToken();
  const res = await fetch(`${base()}/notifications`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  return readJsonRes(res);
}

export async function markPortalNotificationRead(
  id: string
): Promise<{ notification: PortalNotificationApiRow }> {
  const token = getStoredAccessToken();
  const res = await fetch(`${base()}/notifications/${encodeURIComponent(id)}/read`, {
    method: "PUT",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return readJsonRes(res);
}
