"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  appointmentsGet,
  errorMessageFromUnknown,
  type AppointmentRow,
} from "@/lib/api-client";
import { DailyTelemedicineRoom } from "./daily-telemedicine-room";

export function TelemedicineVideoSession({
  appointmentId,
  backHref,
}: {
  appointmentId: string;
  backHref: string;
}) {
  const [row, setRow] = useState<AppointmentRow | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const r = await appointmentsGet(appointmentId);
      const a = r.appointment;
      if (a.mode !== "telemedicine") {
        setErr("This visit is not a telemedicine appointment.");
        setRow(null);
        return;
      }
      if (!(a.videoJoinUrl || "").trim()) {
        setErr(
          "No video link for this appointment yet. Return to appointments and use “Create video link” if needed."
        );
        setRow(null);
        return;
      }
      setRow(a);
    } catch (e) {
      setErr(errorMessageFromUnknown(e));
      setRow(null);
    }
  }, [appointmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <Link href={backHref} className="text-sm font-medium text-clinical-700 hover:text-clinical-900">
          ← Back to appointments
        </Link>
      </div>
      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</p>
      ) : null}
      {row?.videoJoinUrl ? (
        <DailyTelemedicineRoom roomUrl={(row.videoJoinUrl || "").trim()} />
      ) : !err ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : null}
    </div>
  );
}
