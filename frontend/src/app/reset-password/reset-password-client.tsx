"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { authResetPassword, errorMessageFromUnknown } from "@/lib/api-client";

export function ResetPasswordClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("Missing reset token.");
      return;
    }
    setLoading(true);
    try {
      await authResetPassword({
        token,
        password,
        password_confirm: confirm,
      });
      setDone(true);
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
          <h1 className="text-xl font-semibold text-slate-900">Invalid link</h1>
          <p className="mt-2 text-slate-600">
            Open the reset link from your email, or{" "}
            <Link href="/forgot-password" className="font-medium text-clinical-700 underline">
              request a new one
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Password updated</h1>
          <p className="mt-2 text-slate-600">
            You can now{" "}
            <Link href="/login" className="font-medium text-clinical-700 underline">
              sign in
            </Link>{" "}
            with your new password.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Set new password
        </h1>
        <p className="mt-1 text-sm text-slate-600">Choose a strong password (min. 8 characters).</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700">New password</label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Confirm password
            </label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-clinical-600 py-2.5 text-sm font-medium text-white hover:bg-clinical-900 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
