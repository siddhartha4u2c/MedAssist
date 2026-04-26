import { Suspense } from "react";
import { ResetPasswordClient } from "./reset-password-client";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-16 text-slate-600">
          Loading…
        </div>
      }
    >
      <ResetPasswordClient />
    </Suspense>
  );
}
