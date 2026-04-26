"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  appointmentsBusy,
  appointmentsCancel,
  appointmentsCreate,
  appointmentsDirectorySearch,
  appointmentsMine,
  appointmentsProvisionVideo,
  appointmentsUnavailableBlocksCreate,
  appointmentsUnavailableBlocksDelete,
  appointmentsUnavailableBlocksList,
  errorMessageFromUnknown,
  type AppointmentBusyBlock,
  type AppointmentDirectoryDoctor,
  type AppointmentDirectoryPerson,
  type AppointmentRow,
  type DoctorUnavailableBlock,
} from "@/lib/api-client";
import {
  formatApptRange,
  formatLocalHmRange,
  formatLocalHmRangeWithinDay,
  localDateTimesToIso,
  monthUtcRange,
} from "@/lib/appointments-time";
import {
  localDayKey,
  localMonthKeyBounds,
  mineByLocalDayKey,
  MonthCalendar,
} from "@/components/appointments/month-calendar";

function busyToDayKeys(busyByUserId: Record<string, AppointmentBusyBlock[]>): Set<string> {
  const keys = new Set<string>();
  for (const blocks of Object.values(busyByUserId)) {
    for (const b of blocks) {
      const start = new Date(b.startsAt);
      const end = new Date(b.endsAt);
      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cur <= last) {
        keys.add(localDayKey(cur));
        cur.setDate(cur.getDate() + 1);
      }
    }
  }
  return keys;
}

