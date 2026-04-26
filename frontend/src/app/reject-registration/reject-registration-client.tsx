"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { authRejectRegistration, errorMessageFromUnknown } from "@/lib/api-client";

export function RejectRegistrationClient() {
  const searchParams = useSearchParams();
  const rawToken = searchParams.get("token");
  const token = rawToken
    ? (() => {
        try {
          return decodeURIComponent(rawToken);
        } catch {
          return rawToken;
        }
      })()
    : null;

  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    if (!token) {
      setError("Missing token in the link. Open the reject link from the admin email.");
      return;
    }
    setLoading(true);
    try {
      const res = await authRejectRegistration({ token, reason: reason.trim() });
      setMessage(res.message);
    } catch (err) {
      setError(errorMessageFromUnknown(err));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Reject registration</h1>
          <p className="mt-3 text-sm text-red-800">
            Missing token in the link. Use the reject link from the MedAssist approval email.
          </p>
          <p className="mt-6">
            <Link href="/login" className="text-sm font-medium text-clinical-700 hover:underline">
              Back to log in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Reject registration</h1>
        <p className="mt-2 text-sm text-slate-600">
          Optionally explain why this registration is being rejected. The applicant will receive this
          by email.
        </p>

        {message ? (
          <div className="mt-4 space-y-2">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {message}
            </p>
            <p className="text-xs text-slate-500">
              This action is final for that link. If you open the same rejection link again, it will
              no longer work because the pending registration has been removed.
            </p>
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 space-y-2">
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
            <p className="text-xs text-slate-500">
              If you already submitted a rejection, the link stops working afterward — that is
              normal. For a new applicant, use the reject link from the latest approval email.
            </p>
          </div>
        ) : null}

        {!message ? (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="reject-reason" className="block text-sm font-medium text-slate-700">
                Reason (optional)
              </label>
              <textarea
                id="reject-reason"
                rows={5}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-clinical-600 focus:ring-1 focus:ring-clinical-600"
                placeholder="e.g. Incomplete credentials, duplicate request, …"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Submitting…" : "Reject and notify applicant"}
            </button>
          </form>
        ) : null}

        <p className="mt-6 text-sm">
          <Link href="/login" className="font-medium text-clinical-700 hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
