"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthMarketingAside } from "@/components/landing/auth-marketing-aside";
import {
  authLogin,
  errorMessageFromUnknown,
  type UserRole,
} from "@/lib/api-client";
import {
  getStoredAccessToken,
  getStoredUserJson,
  setPortalSession,
} from "@/lib/auth-storage";
import { ViewportThemeToggle } from "@/components/layout/viewport-theme-toggle";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>("patient");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) return;
    try {
      const raw = getStoredUserJson();
      if (!raw) return;
      const u = JSON.parse(raw) as { role?: string };
      if (u.role === "admin") router.replace("/admin");
      else if (u.role === "doctor") router.replace("/doctor/patients");
      else router.replace("/patient");
    } catch {
      /* ignore */
    }
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const em = email.trim();
    if (!em) {
      setError("Enter your email.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setLoading(true);
    try {
      const res = await authLogin(em, password, role);
      if (typeof window !== "undefined") {
        setPortalSession(rememberMe, res.access_token, JSON.stringify(res.user));
      }
      const target =
        res.user.role === "admin"
          ? "/admin"
          : res.user.role === "doctor"
            ? "/doctor/patients"
            : "/patient";
      router.push(target);
    } catch (err) {
      const msg = errorMessageFromUnknown(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ViewportThemeToggle />
      <div className="flex min-h-screen flex-col bg-slate-100 dark:bg-slate-950 lg:flex-row">
        <AuthMarketingAside variant="login" />

        <div className="flex flex-1 items-start justify-center px-4 py-8 sm:py-10 lg:items-center lg:py-12">
          <div className="w-full max-w-[22rem] shrink-0">
            <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-md dark:border-slate-700 dark:bg-slate-900">
              <h1 className="sr-only">Log in</h1>
              <form onSubmit={onSubmit} className="space-y-3.5" noValidate>
                <div>
                  <label htmlFor="login-role" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Login as
                  </label>
                  <select
                    id="login-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none transition focus:border-clinical-600 focus:ring-1 focus:ring-clinical-600 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="patient">Patient</option>
                    <option value="doctor">Doctor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Email</label>
                  <input
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none transition focus:border-clinical-600 focus:ring-1 focus:ring-clinical-600 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Password</label>
                    <Link
                      href="/forgot-password"
                      className="text-[11px] font-medium text-clinical-700 hover:underline dark:text-sky-400"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative mt-1">
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 pr-10 text-sm text-slate-900 outline-none transition focus:border-clinical-600 focus:ring-1 focus:ring-clinical-600 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 inline-flex items-center px-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/90 px-2.5 py-2 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-clinical-600 focus:ring-clinical-600"
                  />
                  <span className="font-medium">Remember me</span>
                </label>

                {error ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-clinical-600 py-2 text-sm font-semibold text-white shadow-sm hover:bg-clinical-900 disabled:opacity-50"
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>

                <p className="text-center text-xs text-slate-600 dark:text-slate-400">
                  New user ?{" "}
                  <Link
                    href="/register"
                    className="font-semibold text-clinical-700 underline-offset-2 hover:underline dark:text-sky-400"
                  >
                    Register
                  </Link>
                </p>
              </form>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
