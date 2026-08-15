// SPRINT-2: pure open/closed evaluation from hours + closures — no DB, no business-date.
import { DateTime } from "luxon";

export type OpenClosedHoursRow = {
  dayOfWeek: number;
  openTime: string | null;
  closeTime: string | null;
  isClosed: boolean;
};

export type OpenClosedClosureRow = {
  date: string;
  reason: string | null;
};

export type EvaluateOpenClosedArgs = {
  instant: Date;
  timeZone: string;
  hours: OpenClosedHoursRow[];
  closures: OpenClosedClosureRow[];
};

export type OpenClosedResult = {
  isOpen: boolean;
  /** Next UTC instant the store opens; null when currently open or undeterminable */
  nextOpenAt: Date | null;
};

type HoursByDow = Map<number, OpenClosedHoursRow>;

/** Luxon Monday=1…Sunday=7 → contract/schema Sunday=0…Saturday=6 */
function luxonWeekdayToDow(weekday: number): number {
  return weekday === 7 ? 0 : weekday;
}

/** Parse "HH:mm" (24h) to minutes from local midnight. */
function parseTimeMinutes(t: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!match) {
    throw new Error(`Invalid time string: ${t}`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time string: ${t}`);
  }
  return hour * 60 + minute;
}

function hoursMap(hours: OpenClosedHoursRow[]): HoursByDow {
  const map: HoursByDow = new Map();
  for (const row of hours) {
    map.set(row.dayOfWeek, row);
  }
  return map;
}

function crossesMidnight(row: OpenClosedHoursRow): boolean {
  if (!row.openTime || !row.closeTime || row.isClosed) return false;
  return parseTimeMinutes(row.closeTime) < parseTimeMinutes(row.openTime);
}

/**
 * Whether local wall-clock `timeMinutes` falls inside `row`'s session
 * on the calendar day that owns that row (same-day window only — not prev overnight).
 */
function inSameDayWindow(row: OpenClosedHoursRow, timeMinutes: number): boolean {
  if (row.isClosed || !row.openTime || !row.closeTime) return false;
  const open = parseTimeMinutes(row.openTime);
  const close = parseTimeMinutes(row.closeTime);
  if (close > open) {
    return timeMinutes >= open && timeMinutes < close;
  }
  if (close < open) {
    // Overnight: open from openTime through end of that calendar day
    return timeMinutes >= open;
  }
  // open === close: treat as 24h open when not isClosed
  return true;
}

/** Early-morning remnant of previous day's overnight session (00:00 … closeTime). */
function inPrevOvernightWindow(prev: OpenClosedHoursRow, timeMinutes: number): boolean {
  if (!crossesMidnight(prev) || !prev.closeTime) return false;
  return timeMinutes < parseTimeMinutes(prev.closeTime);
}

function isClosureDate(dateIso: string, closureDates: Set<string>): boolean {
  return closureDates.has(dateIso);
}

function isOpenAtLocal(
  local: DateTime,
  byDow: HoursByDow,
  closureDates: Set<string>,
): boolean {
  const dateIso = local.toISODate();
  if (!dateIso) return false;

  const timeMinutes = local.hour * 60 + local.minute;
  const dow = luxonWeekdayToDow(local.weekday);
  const prevLocal = local.minus({ days: 1 });
  const prevIso = prevLocal.toISODate();
  const prevDow = luxonWeekdayToDow(prevLocal.weekday);
  const prevRow = byDow.get(prevDow);

  // Overnight leftover from previous calendar day (even if today is a daytime closure).
  if (
    prevRow &&
    prevIso &&
    !isClosureDate(prevIso, closureDates) &&
    inPrevOvernightWindow(prevRow, timeMinutes)
  ) {
    return true;
  }

  if (isClosureDate(dateIso, closureDates)) return false;

  const today = byDow.get(dow);
  if (!today) return false;
  return inSameDayWindow(today, timeMinutes);
}

/**
 * Next UTC instant when the store opens after `local` (exclusive of being currently open).
 * Searches up to 16 local calendar days.
 */
function findNextOpenAt(
  local: DateTime,
  byDow: HoursByDow,
  closureDates: Set<string>,
): Date | null {
  // If currently in an overnight remnant, the "current session" already started; next open is later.
  for (let dayOffset = 0; dayOffset <= 16; dayOffset++) {
    const day = local.startOf("day").plus({ days: dayOffset });
    const dateIso = day.toISODate();
    if (!dateIso) continue;
    if (isClosureDate(dateIso, closureDates)) continue;

    const dow = luxonWeekdayToDow(day.weekday);
    const row = byDow.get(dow);
    if (!row || row.isClosed || !row.openTime || !row.closeTime) continue;

    // Use wall-clock set() — not duration plus — so DST spring-forward does not shift openTime.
    const openMinutes = parseTimeMinutes(row.openTime);
    const openAt = day.set({
      hour: Math.floor(openMinutes / 60),
      minute: openMinutes % 60,
      second: 0,
      millisecond: 0,
    });
    if (!openAt.isValid) continue;

    // Only futures strictly after the evaluation instant
    if (openAt.toMillis() > local.toMillis()) {
      return openAt.toUTC().toJSDate();
    }

    // Same calendar day already past today's open — overnight close is not a re-open.
    // Continue to next days.
  }
  return null;
}

/**
 * Evaluate whether the store is open at `instant` and when it next opens.
 * All calendar/time comparisons use the store IANA zone via Luxon.
 */
export function evaluateOpenClosed(args: EvaluateOpenClosedArgs): OpenClosedResult {
  const { instant, timeZone, hours, closures } = args;

  const local = DateTime.fromJSDate(instant, { zone: "utc" }).setZone(timeZone);
  if (!local.isValid) {
    throw new Error(`Invalid timezone or instant: ${timeZone} / ${instant.toISOString()}`);
  }

  const byDow = hoursMap(hours);
  const closureDates = new Set(closures.map((c) => c.date));

  const open = isOpenAtLocal(local, byDow, closureDates);
  if (open) {
    return { isOpen: true, nextOpenAt: null };
  }

  return {
    isOpen: false,
    nextOpenAt: findNextOpenAt(local, byDow, closureDates),
  };
}
