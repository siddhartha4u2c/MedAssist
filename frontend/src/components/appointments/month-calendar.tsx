"use client";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local YYYY-MM-DD range for a calendar month (inclusive). */
export function localMonthKeyBounds(year: number, month0: number): { start: string; end: string } {
  return {
    start: localDayKey(new Date(year, month0, 1)),
    end: localDayKey(new Date(year, month0 + 1, 0)),
  };
}

/** Group the signed-in user's appointments by local calendar day (for month grid). */
export function mineByLocalDayKey<
  T extends { id: string; startsAt: string; mode: string; videoJoinUrl?: string | null; status?: string },
>(
  mine: T[]
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const a of mine) {
    const k = localDayKey(new Date(a.startsAt));
    const list = m.get(k) ?? [];
    list.push(a);
    m.set(k, list);
  }
  for (const list of Array.from(m.values())) {
    list.sort((x: T, y: T) => new Date(x.startsAt).getTime() - new Date(y.startsAt).getTime());
  }
  return m;
}

type Cell = { key: string; label: number; inMonth: boolean; date: Date };

function buildMonthCells(year: number, month0: number): Cell[] {
  const first = new Date(year, month0, 1);
  const startPad = first.getDay();
  const cells: Cell[] = [];
  const start = new Date(year, month0, 1 - startPad);
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const inMonth = d.getMonth() === month0;
    cells.push({
      key: localDayKey(d),
      label: d.getDate(),
      inMonth,
      date: d,
    });
  }
  return cells;
}

const EMPTY_SET = new Set<string>();

type Props = {
  year: number;
  month: number;
  busyDayKeys: Set<string>;
  /** Local days where you have a scheduled visit (shown in addition to busy). */
  myBookedDayKeys?: Set<string>;
  selectedDay: string | null;
  onSelectDay: (dayKey: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** Inclusive first day that can be chosen for booking (YYYY-MM-DD, local). Past days stay visible but disabled. */
  bookableFromDayKey: string;
  /**
   * When true, any day in the displayed month can be selected to drive a day-scoped schedule list below.
   * When false (default), only today-or-future days or days with your visits stay selectable (booking UX).
   */
  allowAnyInMonthDay?: boolean;
};

export function MonthCalendar({
  year,
  month,
  busyDayKeys,
  myBookedDayKeys = EMPTY_SET,
  selectedDay,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  bookableFromDayKey,
  allowAnyInMonthDay = false,
}: Props) {
  const cells = buildMonthCells(year, month);
  const title = new Date(year, month, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrevMonth}
          className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
        >
          ←
        </button>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <button
          type="button"
          onClick={onNextMonth}
          className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-0.5">
        {cells.map((c) => {
          const busy = busyDayKeys.has(c.key);
          const mineDay = myBookedDayKeys.has(c.key);
          const sel = selectedDay === c.key;
          const bookable = c.key >= bookableFromDayKey;
          const canSelectForView = allowAnyInMonthDay ? c.inMonth : bookable || mineDay;
          const fadedNonInteractive = !canSelectForView && !mineDay && !busy;
          return (
            <div key={c.key} className="relative flex flex-col items-stretch justify-start">
              <button
                type="button"
                disabled={!canSelectForView}
                title={
                  allowAnyInMonthDay && c.inMonth
                    ? bookable
                      ? busy
                        ? "Busy — open the day list below for details."
                        : mineDay
                          ? "You have a visit this day — open the list below."
                          : "Open the list below for this day."
                      : "Past day — open the list below. Booking is only for today or future."
                    : !bookable && mineDay
                      ? "Past date — open the list below. Booking is only for today or future dates."
                      : !bookable
                        ? "Past dates cannot be booked"
                        : busy
                          ? "Busy (you or selected person has another visit)"
                          : mineDay
                            ? "You have a visit — open the list below."
                            : undefined
                }
                onClick={() => {
                  if (canSelectForView) onSelectDay(c.key);
                }}
                className={
                  "relative flex min-h-[2rem] flex-1 items-center justify-center rounded-lg text-sm " +
                  (c.inMonth ? "text-slate-900" : "text-slate-300") +
                  (fadedNonInteractive
                    ? " cursor-not-allowed opacity-40 hover:bg-transparent"
                    : sel
                      ? " bg-clinical-600 font-medium text-white"
                      : !bookable
                        ? " cursor-default opacity-100 hover:bg-slate-50/80"
                        : " hover:bg-slate-50") +
                  (bookable && !sel && busy ? " ring-1 ring-amber-400/80" : "") +
                  (!bookable && busy && !sel ? " ring-1 ring-amber-400/70" : "") +
                  (!sel && mineDay && !busy ? " ring-1 ring-clinical-500/70" : "")
                }
              >
                {c.label}
                {busy && !sel ? (
                  <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1 rounded-full bg-amber-500" />
                ) : null}
                {mineDay && !busy && !sel ? (
                  <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1 rounded-full bg-clinical-600" />
                ) : null}
                {mineDay && busy && !sel ? (
                  <span className="absolute bottom-1 right-1/2 mr-0.5 h-1 w-1 rounded-full bg-clinical-600" />
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
