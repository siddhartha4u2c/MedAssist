"use client";

import Link from "next/link";
import { useState } from "react";
import { authForgotPassword, errorMessageFromUnknown } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const em = email.trim();
    if (!em) {
      setError("Enter your email.");
      return;
    }
    setLoading(true);
    try {
      await authForgotPassword(em);
      setDone(true);
    } catch (err) {
      setError(errorMessageFromUnknown(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Check your email</h1>
          <p className="mt-2 text-slate-600">
            If that address is registered, we sent a password reset link. It is valid for 1
            hour.
          </p>
          <p className="mt-4">
            <Link href="/login" className="font-medium text-clinical-700 hover:underline">
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
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Forgot password
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Enter the email you used to register. We will send a reset link if it exists.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="text"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            {loading ? "Sending…" : "Send reset link"}
          </button>

          <p className="text-center text-sm text-slate-600">
            <Link href="/login" className="font-medium text-clinical-700 hover:underline">
              Back to log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
