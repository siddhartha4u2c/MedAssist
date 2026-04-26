import { Suspense } from "react";
import { VerifyEmailClient } from "./verify-email-client";

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-16 text-slate-600">
          Loading activation…
        </div>
      }
    >
      <VerifyEmailClient />
    </Suspense>
  );
}
