// SPRINT-2: business-date derivation for daily-resetting order numbers.
// Pure function — takes a UTC instant + IANA timezone + reset hour; returns YYYY-MM-DD.
// Distinct from open/closed: this rolls at the reset hour (default 05:00 store local), not trading hours.
import { DateTime } from "luxon";

/**
 * Resolve the store business date for a UTC instant.
 *
 * Rule: convert `instant` to `timeZone` local time. If local hour is strictly less than
 * `resetHour` (0–23), the business date is the previous calendar date; otherwise it is
 * the current calendar date. Uses the IANA zone so DST transitions are correct.
 */
export function resolveBusinessDate(
  instant: Date,
  timeZone: string,
  resetHour: number,
): string {
  if (!Number.isInteger(resetHour) || resetHour < 0 || resetHour > 23) {
    throw new Error(`resetHour must be an integer 0–23, got ${resetHour}`);
  }

  const local = DateTime.fromJSDate(instant, { zone: "utc" }).setZone(timeZone);
  if (!local.isValid) {
    throw new Error(`Invalid timezone or instant: ${timeZone} / ${instant.toISOString()}`);
  }

  const businessLocal =
    local.hour < resetHour ? local.minus({ days: 1 }) : local;

  return businessLocal.toISODate()!;
}

/** Parse a YYYY-MM-DD business date as a Date at UTC midnight (for Prisma @db.Date). */
export function businessDateToUtcDate(businessDate: string): Date {
  const dt = DateTime.fromISO(businessDate, { zone: "utc" }).startOf("day");
  if (!dt.isValid) {
    throw new Error(`Invalid business date: ${businessDate}`);
  }
  return dt.toJSDate();
}
