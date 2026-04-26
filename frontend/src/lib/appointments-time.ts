/** Build ISO range from local date (YYYY-MM-DD) and HH:mm times. */
export function localDateTimesToIso(
  dateStr: string,
  startHm: string,
  endHm: string
): { startsAt: string; endsAt: string } | null {
  const s = new Date(`${dateStr}T${startHm}:00`);
  const e = new Date(`${dateStr}T${endHm}:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s >= e) return null;
  return { startsAt: s.toISOString(), endsAt: e.toISOString() };
}

export function monthUtcRange(year: number, month0: number): { from: string; to: string } {
  const from = new Date(Date.UTC(year, month0, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, month0 + 1, 1, 0, 0, 0));
  return { from: from.toISOString(), to: to.toISOString() };
}

export function formatApptRange(isoStart: string, isoEnd: string): string {
  const a = new Date(isoStart);
  const b = new Date(isoEnd);
  return `${a.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} – ${b.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

/** ISO start/end (e.g. busy blocks from the API). */
export type IsoInterval = { startsAt: string; endsAt: string };

/** Local midnight [start, endExclusive) for a calendar day YYYY-MM-DD. */
export function localCalendarDayBounds(dayKey: string): { start: Date; endExclusive: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const start = new Date(y, mo, d, 0, 0, 0, 0);
  const endExclusive = new Date(y, mo, d + 1, 0, 0, 0, 0);
  return { start, endExclusive };
}

export function mergeOverlappingIntervals(intervals: { start: Date; end: Date }[]): { start: Date; end: Date }[] {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: { start: Date; end: Date }[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start.getTime() <= last.end.getTime()) {
      last.end = new Date(Math.max(last.end.getTime(), iv.end.getTime()));
    } else {
      out.push({ start: iv.start, end: iv.end });
    }
  }
  return out;
}

/** Clip busy blocks to a local calendar day and merge overlaps. */
export function busyIntervalsOnLocalDay(blocks: IsoInterval[], dayKey: string): { start: Date; end: Date }[] {
  const bounds = localCalendarDayBounds(dayKey);
  if (!bounds) return [];
  const { start: day0, endExclusive: day1 } = bounds;
  const clipped: { start: Date; end: Date }[] = [];
  for (const raw of blocks) {
    const bs = new Date(raw.startsAt);
    const be = new Date(raw.endsAt);
    if (Number.isNaN(bs.getTime()) || Number.isNaN(be.getTime())) continue;
    if (be <= day0 || bs >= day1) continue;
    const s = bs < day0 ? day0 : bs;
    const e = be > day1 ? day1 : be;
    if (s < e) clipped.push({ start: s, end: e });
  }
  return mergeOverlappingIntervals(clipped);
}

/** Gaps between merged busy intervals within the same local day. */
export function freeIntervalsWithinLocalDay(
  busyMerged: { start: Date; end: Date }[],
  dayKey: string
): { start: Date; end: Date }[] {
  const bounds = localCalendarDayBounds(dayKey);
  if (!bounds) return [];
  const { start: day0, endExclusive: day1 } = bounds;
  const gaps: { start: Date; end: Date }[] = [];
  let t = day0.getTime();
  for (const iv of busyMerged) {
    if (iv.start.getTime() > t) {
      gaps.push({ start: new Date(t), end: iv.start });
    }
    t = Math.max(t, iv.end.getTime());
  }
  if (t < day1.getTime()) {
    gaps.push({ start: new Date(t), end: day1 });
  }
  return gaps;
}

export function formatLocalHmRange(start: Date, end: Date): string {
  const o: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${start.toLocaleTimeString(undefined, o)} – ${end.toLocaleTimeString(undefined, o)}`;
}

/** If `end` is midnight at the end of `dayKey`, show 11:59 PM instead of 12:00 AM (next day). */
export function formatLocalHmRangeWithinDay(dayKey: string, start: Date, end: Date): string {
  const bounds = localCalendarDayBounds(dayKey);
  if (!bounds) return formatLocalHmRange(start, end);
  if (end.getTime() >= bounds.endExclusive.getTime()) {
    const almostEnd = new Date(bounds.endExclusive.getTime() - 60_000);
    if (almostEnd > start) return formatLocalHmRange(start, almostEnd);
  }
  return formatLocalHmRange(start, end);
}

export type BusySlot = { start: Date; end: Date; mode?: string };

/** Each scheduled block for the doctor on this local day (visit type preserved). */
export function busySlotsOnLocalDay(
  blocks: Array<IsoInterval & { mode?: string }>,
  dayKey: string
): BusySlot[] {
  const bounds = localCalendarDayBounds(dayKey);
  if (!bounds) return [];
  const { start: day0, endExclusive: day1 } = bounds;
  const lines: BusySlot[] = [];
  for (const raw of blocks) {
    const bs = new Date(raw.startsAt);
    const be = new Date(raw.endsAt);
    if (Number.isNaN(bs.getTime()) || Number.isNaN(be.getTime())) continue;
    if (be <= day0 || bs >= day1) continue;
    const s = bs < day0 ? day0 : bs;
    const e = be > day1 ? day1 : be;
    if (s < e) lines.push({ start: s, end: e, mode: raw.mode });
  }
  lines.sort((a, b) => a.start.getTime() - b.start.getTime());
  return lines;
}