function intervalTouchesDay(startsAtIso: string, endsAtIso: string, dayKey: string): boolean {
  const start = new Date(startsAtIso);
  const end = new Date(endsAtIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const dayStart = new Date(`${dayKey}T00:00:00`);
  const dayEnd = new Date(`${dayKey}T23:59:59.999`);
  return start <= dayEnd && end >= dayStart;
}

function hmToMinutes(hm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec((hm || "").trim());
  if (!m) return 0;
  const h = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return h * 60 + mm;
}

function minutesToHm(totalMinutes: number): string {
  const n = Math.max(0, Math.min(23 * 60 + 59, Math.trunc(totalMinutes)));
  const h = Math.floor(n / 60);
  const m = n % 60;
  const hh = h < 10 ? `0${h}` : String(h);
  const mm = m < 10 ? `0${m}` : String(m);
  return `${hh}:${mm}`;
}

type Pick =
  | { kind: "patient"; p: AppointmentDirectoryPerson }
  | { kind: "doctor"; p: AppointmentDirectoryDoctor };

export default function DoctorAppointmentsPage() {
  const now = new Date();
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth());
  const [q, setQ] = useState("");
  const [patients, setPatients] = useState<AppointmentDirectoryPerson[]>([]);
  const [doctors, setDoctors] = useState<AppointmentDirectoryDoctor[]>([]);
  const [picked, setPicked] = useState<Pick | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(localDayKey(now));
  const [startHm, setStartHm] = useState("10:00");
  const [endHm, setEndHm] = useState("10:30");
  const [mode, setMode] = useState<"telemedicine" | "in_person">("in_person");
  const [reason, setReason] = useState("");
  const [busyBy, setBusyBy] = useState<Record<string, AppointmentBusyBlock[]>>({});
  const [mine, setMine] = useState<AppointmentRow[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [provisionId, setProvisionId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AppointmentRow | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const videoProvisionTried = useRef(new Set<string>());
  const [videoProvisionNotes, setVideoProvisionNotes] = useState<Record<string, string>>({});
  const [myUnavailableBlocks, setMyUnavailableBlocks] = useState<DoctorUnavailableBlock[]>([]);
  const [unavailNote, setUnavailNote] = useState("");
  const [unavailBusy, setUnavailBusy] = useState(false);
  const [unavailMsg, setUnavailMsg] = useState("");
  const [unavailStartHm, setUnavailStartHm] = useState("10:00");
  const [unavailEndHm, setUnavailEndHm] = useState("10:30");

  const { from, to } = useMemo(() => monthUtcRange(y, m), [y, m]);

  const patientDisplayByUserId = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of patients) m.set(p.userId, p.displayName);
    if (picked?.kind === "patient") m.set(picked.p.userId, picked.p.displayName);
    return m;
  }, [patients, picked]);

  const otherUserIds = useMemo(() => {
    if (!picked) return [];
    return [picked.p.userId];
  }, [picked]);

  const selfBusyUserId = useMemo(() => {
    const keys = Object.keys(busyBy);
    if (keys.length === 0) return "";
    const others = new Set(otherUserIds);
    return keys.find((id) => !others.has(id)) || keys[0];
  }, [busyBy, otherUserIds]);

  const loadCalendar = useCallback(async () => {
    setMsg("");
    try {
      const busy = await appointmentsBusy({ userIds: otherUserIds, from, to });
      setBusyBy(busy.busyByUserId);
      const ap = await appointmentsMine({ from, to, status: "all" });
      setMine(ap.appointments);
      const ub = await appointmentsUnavailableBlocksList({ from, to });
      setMyUnavailableBlocks(ub.blocks);
    } catch (e) {
      setMsg(errorMessageFromUnknown(e));
    }
  }, [from, to, otherUserIds]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    const now = Date.now();
    const pending = mine
      .filter(
        (a) =>
          new Date(a.endsAt).getTime() > now &&
          (a.status || "scheduled") === "scheduled" &&
          a.mode === "telemedicine" &&
          !(a.videoJoinUrl || "").trim() &&
          !videoProvisionTried.current.has(a.id)
      )
      .slice(0, 8);
    if (pending.length === 0) return;

    let alive = true;
    (async () => {
      const notes: Record<string, string> = {};
      for (const a of pending) {
        videoProvisionTried.current.add(a.id);
        try {
          const r = await appointmentsProvisionVideo(a.id);
          if (!(r.appointment.videoJoinUrl || "").trim()) {
            notes[a.id] =
              (r.videoProvisioningWarning || "").trim() ||
              "Daily.co did not return a join URL. Check Flask logs for [Daily.co].";
          }
        } catch (e) {
          notes[a.id] = errorMessageFromUnknown(e);
        }
        if (!alive) return;
      }
      if (Object.keys(notes).length) {
        setVideoProvisionNotes((prev) => ({ ...prev, ...notes }));
      }
      if (!alive) return;
      try {
        const busy = await appointmentsBusy({ userIds: otherUserIds, from, to });
        if (!alive) return;
        setBusyBy(busy.busyByUserId);
        const ap = await appointmentsMine({ from, to, status: "all" });
        if (!alive) return;
        setMine(ap.appointments);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [mine, from, to, otherUserIds]);

  useEffect(() => {
    setVideoProvisionNotes((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        const row = mine.find((x) => x.id === id);
        if (row && ((row.videoJoinUrl || "").trim() || new Date(row.endsAt).getTime() <= Date.now())) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [mine]);

  const search = useCallback(async () => {
    setMsg("");
    try {
      const r = await appointmentsDirectorySearch(q);
      setPatients(r.patients);
      setDoctors(r.doctors);
    } catch (e) {
      setMsg(errorMessageFromUnknown(e));
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => void search(), 300);
    return () => clearTimeout(t);
  }, [search]);

  const busyDayKeys = useMemo(() => busyToDayKeys(busyBy), [busyBy]);
  const unavailableDayKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const b of myUnavailableBlocks) {
      const start = new Date(b.startsAt);
      const end = new Date(b.endsAt);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cur <= last) {
        keys.add(localDayKey(cur));
        cur.setDate(cur.getDate() + 1);
      }
    }
    return keys;
  }, [myUnavailableBlocks]);
  const busyDayKeysWithUnavailable = useMemo(() => {
    const merged = new Set<string>(busyDayKeys);
    for (const k of Array.from(unavailableDayKeys)) merged.add(k);
    return merged;
  }, [busyDayKeys, unavailableDayKeys]);

  /** Visits that have not ended yet (excludes past blocks in the list and on the month grid). */
  const mineUpcoming = useMemo(() => {
    const t = Date.now();
    return mine.filter((a) => new Date(a.endsAt).getTime() > t);
  }, [mine]);

  const myBookedDayKeys = useMemo(
    () => new Set(mineByLocalDayKey(mineUpcoming).keys()),
    [mineUpcoming]
  );

  const bookableFromDayKey = localDayKey(new Date());

  const selectedDayBusyRows = useMemo(() => {
    if (!selectedDay || !selfBusyUserId) return [] as AppointmentBusyBlock[];
    const apiRows = busyBy[selfBusyUserId] || [];
    const unavailableRows: AppointmentBusyBlock[] = myUnavailableBlocks.map((b) => ({
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      mode: "unavailable",
      appointmentId: null,
      unavailableBlockId: b.id,
    }));
    const rows = [...apiRows, ...unavailableRows];
    const dedup = new Map<string, AppointmentBusyBlock>();
    for (const r of rows) {
      const key = `${r.startsAt}|${r.endsAt}|${r.mode}|${r.appointmentId || ""}|${r.unavailableBlockId || ""}`;
      dedup.set(key, r);
    }
    return Array.from(dedup.values())
      .filter((b) => {
        return intervalTouchesDay(b.startsAt, b.endsAt, selectedDay);
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [busyBy, selfBusyUserId, selectedDay, myUnavailableBlocks]);

  const selectableHalfHourSlots = useMemo(() => {
    if (!selectedDay) return [] as string[];
    const out: string[] = [];
    for (let minute = 6 * 60; minute <= 22 * 60; minute += 30) {
      const h = minutesToHm(minute);
      out.push(h);
    }
    return out;
  }, [selectedDay]);

  useEffect(() => {
    const todayKey = localDayKey(new Date());
    const { start: monthStart, end: monthEnd } = localMonthKeyBounds(y, m);
    setSelectedDay((prev) => {
      if (prev && prev >= monthStart && prev <= monthEnd) return prev;
      if (todayKey >= monthStart && todayKey <= monthEnd) return todayKey;
      return monthStart;
    });
  }, [y, m]);

  async function book() {
    if (!picked || picked.kind !== "patient" || !selectedDay) {
      setMsg("Select a patient to book with. (Scheduling with another doctor is availability-only for now.)");
      return;
    }
    const todayKey = localDayKey(new Date());
    if (selectedDay < todayKey) {
      setMsg("Bookings are only for today or future dates.");
      return;
    }
    const iso = localDateTimesToIso(selectedDay, startHm, endHm);
    if (!iso) {
      setMsg("Invalid start / end times.");
      return;
    }
    if (new Date(iso.startsAt).getTime() < Date.now() - 60_000) {
      setMsg("That start time is already in the past. Pick a later time today or another day.");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      const created = await appointmentsCreate({
        patientUserId: picked.p.userId,
        mode,
        startsAt: iso.startsAt,
        endsAt: iso.endsAt,
        reason: reason.trim() || undefined,
      });
      setReason("");
      let appt = created.appointment;
      let videoNote = created.videoProvisioningWarning;
      if (appt.mode === "telemedicine" && !(appt.videoJoinUrl || "").trim()) {
        try {
          const prov = await appointmentsProvisionVideo(appt.id);
          appt = prov.appointment;
          videoNote = prov.videoProvisioningWarning ?? videoNote;
        } catch {
          /* keep create response */
        }
      }
      await loadCalendar();
      setMsg(
        videoNote ||
          (mode === "telemedicine" && !(appt.videoJoinUrl || "").trim()
            ? "Appointment booked. Set DAILY_API_KEY (Daily.co) on the server so a video room can be created."
            : "Appointment booked.")
      );
    } catch (e) {
      setMsg(errorMessageFromUnknown(e));
    } finally {
      setLoading(false);
    }
  }

  async function confirmCancelAppointment() {
    if (!cancelTarget) return;
    setCancelBusy(true);
    setMsg("");
    try {
      await appointmentsCancel(cancelTarget.id, {
        cancellationReason: cancelReasonInput.trim() || undefined,
      });
      setCancelTarget(null);
      setCancelReasonInput("");
      await loadCalendar();
      setMsg("Cancelled. You and the patient were notified by email (if mail is configured).");
    } catch (e) {
      setMsg(errorMessageFromUnknown(e));
    } finally {
      setCancelBusy(false);
    }
  }

  async function provisionVideo(id: string) {
    setMsg("");
    setProvisionId(id);
    try {
      const r = await appointmentsProvisionVideo(id);
      await loadCalendar();
      const w = (r.videoProvisioningWarning || "").trim();
      if (!(r.appointment.videoJoinUrl || "").trim()) {
        setVideoProvisionNotes((prev) => ({
          ...prev,
          [id]: w || "No join URL returned — check Daily.co and Flask logs for [Daily.co].",
        }));
      } else {
        setVideoProvisionNotes((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
      setMsg(
        w || (r.appointment.videoJoinUrl ? "Video link is ready." : "No link returned — see details under the visit.")
      );
    } catch (e) {
      const err = errorMessageFromUnknown(e);
      setVideoProvisionNotes((prev) => ({ ...prev, [id]: err }));
      setMsg(err);
    } finally {
      setProvisionId(null);
    }
  }

  async function addUnavailableBlock() {
    if (!selectedDay) {
      setUnavailMsg("Pick a calendar day first.");
      return;
    }
    const iso = localDateTimesToIso(selectedDay, unavailStartHm, unavailEndHm);
    if (!iso) {
      setUnavailMsg("End time must be after start time.");
      return;
    }
    setUnavailBusy(true);
    setMsg("");
    setUnavailMsg("");
    try {
      const res = await appointmentsUnavailableBlocksCreate({
        startsAt: iso.startsAt,
        endsAt: iso.endsAt,
        ...(unavailNote.trim() ? { note: unavailNote.trim() } : {}),
      });
      setMyUnavailableBlocks((prev) => {
        const next = [...prev, res.block];
        next.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
        return next;
      });
      setUnavailNote("");
      void loadCalendar();
      setUnavailMsg("Unavailable time saved.");
      setMsg("Unavailable time saved. Patients cannot book into that window.");
    } catch (e) {
      const err = errorMessageFromUnknown(e);
      setUnavailMsg(err);
      setMsg(err);
    } finally {
      setUnavailBusy(false);
    }
  }

  function applyUnavailableSlot(hm: string) {
    const nextStart = hmToMinutes(hm);
    const curStart = hmToMinutes(unavailStartHm);
    const curEnd = hmToMinutes(unavailEndHm);
    if (nextStart < curStart || nextStart >= curEnd) {
      const end = Math.min(nextStart + 30, 23 * 60 + 59);
      setUnavailStartHm(minutesToHm(nextStart));
      setUnavailEndHm(minutesToHm(end));
      return;
    }
    // Expand end when clicking inside current range.
    const nextEnd = Math.min(nextStart + 30, 23 * 60 + 59);
    setUnavailEndHm(minutesToHm(nextEnd));
  }

  async function removeUnavailableBlock(id: string) {
    setMsg("");
    setUnavailMsg("");
    try {
      await appointmentsUnavailableBlocksDelete(id);
      setMyUnavailableBlocks((prev) => prev.filter((b) => b.id !== id));
      void loadCalendar();
    } catch (e) {
      const err = errorMessageFromUnknown(e);
      setUnavailMsg(err);
      setMsg(err);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Appointments</h1>
        <p className="mt-1 text-sm text-slate-600">
          Search verified patients and colleagues. Calendar shows combined busy times (including your unavailable
          blocks). Booking is supported with patients only.
        </p>
      </div>

      {msg ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{msg}</p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Search people</h2>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Name, email, or profile…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase text-slate-400">Patients</p>
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                {patients.length === 0 ? (
                  <li className="px-2 py-2 text-xs text-slate-500">No matches.</li>
                ) : (
                  patients.map((p) => (
                    <li key={p.userId}>
                      <button
                        type="button"
                        onClick={() => setPicked({ kind: "patient", p })}
                        className={
                          "w-full rounded-lg px-2 py-1.5 text-left text-xs " +
                          (picked?.kind === "patient" && picked.p.userId === p.userId
                            ? "bg-clinical-50 font-medium text-clinical-900"
                            : "hover:bg-slate-50")
                        }
                      >
                        {p.displayName}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-400">Doctors</p>
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                {doctors.length === 0 ? (
                  <li className="px-2 py-2 text-xs text-slate-500">No matches.</li>
                ) : (
                  doctors.map((p) => (
                    <li key={p.userId}>
                      <button
                        type="button"
                        onClick={() => setPicked({ kind: "doctor", p })}
                        className={
                          "w-full rounded-lg px-2 py-1.5 text-left text-xs " +
                          (picked?.kind === "doctor" && picked.p.userId === p.userId
                            ? "bg-amber-50 font-medium text-amber-950"
                            : "hover:bg-slate-50")
                        }
                      >
                        {p.displayName}
                        {p.specialization ? (
                          <span className="block text-[10px] text-slate-500">{p.specialization}</span>
                        ) : null}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
          {picked?.kind === "doctor" ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Colleague selected: calendar shows mutual availability. Create appointments with patients from the left
              list.
            </p>
          ) : null}
        </div>

        <div className="space-y-4">
          <MonthCalendar
            year={y}
            month={m}
            busyDayKeys={busyDayKeysWithUnavailable}
            myBookedDayKeys={myBookedDayKeys}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            bookableFromDayKey={bookableFromDayKey}
            onPrevMonth={() => {
              if (m === 0) {
                setM(11);
                setY((yy) => yy - 1);
              } else setM((mm) => mm - 1);
            }}
            onNextMonth={() => {
              if (m === 11) {
                setM(0);
                setY((yy) => yy + 1);
              } else setM((mm) => mm + 1);
            }}
          />

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              {picked?.kind === "patient"
                ? `Book with ${picked.p.displayName}`
                : "Book with a patient"}
            </h3>
            {picked?.kind === "patient" ? (
              <p className="mt-1 text-xs text-slate-600">{picked.p.email}</p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Select a patient from the search list on the left.</p>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Start (local)
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  value={startHm}
                  onChange={(e) => setStartHm(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                End (local)
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  value={endHm}
                  onChange={(e) => setEndHm(e.target.value)}
                />
              </label>
            </div>
            <label className="mt-3 block text-xs font-medium text-slate-600">
              Visit type
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                value={mode}
                onChange={(e) => setMode(e.target.value as "telemedicine" | "in_person")}
              >
                <option value="in_person">In person</option>
                <option value="telemedicine">Telemedicine</option>
              </select>
            </label>
            <label className="mt-3 block text-xs font-medium text-slate-600">
              Notes (optional)
              <textarea
                className="mt-1 min-h-[60px] w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={loading || picked?.kind !== "patient" || !selectedDay}
              onClick={() => void book()}
              className="mt-4 w-full rounded-lg bg-clinical-600 py-2 text-sm font-medium text-white hover:bg-clinical-900 disabled:opacity-50"
            >
              {loading
                ? "Booking…"
                : picked?.kind === "patient"
                  ? `Book with ${picked.p.displayName}`
                  : "Book appointment"}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Day schedule and unavailable time</h3>
            <p className="mt-1 text-xs text-slate-600">
              Click a date above to open that day. Pick half-hour slots below to set start/end, then save the
              unavailable period. This replaces the separate blocking card.
            </p>
            <p className="mt-2 text-xs font-medium text-slate-700">
              {selectedDay ? `Selected day: ${selectedDay}` : "Select a day in the calendar"}
            </p>
            {selectedDay ? (
              <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
                <p className="text-xs font-medium text-slate-700">Busy periods on this day</p>
                {selectedDayBusyRows.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">No existing busy/unavailable blocks.</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-xs text-slate-700">
                    {selectedDayBusyRows.map((b, i) => (
                      <li key={`${b.startsAt}-${b.endsAt}-${i}`} className="rounded bg-white px-2 py-1">
                        {formatLocalHmRangeWithinDay(selectedDay, new Date(b.startsAt), new Date(b.endsAt))} ·{" "}
                        {b.mode === "unavailable"
                          ? "Unavailable"
                          : b.mode === "telemedicine"
                            ? "Telemedicine"
                            : b.mode === "in_person"
                              ? "In person"
                              : "Booked"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
            <div className="mt-3">
              <p className="text-xs font-medium text-slate-700">Pick start/end using day slots</p>
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
                  {selectableHalfHourSlots.map((hm) => {
                    const m = hmToMinutes(hm);
                    const s = hmToMinutes(unavailStartHm);
                    const e = hmToMinutes(unavailEndHm);
                    const inSelection = m >= s && m < e;
                    return (
                      <button
                        key={hm}
                        type="button"
                        onClick={() => applyUnavailableSlot(hm)}
                        className={
                          "rounded border px-2 py-1 text-[11px] " +
                          (inSelection
                            ? "border-clinical-600 bg-clinical-50 text-clinical-900"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                        }
                      >
                        {hm}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Unavailable start
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  value={unavailStartHm}
                  onChange={(e) => setUnavailStartHm(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Unavailable end
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  value={unavailEndHm}
                  onChange={(e) => setUnavailEndHm(e.target.value)}
                />
              </label>
            </div>
            <label className="mt-3 block text-xs font-medium text-slate-600">
              Note (optional)
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                value={unavailNote}
                onChange={(e) => setUnavailNote(e.target.value)}
                placeholder="e.g. Conference, leave"
              />
            </label>
            <button
              type="button"
              disabled={unavailBusy || !selectedDay}
              onClick={() => void addUnavailableBlock()}
              className="mt-3 w-full rounded-lg border border-slate-400 bg-slate-100 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200 disabled:opacity-50"
            >
              {unavailBusy ? "Saving…" : "Save unavailable time"}
            </button>
            {unavailMsg ? (
              <p
                className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
                  /saved/i.test(unavailMsg)
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                }`}
              >
                {unavailMsg}
              </p>
            ) : null}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="text-xs font-medium uppercase text-slate-500">Your blocks this month</p>
              {myUnavailableBlocks.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">None in this month.</p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-700">
                  {myUnavailableBlocks.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-start justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5"
                    >
                      <span>
                        {formatLocalHmRange(new Date(b.startsAt), new Date(b.endsAt))}
                        {b.note ? <span className="block text-slate-500">{b.note}</span> : null}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-clinical-700 underline"
                        onClick={() => void removeUnavailableBlock(b.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Upcoming appointments</h2>
        <p className="mt-1 text-xs text-slate-500">
          Only visits that have not ended yet (past times are hidden). Use the month control above to see other
          weeks.
        </p>
        <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {mineUpcoming.length === 0 ? (
            <li className="px-4 py-6 text-sm text-slate-500">
              {mine.length === 0
                ? "No appointments in this range."
                : "No upcoming appointments in this range."}
            </li>
          ) : (
            mineUpcoming.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  {a.mode === "telemedicine" && (a.videoJoinUrl || "").trim() ? (
                    <Link
                      href={`/doctor/appointments/video/${a.id}`}
                      className={
                        "font-medium underline underline-offset-2 " +
                        (a.status === "cancelled"
                          ? "text-slate-600 decoration-slate-300 hover:text-slate-900"
                          : "text-clinical-700 decoration-clinical-300 hover:text-clinical-900")
                      }
                    >
                      {formatApptRange(a.startsAt, a.endsAt)}
                    </Link>
                  ) : (
                    <p className="font-medium text-slate-900">{formatApptRange(a.startsAt, a.endsAt)}</p>
                  )}
                  <p className="text-xs text-slate-500">
                    {a.status === "cancelled" ? (
                      <span className="mr-1 rounded bg-slate-200 px-1.5 py-0.5 font-medium text-slate-700">
                        Cancelled
                      </span>
                    ) : null}
                    {a.mode === "telemedicine" ? "Telemedicine" : "In person"} ·{" "}
                    {(() => {
                      const pn = (
                        a.patientDisplayName?.trim() ||
                        patientDisplayByUserId.get(a.patientUserId)?.trim() ||
                        ""
                      ).trim();
                      return pn || `Patient ${a.patientUserId.slice(0, 8)}…`;
                    })()}
                  </p>
                  {a.mode === "telemedicine" && a.videoJoinUrl ? (
                    <Link
                      href={`/doctor/appointments/video/${a.id}`}
                      className={
                        "mt-2 inline-flex rounded-lg px-3 py-1.5 text-xs font-medium " +
                        (a.status === "cancelled"
                          ? "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                          : "bg-clinical-600 text-white hover:bg-clinical-900")
                      }
                    >
                      {a.status === "cancelled" ? "Video (history)" : "Join video"}
                    </Link>
                  ) : a.mode === "telemedicine" ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-amber-900">
                        No video link yet. This page retries room creation automatically when{" "}
                        <code className="rounded bg-amber-100 px-1">DAILY_API_KEY</code> is set; use the button to
                        retry.
                      </p>
                      {videoProvisionNotes[a.id] ? (
                        <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-900">
                          {videoProvisionNotes[a.id]}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        disabled={provisionId === a.id}
                        onClick={() => void provisionVideo(a.id)}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {provisionId === a.id ? "Creating…" : "Create video link"}
                      </button>
                    </div>
                  ) : null}
                  {a.reason ? <p className="mt-1 text-slate-600">{a.reason}</p> : null}
                </div>
                {a.status === "cancelled" ? (
                  <span className="text-xs text-slate-400">—</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelTarget(a);
                      setCancelReasonInput("");
                    }}
                    className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-800 hover:bg-red-50"
                  >
                    Cancel
                  </button>
                )}
              </li>
            ))
          )}
        </ul>
      </div>

      {cancelTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="doctor-cancel-appt-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <h3 id="doctor-cancel-appt-title" className="text-sm font-semibold text-slate-900">
              Cancel this appointment?
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Both you and the patient receive an email. You can add a reason below (optional).
            </p>
            <p className="mt-2 text-xs text-slate-500">{formatApptRange(cancelTarget.startsAt, cancelTarget.endsAt)}</p>
            <label className="mt-3 block text-xs font-medium text-slate-600">
              Reason for cancellation (optional)
              <textarea
                className="mt-1 min-h-[72px] w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                value={cancelReasonInput}
                onChange={(e) => setCancelReasonInput(e.target.value)}
                maxLength={2000}
                placeholder="e.g. clinic closure, patient to reschedule…"
              />
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={cancelBusy}
                onClick={() => {
                  setCancelTarget(null);
                  setCancelReasonInput("");
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Keep appointment
              </button>
              <button
                type="button"
                disabled={cancelBusy}
                onClick={() => void confirmCancelAppointment()}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelBusy ? "Cancelling…" : "Confirm cancel"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
