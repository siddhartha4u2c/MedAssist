"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Landing page (`/`) lead popup. Bump version when you need everyone to see the modal again after testing. */
const OPEN_DELAY_MS = 4000;

const STORAGE_SUBMITTED = "medassist_lead_login_submitted_v6";
const STORAGE_DISMISSED = "medassist_lead_login_dismissed_v6";

function sessionGet(key: string): string | null {
  try {
    return typeof window !== "undefined" ? sessionStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function sessionSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Must match backend `LEADS_BACKEND_MARKER` in app/api/v1/leads.py */
const LEADS_BACKEND_OK = "simple_v1";

function friendlyError(raw: string): string {
  const t = raw.trim();
  if (!t) return "Something went wrong. Please try again.";
  return t;
}

function leadApiMessage(
  raw: string,
  res: Response,
  data: { leadsBackend?: string }
): string {
  const t = raw.trim();
  if (!t) return "Something went wrong. Please try again.";
  const mode = res.headers.get("x-medassist-leads-mode");
  const apiVer = res.headers.get("x-medassist-leads-api");
  const trusted =
    data.leadsBackend === LEADS_BACKEND_OK ||
    mode === "simple_form" ||
    apiVer === "3";
  if (trusted) {
    return t;
  }
  return friendlyError(t);
}

function apiV1(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");
  const tail = path.startsWith("/") ? path : `/${path}`;
  if (base) {
    return `${base}${tail}`;
  }
  return `/api/v1${tail}`;
}

export function LeadCaptureModal() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (sessionGet(STORAGE_SUBMITTED)) return;
    if (sessionGet(STORAGE_DISMISSED)) return;
    const t = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  const dismiss = useCallback(() => {
    sessionSet(STORAGE_DISMISSED, "1");
    setOpen(false);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const n = name.trim();
    if (!n) {
      setError("Please enter your name.");
      return;
    }
    const em = email.trim();
    if (!em) {
      setError("Please enter your email.");
      return;
    }
    const p = phone.trim();
    if (!p) {
      setError("Please enter your phone number.");
      return;
    }
    setLoadingSubmit(true);
    try {
      const res = await fetch(apiV1("/leads/submit_lead"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n,
          email: em,
          phone: p,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        leadsBackend?: string;
      };
      if (!res.ok)
        throw new Error(leadApiMessage(data.error || "Could not submit.", res, data));
      setSuccess(true);
      sessionSet(STORAGE_SUBMITTED, "1");
      window.setTimeout(() => {
        setOpen(false);
      }, 2200);
    } catch (e) {
      const msg =
        e instanceof TypeError && /fetch|network|failed/i.test(String(e.message))
          ? "Network error. Check Flask is running; keep API calls on the same origin (no NEXT_PUBLIC_API_URL)."
          : e instanceof Error
            ? e.message
            : "Could not submit.";
      setError(msg);
    } finally {
      setLoadingSubmit(false);
    }
  }

  if (!mounted || !open) return null;

  const modal = (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[99999] flex justify-end p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4"
      role="dialog"
      aria-modal="false"
      aria-labelledby="lead-modal-title"
    >
      <div
        className="pointer-events-auto flex w-full max-w-[min(100%,24rem)] flex-col rounded-2xl border border-slate-200/90 bg-white shadow-lg ring-1 ring-slate-900/5"
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-100 px-4 py-3.5 sm:px-5 sm:py-4">
          <h2
            id="lead-modal-title"
            className="pr-6 text-left text-base font-bold leading-snug tracking-tight text-[#0c4a6e] sm:text-lg"
          >
            Get A Call From Our Experts
          </h2>
          <button
            type="button"
            onClick={dismiss}
            className="-mr-1 -mt-0.5 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Dismiss"
          >
            <span className="block text-lg leading-none" aria-hidden>
              ×
            </span>
          </button>
        </div>

        <div className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4">
          {success ? (
            <p className="text-center text-sm leading-relaxed text-slate-700 sm:text-base">
              Thank you. We will connect with you soon.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3.5" noValidate>
              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-xs text-red-800 sm:text-sm">
                  {error}
                </p>
              ) : null}

              <div>
                <label htmlFor="lead-name" className="sr-only">
                  Your name
                </label>
                <input
                  id="lead-name"
                  type="text"
                  name="lead-name"
                  autoComplete="name"
                  placeholder="Your Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-full border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none ring-0 transition focus:border-[#0c4a6e] focus:ring-2 focus:ring-[#0c4a6e]/20 sm:text-[15px]"
                />
              </div>

              <div>
                <label htmlFor="lead-email" className="sr-only">
                  Email
                </label>
                <input
                  id="lead-email"
                  type="text"
                  name="lead-email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-full border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#0c4a6e] focus:ring-2 focus:ring-[#0c4a6e]/20 sm:text-[15px]"
                />
              </div>

              <div>
                <label htmlFor="lead-phone" className="sr-only">
                  Phone number
                </label>
                <input
                  id="lead-phone"
                  type="text"
                  name="lead-phone"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="Phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-full border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#0c4a6e] focus:ring-2 focus:ring-[#0c4a6e]/20 sm:text-[15px]"
                />
              </div>

              <button
                type="submit"
                disabled={loadingSubmit}
                className="w-full rounded-full bg-amber-400 py-3 text-sm font-bold text-[#0c4a6e] shadow-sm transition hover:bg-amber-300 disabled:opacity-60 sm:text-[15px]"
              >
                {loadingSubmit ? "Please wait…" : "Submit Now"}
              </button>

              <p className="text-center pt-0.5">
                <button
                  type="button"
                  onClick={dismiss}
                  className="text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                >
                  Maybe later
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
