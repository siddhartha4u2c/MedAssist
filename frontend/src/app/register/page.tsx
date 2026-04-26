"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthMarketingAside } from "@/components/landing/auth-marketing-aside";
import {
  authRegister,
  errorCodeFromUnknown,
  errorMessageFromUnknown,
  type UserRole,
} from "@/lib/api-client";
import {
  NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validateRegisterForm,
  type FieldErrors,
} from "@/lib/register-validation";
import { ViewportThemeToggle } from "@/components/layout/viewport-theme-toggle";

function inputClass(invalid: boolean): string {
  return [
    "mt-1 w-full rounded-lg border px-2.5 py-2 text-sm outline-none transition",
    "focus:border-clinical-600 focus:ring-1 focus:ring-clinical-600",
    invalid
      ? "border-red-400 bg-red-50/50 text-red-900 placeholder:text-red-400"
      : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400",
    "dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500",
  ].join(" ");
}

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const queryRole = (searchParams.get("role") || "").toLowerCase();
  const initialRole: UserRole = queryRole === "doctor" ? "doctor" : "patient";
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [role, setRole] = useState<UserRole>(initialRole);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [apiErrorCode, setApiErrorCode] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState(false);
  const [successPayload, setSuccessPayload] = useState<{
    message: string;
    email: string;
    email_delivery?: "smtp" | "console";
    next_steps?: string[];
    role: UserRole;
  } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setApiErrorCode(undefined);
    setFieldErrors({});

    const local = validateRegisterForm({
      email,
      first_name: firstName,
      last_name: lastName,
      password,
      confirm,
      role,
    });
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      setFormError("Please correct the fields below and try again.");
      return;
    }

    setLoading(true);
    try {
      const res = await authRegister({
        email: email.trim(),
        first_name: role === "patient" ? (firstName.trim() || "Patient") : firstName.trim(),
        last_name: lastName.trim(),
        password,
        password_confirm: confirm,
        role,
      });
      setSuccessPayload({
        message: res.message,
        email: res.email,
        email_delivery: res.email_delivery,
        next_steps: res.next_steps,
        role,
      });
      setDone(true);
    } catch (err) {
      setApiErrorCode(errorCodeFromUnknown(err));
      setFormError(errorMessageFromUnknown(err));
    } finally {
      setLoading(false);
    }
  }

  if (done && successPayload) {
    const isPatient = successPayload.role === "patient";
    const steps = isPatient
      ? [
          "Your patient account is active immediately.",
          "Sign in with your email and password.",
        ]
      : successPayload.next_steps && successPayload.next_steps.length > 0
        ? successPayload.next_steps
        : [
            "Your request is waiting for admin approval.",
            "After approval, you will receive a confirmation email.",
            "If no decision is made within 24 hours, your registration will be automatically rejected (you will be emailed).",
            "Return here and sign in with your email and password.",
          ];

    return (
      <>
        <ViewportThemeToggle />
        <div className="flex min-h-screen flex-col bg-slate-100 dark:bg-slate-950 lg:flex-row">
          <AuthMarketingAside variant="register" />

          <div className="flex flex-1 items-start justify-center px-4 py-8 sm:py-10 lg:items-center lg:py-12">
            <div className="w-full max-w-md shrink-0">
              <section
                className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50 to-white shadow-md dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-slate-900"
                role="status"
                aria-live="polite"
              >
                <div className="border-b border-emerald-100 px-5 py-4 dark:border-emerald-900/60">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                    Registration complete
                  </p>
                  <h1 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">
                    {isPatient
                      ? "Registration complete"
                      : successPayload.email_delivery === "console"
                      ? "Request submitted (dev email mode)"
                      : successPayload.email_delivery
                        ? "Approval request sent"
                        : "Registration complete"}
                  </h1>
                </div>
                <div className="space-y-4 px-5 py-5">
                  {!isPatient && successPayload.email_delivery === "console" ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                      <p className="font-medium">No email was sent in this mode.</p>
                      <p className="mt-2 leading-relaxed">
                        The server is using <strong>DEV_SKIP_EMAIL</strong>. Open the{" "}
                        <strong>terminal where Flask is running</strong> and look for{" "}
                        <code className="rounded bg-amber-100 px-1 py-0.5 text-[10px] dark:bg-amber-900/80">
                          [DEV_SKIP_EMAIL]
                        </code>{" "}
                        — the admin approval link is printed there.
                      </p>
                    </div>
                  ) : null}
                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    {isPatient ? "Your patient account was created successfully." : successPayload.message}
                  </p>
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">What to do next</p>
                    <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center rounded-lg bg-clinical-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-clinical-900"
                    >
                      Continue to sign in
                    </Link>
                    <Link
                      href="/"
                      className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-800/80"
                    >
                      Back to home
                    </Link>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </>
    );
  }

  const showExistingUserLinks =
    apiErrorCode === "USER_EXISTS" ||
    (formError && formError.toLowerCase().includes("already exists"));

  return (
    <>
      <ViewportThemeToggle />
      <div className="flex min-h-screen flex-col bg-slate-100 dark:bg-slate-950 lg:flex-row">
        <AuthMarketingAside variant="register" />

        <div className="flex flex-1 items-start justify-center px-4 py-8 sm:py-10 lg:items-center lg:py-12">
          <div className="w-full max-w-md shrink-0">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-md dark:border-slate-700 dark:bg-slate-900">
              <header className="border-b border-slate-100 pb-4 dark:border-slate-700">
                <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white sm:text-xl">
                  Create your MedAssist account
                </h1>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Patients can register instantly with email and password. Doctor accounts require
                  admin approval.
                </p>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  Already registered?{" "}
                  <Link
                    href="/login"
                    className="font-semibold text-clinical-700 hover:underline dark:text-sky-400"
                  >
                    Sign in
                  </Link>
                </p>
              </header>

              <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
                {formError ? (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50/90 px-3 py-2.5 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
                    role="alert"
                  >
                    <p className="font-medium">We could not complete registration</p>
                    <p className="mt-1 text-red-800/95 dark:text-red-100/90">{formError}</p>
                    {showExistingUserLinks ? (
                      <p className="mt-2">
                        <Link
                          href="/login"
                          className="font-semibold text-clinical-800 underline hover:no-underline dark:text-sky-400"
                        >
                          Go to sign in
                        </Link>{" "}
                        or use{" "}
                        <Link
                          href="/forgot-password"
                          className="font-semibold text-clinical-800 underline hover:no-underline dark:text-sky-400"
                        >
                          Forgot password
                        </Link>
                        .
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <section>
                  <div>
                    <label htmlFor="reg-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Work or personal email
                    </label>
                    <input
                      id="reg-email"
                      type="text"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
                      }}
                      className={inputClass(Boolean(fieldErrors.email))}
                      aria-invalid={Boolean(fieldErrors.email)}
                      aria-describedby={fieldErrors.email ? "reg-email-err" : undefined}
                      placeholder="you@example.com"
                    />
                    {fieldErrors.email ? (
                      <p id="reg-email-err" className="mt-1 text-xs text-red-700 dark:text-red-400">
                        {fieldErrors.email}
                      </p>
                    ) : null}
                  </div>
                  {role === "doctor" ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="reg-first-name"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        First name
                      </label>
                      <input
                        id="reg-first-name"
                        type="text"
                        autoComplete="given-name"
                        value={firstName}
                        onChange={(e) => {
                          setFirstName(e.target.value);
                          if (fieldErrors.first_name)
                            setFieldErrors((f) => ({ ...f, first_name: undefined }));
                        }}
                        className={inputClass(Boolean(fieldErrors.first_name))}
                        aria-invalid={Boolean(fieldErrors.first_name)}
                        aria-describedby={fieldErrors.first_name ? "reg-first-name-err" : undefined}
                        placeholder="Legal first name"
                        maxLength={NAME_MAX_LENGTH}
                      />
                      {fieldErrors.first_name ? (
                        <p id="reg-first-name-err" className="mt-1 text-xs text-red-700 dark:text-red-400">
                          {fieldErrors.first_name}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label
                        htmlFor="reg-last-name"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        Last name <span className="font-normal text-slate-500">(optional)</span>
                      </label>
                      <input
                        id="reg-last-name"
                        type="text"
                        autoComplete="family-name"
                        value={lastName}
                        onChange={(e) => {
                          setLastName(e.target.value);
                          if (fieldErrors.last_name)
                            setFieldErrors((f) => ({ ...f, last_name: undefined }));
                        }}
                        className={inputClass(Boolean(fieldErrors.last_name))}
                        aria-invalid={Boolean(fieldErrors.last_name)}
                        aria-describedby={fieldErrors.last_name ? "reg-last-name-err" : undefined}
                        placeholder="Optional"
                        maxLength={NAME_MAX_LENGTH}
                      />
                      {fieldErrors.last_name ? (
                        <p id="reg-last-name-err" className="mt-1 text-xs text-red-700 dark:text-red-400">
                          {fieldErrors.last_name}
                        </p>
                      ) : null}
                    </div>
                    </div>
                  ) : null}
                </section>

                <section aria-labelledby="reg-role">
                  <h2 id="reg-role" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Your role
                  </h2>
                  <fieldset className="mt-2">
                    <legend className="sr-only">Register as patient or doctor</legend>
                    <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
                      {(
                        [
                          { id: "patient" as const, label: "Patient", hint: "Access your own care" },
                          {
                            id: "doctor" as const,
                            label: "Doctor",
                            hint: "Clinical / provider access",
                          },
                        ] as const
                      ).map((opt) => (
                        <label
                          key={opt.id}
                          className={[
                            "flex flex-1 cursor-pointer rounded-xl border px-3 py-2.5 transition",
                            role === opt.id
                              ? "border-clinical-600 bg-clinical-50/80 ring-1 ring-clinical-600 dark:bg-clinical-950/40"
                              : "border-slate-200 hover:border-slate-300 dark:border-slate-600 dark:hover:border-slate-500",
                          ].join(" ")}
                        >
                          <input
                            type="radio"
                            name="role"
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 border-slate-300 text-clinical-600 focus:ring-clinical-600"
                            checked={role === opt.id}
                            onChange={() => {
                              setRole(opt.id);
                              if (fieldErrors.role) setFieldErrors((f) => ({ ...f, role: undefined }));
                            }}
                          />
                          <span className="ml-2 min-w-0">
                            <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {opt.label}
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                              {opt.hint}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {fieldErrors.role ? (
                      <p className="mt-1.5 text-xs text-red-700 dark:text-red-400">{fieldErrors.role}</p>
                    ) : null}
                  </fieldset>
                </section>

                <section>
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="reg-password"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        Password
                      </label>
                      <div className="relative">
                        <input
                          id="reg-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (fieldErrors.password)
                              setFieldErrors((f) => ({ ...f, password: undefined }));
                          }}
                          className={`${inputClass(Boolean(fieldErrors.password))} pr-10`}
                          aria-invalid={Boolean(fieldErrors.password)}
                          aria-describedby="reg-password-hint reg-password-err"
                          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute inset-y-0 right-0 mt-1 inline-flex items-center px-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? "🙈" : "👁"}
                        </button>
                      </div>
                      <p id="reg-password-hint" className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Use at least {PASSWORD_MIN_LENGTH} characters. Avoid passwords you use on other sites.
                      </p>
                      {fieldErrors.password ? (
                        <p id="reg-password-err" className="mt-1 text-xs text-red-700 dark:text-red-400">
                          {fieldErrors.password}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label
                        htmlFor="reg-confirm"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        Confirm password
                      </label>
                      <div className="relative">
                        <input
                          id="reg-confirm"
                          type={showConfirm ? "text" : "password"}
                          autoComplete="new-password"
                          value={confirm}
                          onChange={(e) => {
                            setConfirm(e.target.value);
                            if (fieldErrors.confirm)
                              setFieldErrors((f) => ({ ...f, confirm: undefined }));
                          }}
                          className={`${inputClass(Boolean(fieldErrors.confirm))} pr-10`}
                          aria-invalid={Boolean(fieldErrors.confirm)}
                          aria-describedby={fieldErrors.confirm ? "reg-confirm-err" : undefined}
                          placeholder="Re-enter password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirm((v) => !v)}
                          className="absolute inset-y-0 right-0 mt-1 inline-flex items-center px-2.5 text-slate-500 hover:text-slate-700 dark:text-slate-400"
                          aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                        >
                          {showConfirm ? "🙈" : "👁"}
                        </button>
                      </div>
                      {fieldErrors.confirm ? (
                        <p id="reg-confirm-err" className="mt-1 text-xs text-red-700 dark:text-red-400">
                          {fieldErrors.confirm}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </section>

                <div className="border-t border-slate-100 pt-1 dark:border-slate-700">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-clinical-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-clinical-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Submitting registration…" : "Create account"}
                  </button>
                  <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    By registering you agree to use MedAssist in line with your organisation&apos;s policies and
                    applicable regulations.
                  </p>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
