"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { authVerifyEmail, errorMessageFromUnknown } from "@/lib/api-client";

export function VerifyEmailClient() {
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

  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("err");
      setMessage("Missing approval token in the link.");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    authVerifyEmail(token)
      .then((r) => {
        if (!cancelled) {
          setStatus("ok");
          setMessage(r.message);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus("err");
          setMessage(errorMessageFromUnknown(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Account approval
        </h1>

        {status === "loading" ? (
          <p className="mt-4 text-slate-600">
            Verifying your link… If this never finishes, start Flask on port 5000 and
            restart <code className="rounded bg-slate-100 px-1 text-xs">npm run dev</code>{" "}
            (needed after changing <code className="rounded bg-slate-100 px-1 text-xs">.env.local</code>{" "}
            or <code className="rounded bg-slate-100 px-1 text-xs">next.config.mjs</code>).
          </p>
        ) : null}

        {status === "ok" ? (
          <>
            <p className="mt-4 text-slate-600">{message}</p>
            <p className="mt-6">
              <Link
                href="/login"
                className="rounded-lg bg-clinical-600 px-4 py-2 text-sm font-medium text-white hover:bg-clinical-900"
              >
                Go to log in
              </Link>
            </p>
          </>
        ) : null}

        {status === "err" ? (
          <>
            <p className="mt-4 text-red-800">{message}</p>
            <p className="mt-4 text-sm text-slate-600">
              <Link href="/register" className="font-medium text-clinical-700 underline">
                Register again
              </Link>{" "}
              or{" "}
              <Link href="/login" className="font-medium text-clinical-700 underline">
                try logging in
              </Link>
              .
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
