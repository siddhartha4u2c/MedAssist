import { Suspense } from "react";
import { RejectRegistrationClient } from "./reject-registration-client";

export default function RejectRegistrationPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-16 text-slate-600">Loading…</div>
      }
    >
      <RejectRegistrationClient />
    </Suspense>
  );
}
