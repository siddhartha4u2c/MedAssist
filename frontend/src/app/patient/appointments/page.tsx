"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  appointmentsBusy,
  appointmentsCancel,
  appointmentsCreate,
  appointmentsDirectorySearch,
  appointmentsDoctorProfileForPatient,
  appointmentsMine,
  appointmentsProvisionVideo,
  errorMessageFromUnknown,
  type AppointmentBusyBlock,
  type AppointmentDirectoryDoctor,
  type AppointmentRow,
} from "@/lib/api-client";
import {
  busyIntervalsOnLocalDay,
  busySlotsOnLocalDay,
  formatApptRange,
  formatLocalHmRange,
  formatLocalHmRangeWithinDay,
  freeIntervalsWithinLocalDay,
  localCalendarDayBounds,
  localDateTimesToIso,
  monthUtcRange,
} from "@/lib/appointments-time";
import {
  localDayKey,
  localMonthKeyBounds,
  mineByLocalDayKey,
  MonthCalendar,
} from "@/components/appointments/month-calendar";

function formatLocalDayHeading(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return dayKey;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dt.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function apptLocalDayKey(a: AppointmentRow): string {
  return localDayKey(new Date(a.startsAt));
}

function sortAppointmentsByStart(a: AppointmentRow, b: AppointmentRow): number {
  return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toTimeInputValue(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDoctorPickerLabel(d: AppointmentDirectoryDoctor): string {
  return `${d.displayName} (${d.specialization})`;
}

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

export default function PatientAppointmentsPage() {
  const now = new Date();
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth());
  const [doctors, setDoctors] = useState<AppointmentDirectoryDoctor[]>([]);
  const [directoryFilter, setDirectoryFilter] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [selected, setSelected] = useState<AppointmentDirectoryDoctor | null>(null);
  const [profileDetail, setProfileDetail] = useState<"directory" | "full">("directory");
  const [profile, setProfile] = useState<(AppointmentDirectoryDoctor & Record<string, unknown>) | null>(
    null
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(localDayKey(now));
  /** When set, the list below shows that calendar day only; when null, the list shows upcoming visits only. */
  const [listViewDayKey, setListViewDayKey] = useState<string | null>(null);
  const [startHm, setStartHm] = useState("09:00");
  const [endHm, setEndHm] = useState("09:30");
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
  const [doctorPickerOpen, setDoctorPickerOpen] = useState(false);
  const doctorPickerRef = useRef<HTMLDivElement>(null);

  const { from, to } = useMemo(() => monthUtcRange(y, m), [y, m]);

  const doctorDisplayByUserId = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of doctors) m.set(d.userId, d.displayName);
    if (selected) m.set(selected.userId, selected.displayName);
    return m;
  }, [doctors, selected]);

  const doctorsSortedAlpha = useMemo(
    () =>
      [...doctors].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
      ),
    [doctors]
  );

  const effectiveDirectoryFilter = useMemo(() => {
    const t = directoryFilter.trim();
    if (!selected) return directoryFilter;
    if (t.toLowerCase() === formatDoctorPickerLabel(selected).toLowerCase()) return "";
    return directoryFilter;
  }, [directoryFilter, selected]);

  const doctorsMatchingFilter = useMemo(() => {
    const raw = effectiveDirectoryFilter.trim().toLowerCase();
    if (!raw) return doctorsSortedAlpha;
    const tokens = raw.split(/\s+/).filter(Boolean);
    return doctorsSortedAlpha.filter((d) => {
      const blob = [
        d.displayName,
        d.email,
        d.specialization,
        d.department || "",
        d.hospitalAffiliation || "",
        d.bio || "",
      ]
        .join(" ")
        .toLowerCase();
      if (tokens.length) return tokens.every((t) => blob.includes(t));
      return blob.includes(raw);
    });
  }, [doctorsSortedAlpha, effectiveDirectoryFilter]);

  useEffect(() => {
    if (!doctorPickerOpen) return;
    const onDoc = (ev: MouseEvent) => {
      const el = doctorPickerRef.current;
      if (!el || el.contains(ev.target as Node)) return;
      setDoctorPickerOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [doctorPickerOpen]);

  const loadCalendar = useCallback(async () => {
    setMsg("");
    try {
      const userIds = selected?.userId ? [selected.userId] : [];
      const busy = await appointmentsBusy({ userIds, from, to });
      setBusyBy(busy.busyByUserId);
      const ap = await appointmentsMine({ from, to, status: "all" });
      setMine(ap.appointments);
    } catch (e) {
      setMsg(errorMessageFromUnknown(e));
    }
  }, [from, to, selected?.userId]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  /** One automatic Daily room attempt per telemedicine row (covers visits booked before video was configured). */
  useEffect(() => {
    const pending = mine
      .filter(
        (a) =>
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
              "Daily.co did not return a join URL. Check the server terminal for [Daily.co] logs.";
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
        const userIds = selected?.userId ? [selected.userId] : [];
        const busy = await appointmentsBusy({ userIds, from, to });
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
  }, [mine, from, to, selected?.userId]);

  useEffect(() => {
    setVideoProvisionNotes((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(next)) {
        const row = mine.find((x) => x.id === id);
        if (row && (row.videoJoinUrl || "").trim()) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [mine]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDirectoryLoading(true);
      setMsg("");
      try {
        const r = await appointmentsDirectorySearch("");
        if (!cancelled) setDoctors(r.doctors);
      } catch (e) {
        if (!cancelled) setMsg(errorMessageFromUnknown(e));
        if (!cancelled) setDoctors([]);
      } finally {
        if (!cancelled) setDirectoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadProfile = useCallback(async () => {
    if (!selected) {
      setProfile(null);
      return;
    }
    try {
      const r = await appointmentsDoctorProfileForPatient(selected.userId, profileDetail);
      setProfile(r.profile);
    } catch (e) {
      setMsg(errorMessageFromUnknown(e));
    }
  }, [selected, profileDetail]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const busyDayKeys = useMemo(() => busyToDayKeys(busyBy), [busyBy]);
  const myBookedDayKeys = useMemo(() => new Set(mineByLocalDayKey(mine).keys()), [mine]);

  /** Other key in busy payload is the signed-in patient when a doctor is selected. */
  const patientBusyUserId = useMemo(() => {
    if (!selected) return "";
    return Object.keys(busyBy).find((id) => id !== selected.userId) || "";
  }, [busyBy, selected]);

  const bookingDaySchedule = useMemo(() => {
    if (!selected || !selectedDay) return null;
    const docBlocks = busyBy[selected.userId] || [];
    const patBlocks = patientBusyUserId ? busyBy[patientBusyUserId] || [] : [];
    const combinedBusy = busyIntervalsOnLocalDay([...docBlocks, ...patBlocks], selectedDay);
    const minGapMs = 5 * 60 * 1000;
    const freeGaps = freeIntervalsWithinLocalDay(combinedBusy, selectedDay).filter(
      (g) => g.end.getTime() - g.start.getTime() >= minGapMs
    );
    const doctorSlots = busySlotsOnLocalDay(docBlocks, selectedDay);
    return { doctorSlots, freeGaps };
  }, [selected, selectedDay, busyBy, patientBusyUserId]);

  const { listAppointments, listMode, scheduleDayKey } = useMemo(() => {
    const nowMs = Date.now();
    if (listViewDayKey !== null) {
      const list = mine
        .filter((a) => apptLocalDayKey(a) === listViewDayKey)
        .sort(sortAppointmentsByStart);
      return { listAppointments: list, listMode: "day" as const, scheduleDayKey: listViewDayKey };
    }
    const upcoming = mine
      .filter(
        (a) =>
          (a.status || "scheduled") !== "cancelled" && new Date(a.startsAt).getTime() >= nowMs
      )
      .sort(sortAppointmentsByStart);
    return { listAppointments: upcoming, listMode: "upcoming" as const, scheduleDayKey: "" };
  }, [mine, listViewDayKey]);

  const bookableFromDayKey = localDayKey(new Date());

  useEffect(() => {
    const todayKey = localDayKey(new Date());
    const { start: monthStart, end: monthEnd } = localMonthKeyBounds(y, m);
    setSelectedDay((prev) => {
      if (prev && prev >= monthStart && prev <= monthEnd) return prev;
      if (todayKey >= monthStart && todayKey <= monthEnd) return todayKey;
      return monthStart;
    });
    setListViewDayKey(null);
  }, [y, m]);

  const handleSelectCalendarDay = useCallback((dayKey: string) => {
    setSelectedDay(dayKey);
    setListViewDayKey(dayKey);
  }, []);

  function applyFreeGapToBookingTimes(dayKey: string, g: { start: Date; end: Date }) {
    const bounds = localCalendarDayBounds(dayKey);
    setStartHm(toTimeInputValue(g.start));
    let endMs = g.end.getTime() - 60_000;
    if (bounds && g.end.getTime() >= bounds.endExclusive.getTime()) {
      endMs = bounds.endExclusive.getTime() - 60_000;
    }
    let endD = new Date(endMs);
    if (endD.getTime() <= g.start.getTime()) {
      endD = new Date(g.start.getTime() + 30 * 60_000);
    }
    setEndHm(toTimeInputValue(endD));
  }

  async function book() {
    if (!selected || !selectedDay) {
      setMsg("Choose a doctor and a day.");
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
        doctorUserId: selected.userId,
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
          /* keep appt from create; user can use Create video link */
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

  function jumpToToday() {
    const n = new Date();
    setY(n.getFullYear());
    setM(n.getMonth());
    setSelectedDay(localDayKey(n));
    setListViewDayKey(null);
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
      setMsg("Cancelled. You and your doctor were notified by email (if mail is configured).");
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
          [id]: w || "No join URL returned — check Daily.co dashboard and Flask logs for [Daily.co].",
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

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Appointments</h1>
        <p className="mt-1 text-sm text-slate-600">
          Use the doctor field below to search and choose the same way—then check the calendar and book in person or
          telemedicine.
        </p>
      </div>

      {msg ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">{msg}</p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="patient-appt-doctor-combo" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Doctor
            </label>
            <div ref={doctorPickerRef} className="relative flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  id="patient-appt-doctor-combo"
                  type="text"
                  role="combobox"
                  aria-expanded={doctorPickerOpen}
                  aria-controls="patient-doctor-listbox"
                  aria-autocomplete="list"
                  autoComplete="off"
                  className={`block w-full rounded-lg border border-slate-300 bg-white py-2 text-sm text-slate-900 shadow-sm focus:border-clinical-500 focus:outline-none focus:ring-1 focus:ring-clinical-500 ${
                    selected ? "pl-3 pr-9" : "px-3"
                  }`}
                  placeholder={directoryLoading ? "Loading doctors…" : "Type to search, then pick a doctor…"}
                  value={directoryFilter}
                  disabled={directoryLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setDoctorPickerOpen(false);
                  }}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDirectoryFilter(v);
                    setDoctorPickerOpen(true);
                    if (selected && v.trim().toLowerCase() !== formatDoctorPickerLabel(selected).toLowerCase()) {
                      setSelected(null);
                    }
                  }}
                  onFocus={() => setDoctorPickerOpen(true)}
                />
                {selected ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Clear doctor"
                    onClick={() => {
                      setSelected(null);
                      setDirectoryFilter("");
                      setDoctorPickerOpen(true);
                    }}
                  >
                    ×
                  </button>
                ) : null}
                {doctorPickerOpen && !directoryLoading ? (
                  <ul
                    id="patient-doctor-listbox"
                    role="listbox"
                    className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
                  >
                    {doctorsMatchingFilter.length === 0 ? (
                      <li className="px-3 py-2 text-slate-500">No matches.</li>
                    ) : (
                      doctorsMatchingFilter.map((d) => (
                        <li key={d.userId} role="presentation">
                          <button
                            type="button"
                            role="option"
                            className="w-full px-3 py-2 text-left hover:bg-clinical-50 focus:bg-clinical-50 focus:outline-none"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSelected(d);
                              setDirectoryFilter(formatDoctorPickerLabel(d));
                              setProfileDetail("directory");
                              setDoctorPickerOpen(false);
                            }}
                          >
                            <span className="font-medium text-slate-900">{d.displayName}</span>
                            <span className="block text-xs text-slate-500">{d.specialization}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
              <button
                type="button"
                className="shrink-0 self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={directoryLoading}
                onClick={() => {
                  void (async () => {
                    setDirectoryLoading(true);
                    setMsg("");
                    try {
                      const r = await appointmentsDirectorySearch("");
                      setDoctors(r.doctors);
                    } catch (e) {
                      setMsg(errorMessageFromUnknown(e));
                    } finally {
                      setDirectoryLoading(false);
                    }
                  })();
                }}
              >
                Refresh
              </button>
            </div>
            <p className="text-xs text-slate-500">
              {directoryLoading
                ? "Loading…"
                : `${doctorsSortedAlpha.length} doctor${doctorsSortedAlpha.length === 1 ? "" : "s"} in the portal${
                    effectiveDirectoryFilter.trim()
                      ? ` · ${doctorsMatchingFilter.length} match “${effectiveDirectoryFilter.trim()}”`
                      : ""
                  }`}
            </p>
          </div>
          {!directoryLoading && doctorsSortedAlpha.length === 0 ? (
            <p className="text-sm text-slate-500">No verified doctors are available yet.</p>
          ) : null}

          {selected ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Doctor profile</h3>
                <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setProfileDetail("directory")}
                    className={
                      profileDetail === "directory"
                        ? "rounded-md bg-clinical-600 px-2 py-1 text-white"
                        : "rounded-md px-2 py-1 text-slate-600 hover:bg-slate-50"
                    }
                  >
                    Directory view
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfileDetail("full")}
                    className={
                      profileDetail === "full"
                        ? "rounded-md bg-clinical-600 px-2 py-1 text-white"
                        : "rounded-md px-2 py-1 text-slate-600 hover:bg-slate-50"
                    }
                  >
                    Full profile
                  </button>
                </div>
              </div>
              {profile ? (
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs font-medium uppercase text-slate-400">Bio</dt>
                    <dd className="whitespace-pre-wrap text-slate-800">{profile.bio || "—"}</dd>
                  </div>
                  {profileDetail === "full" ? (
                    <>
                      <div>
                        <dt className="text-xs font-medium uppercase text-slate-400">Academic</dt>
                        <dd className="whitespace-pre-wrap text-slate-800">
                          {(profile.academicRecords as string) || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase text-slate-400">Experience</dt>
                        <dd className="whitespace-pre-wrap text-slate-800">
                          {(profile.professionalExperience as string) || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase text-slate-400">Achievements</dt>
                        <dd className="whitespace-pre-wrap text-slate-800">
                          {(profile.achievements as string) || "—"}
                        </dd>
                      </div>
                    </>
                  ) : null}
                </dl>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Loading…</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <MonthCalendar
            year={y}
            month={m}
            busyDayKeys={busyDayKeys}
            myBookedDayKeys={myBookedDayKeys}
            selectedDay={selectedDay}
            onSelectDay={handleSelectCalendarDay}
            bookableFromDayKey={bookableFromDayKey}
            allowAnyInMonthDay
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
            {!selected ? (
              <p className="text-xs text-slate-500">Choose a doctor from the dropdown above to enable booking.</p>
            ) : selected.availableForTelemedicine === false ? (
              <p className="text-xs text-amber-800">This doctor is not available for telemedicine.</p>
            ) : null}
            {selected && selectedDay && bookingDaySchedule ? (
              <div className="mt-3 space-y-3 rounded-lg border border-slate-100 bg-slate-50/90 p-3 text-xs text-slate-700">
                <div>
                  <p className="font-semibold text-slate-900">
                    {selected.displayName}&apos;s schedule — {formatLocalDayHeading(selectedDay)}
                  </p>
                  <p className="mt-0.5 text-slate-600">
                    Shows this doctor&apos;s confirmed visits, their marked unavailable times, and your own
                    appointments. Open windows are safe times to propose.
                  </p>
                </div>
                {bookingDaySchedule.doctorSlots.length === 0 ? (
                  <p className="text-slate-600">No other bookings on this doctor&apos;s calendar for this date.</p>
                ) : (
                  <div>
                    <p className="font-medium text-slate-800">Already booked</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">
                      {bookingDaySchedule.doctorSlots.map((slot, i) => (
                        <li key={`${slot.start.getTime()}-${i}`}>
                          {formatLocalHmRange(slot.start, slot.end)}
                          <span className="text-slate-500">
                            {" "}
                            (
                            {slot.mode === "unavailable"
                              ? "Unavailable"
                              : slot.mode === "telemedicine"
                                ? "Telemedicine"
                                : slot.mode === "in_person"
                                  ? "In person"
                                  : "Scheduled"}
                            )
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="font-medium text-slate-800">Open times (you + doctor both free)</p>
                  {bookingDaySchedule.freeGaps.length === 0 ? (
                    <p className="mt-1 text-slate-600">No continuous window of at least 5 minutes left this day.</p>
                  ) : (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-emerald-900">
                      {bookingDaySchedule.freeGaps.map((g, i) => (
                        <li key={`${g.start.getTime()}-${i}`} className="pl-0">
                          <span>{formatLocalHmRangeWithinDay(selectedDay, g.start, g.end)}</span>
                          <button
                            type="button"
                            className="ml-2 font-medium text-clinical-700 underline decoration-clinical-300 hover:text-clinical-900"
                            onClick={() => applyFreeGapToBookingTimes(selectedDay, g)}
                          >
                            Set start / end
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Start
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  value={startHm}
                  onChange={(e) => setStartHm(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                End
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
              Reason (optional)
              <textarea
                className="mt-1 min-h-[60px] w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={loading || !selected || !selectedDay}
              onClick={() => void book()}
              className="mt-4 w-full rounded-lg bg-clinical-600 py-2 text-sm font-medium text-white hover:bg-clinical-900 disabled:opacity-50"
            >
              {loading
                ? "Booking…"
                : selected
                  ? `Book with ${selected.displayName}`
                  : "Book appointment"}
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {listMode === "day" ? "Day schedule" : "Upcoming"}
            </h2>
            {listMode === "day" ? (
              <p className="mt-1 max-w-2xl text-xs text-slate-600">
                <span className="font-medium text-slate-800">{formatLocalDayHeading(scheduleDayKey)}</span>
                {" — "}
                all visits and calls for this day (scheduled, cancelled, and already finished).
              </p>
            ) : (
              <p className="mt-1 max-w-2xl text-xs text-slate-600">
                Visits from now on in this calendar month.
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {listViewDayKey !== null ? (
              <button
                type="button"
                onClick={() => setListViewDayKey(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                Upcoming appointments
              </button>
            ) : null}
            {(() => {
              const n = new Date();
              const todayKey = localDayKey(n);
              const onTodayMonth = y === n.getFullYear() && m === n.getMonth();
              if (selectedDay === todayKey && onTodayMonth) return null;
              return (
                <button
                  type="button"
                  onClick={jumpToToday}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                >
                  Go to today
                </button>
              );
            })()}
          </div>
        </div>
        <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {listAppointments.length === 0 ? (
            <li className="px-4 py-6 text-sm text-slate-500">
              {listMode === "day" ? "No appointments on this date." : "No upcoming appointments in this month."}
            </li>
          ) : (
            listAppointments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  {a.mode === "telemedicine" && (a.videoJoinUrl || "").trim() ? (
                    <Link
                      href={`/patient/appointments/video/${a.id}`}
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
                    ) : new Date(a.endsAt).getTime() < Date.now() ? (
                      <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                        Ended
                      </span>
                    ) : null}
                    {a.mode === "telemedicine" ? "Telemedicine" : "In person"} ·{" "}
                    {(() => {
                      const dn = (
                        a.doctorDisplayName?.trim() ||
                        doctorDisplayByUserId.get(a.doctorUserId)?.trim() ||
                        ""
                      ).trim();
                      return dn ? `Dr. ${dn}` : `Doctor ${a.doctorUserId.slice(0, 8)}…`;
                    })()}
                  </p>
                  {a.mode === "telemedicine" && a.videoJoinUrl ? (
                    <Link
                      href={`/patient/appointments/video/${a.id}`}
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
                        No video link yet. This page tries to create one automatically when{" "}
                        <code className="rounded bg-amber-100 px-1">DAILY_API_KEY</code> is set on the server; use the
                        button to retry. If it still fails, the note below is from Daily.co or the API.
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
          aria-labelledby="patient-cancel-appt-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <h3 id="patient-cancel-appt-title" className="text-sm font-semibold text-slate-900">
              Cancel this appointment?
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Both you and your doctor receive an email. You can add a reason below (optional).
            </p>
            <p className="mt-2 text-xs text-slate-500">{formatApptRange(cancelTarget.startsAt, cancelTarget.endsAt)}</p>
            <label className="mt-3 block text-xs font-medium text-slate-600">
              Reason for cancellation (optional)
              <textarea
                className="mt-1 min-h-[72px] w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                value={cancelReasonInput}
                onChange={(e) => setCancelReasonInput(e.target.value)}
                maxLength={2000}
                placeholder="e.g. schedule conflict, feeling better…"
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
