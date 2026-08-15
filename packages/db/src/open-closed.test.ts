// SPRINT-2: unit tests for evaluateOpenClosed — America/Chicago including DST and midnight-crossing
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { evaluateOpenClosed, type OpenClosedHoursRow } from "./open-closed";

const TZ = "America/Chicago";

/** Standard Harold's-like hours: 10:30–23:00 every day */
const STANDARD_HOURS: OpenClosedHoursRow[] = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  openTime: "10:30",
  closeTime: "23:00",
  isClosed: false,
}));

function atLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  return DateTime.fromObject({ year, month, day, hour, minute }, { zone: TZ })
    .toUTC()
    .toJSDate();
}

describe("evaluateOpenClosed", () => {
  it("is open mid-service", () => {
    const result = evaluateOpenClosed({
      instant: atLocal(2026, 8, 9, 15, 0),
      timeZone: TZ,
      hours: STANDARD_HOURS,
      closures: [],
    });
    assert.equal(result.isOpen, true);
    assert.equal(result.nextOpenAt, null);
  });

  it("is closed before open; nextOpenAt is today's open", () => {
    const result = evaluateOpenClosed({
      instant: atLocal(2026, 8, 9, 9, 0),
      timeZone: TZ,
      hours: STANDARD_HOURS,
      closures: [],
    });
    assert.equal(result.isOpen, false);
    assert.ok(result.nextOpenAt);
    const nextLocal = DateTime.fromJSDate(result.nextOpenAt!, { zone: "utc" }).setZone(TZ);
    assert.equal(nextLocal.toISODate(), "2026-08-09");
    assert.equal(nextLocal.hour, 10);
    assert.equal(nextLocal.minute, 30);
  });

  it("is closed after close; nextOpenAt is tomorrow's open", () => {
    const result = evaluateOpenClosed({
      instant: atLocal(2026, 8, 9, 23, 30),
      timeZone: TZ,
      hours: STANDARD_HOURS,
      closures: [],
    });
    assert.equal(result.isOpen, false);
    assert.ok(result.nextOpenAt);
    const nextLocal = DateTime.fromJSDate(result.nextOpenAt!, { zone: "utc" }).setZone(TZ);
    assert.equal(nextLocal.toISODate(), "2026-08-10");
    assert.equal(nextLocal.hour, 10);
    assert.equal(nextLocal.minute, 30);
  });

  it("is closed on a day marked isClosed", () => {
    const hours = STANDARD_HOURS.map((h) =>
      h.dayOfWeek === 0 ? { ...h, isClosed: true, openTime: null, closeTime: null } : h,
    );
    // Sunday 2026-08-09
    const result = evaluateOpenClosed({
      instant: atLocal(2026, 8, 9, 15, 0),
      timeZone: TZ,
      hours,
      closures: [],
    });
    assert.equal(result.isOpen, false);
    assert.ok(result.nextOpenAt);
    const nextLocal = DateTime.fromJSDate(result.nextOpenAt!, { zone: "utc" }).setZone(TZ);
    // Next open Monday
    assert.equal(nextLocal.toISODate(), "2026-08-10");
    assert.equal(nextLocal.hour, 10);
  });

  it("is closed on a closure date", () => {
    const result = evaluateOpenClosed({
      instant: atLocal(2026, 12, 25, 15, 0),
      timeZone: TZ,
      hours: STANDARD_HOURS,
      closures: [{ date: "2026-12-25", reason: "Christmas" }],
    });
    assert.equal(result.isOpen, false);
    assert.ok(result.nextOpenAt);
    const nextLocal = DateTime.fromJSDate(result.nextOpenAt!, { zone: "utc" }).setZone(TZ);
    assert.equal(nextLocal.toISODate(), "2026-12-26");
  });

  // US spring forward 2026: 2026-03-08 02:00 → 03:00
  it("handles spring-forward DST mid-service and next open", () => {
    const mid = evaluateOpenClosed({
      instant: atLocal(2026, 3, 8, 15, 0),
      timeZone: TZ,
      hours: STANDARD_HOURS,
      closures: [],
    });
    assert.equal(mid.isOpen, true);

    const before = evaluateOpenClosed({
      instant: atLocal(2026, 3, 8, 9, 0),
      timeZone: TZ,
      hours: STANDARD_HOURS,
      closures: [],
    });
    assert.equal(before.isOpen, false);
    const nextLocal = DateTime.fromJSDate(before.nextOpenAt!, { zone: "utc" }).setZone(TZ);
    assert.equal(nextLocal.hour, 10);
    assert.equal(nextLocal.minute, 30);
    // CDT after spring forward
    assert.equal(nextLocal.offset, -5 * 60);
  });

  // US fall back 2025: 2025-11-02 02:00 → 01:00
  it("handles fall-back DST mid-service and after close", () => {
    const mid = evaluateOpenClosed({
      instant: atLocal(2025, 11, 2, 15, 0),
      timeZone: TZ,
      hours: STANDARD_HOURS,
      closures: [],
    });
    assert.equal(mid.isOpen, true);

    const after = evaluateOpenClosed({
      instant: atLocal(2025, 11, 2, 23, 30),
      timeZone: TZ,
      hours: STANDARD_HOURS,
      closures: [],
    });
    assert.equal(after.isOpen, false);
    const nextLocal = DateTime.fromJSDate(after.nextOpenAt!, { zone: "utc" }).setZone(TZ);
    assert.equal(nextLocal.toISODate(), "2025-11-03");
    assert.equal(nextLocal.offset, -6 * 60); // CST
  });

  it("supports midnight-crossing hypothetical hours", () => {
    // Open 22:00 → 02:00 every day
    const overnight: OpenClosedHoursRow[] = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      openTime: "22:00",
      closeTime: "02:00",
      isClosed: false,
    }));

    // Saturday night during session
    const satNight = evaluateOpenClosed({
      instant: atLocal(2026, 8, 8, 23, 0), // Saturday
      timeZone: TZ,
      hours: overnight,
      closures: [],
    });
    assert.equal(satNight.isOpen, true);

    // Sunday early morning — remnant of Saturday overnight
    const sunEarly = evaluateOpenClosed({
      instant: atLocal(2026, 8, 9, 1, 0), // Sunday
      timeZone: TZ,
      hours: overnight,
      closures: [],
    });
    assert.equal(sunEarly.isOpen, true);

    // Sunday afternoon — closed until evening open
    const sunAfternoon = evaluateOpenClosed({
      instant: atLocal(2026, 8, 9, 15, 0),
      timeZone: TZ,
      hours: overnight,
      closures: [],
    });
    assert.equal(sunAfternoon.isOpen, false);
    const nextLocal = DateTime.fromJSDate(sunAfternoon.nextOpenAt!, { zone: "utc" }).setZone(TZ);
    assert.equal(nextLocal.toISODate(), "2026-08-09");
    assert.equal(nextLocal.hour, 22);

    // Just after overnight close
    const afterClose = evaluateOpenClosed({
      instant: atLocal(2026, 8, 9, 2, 0),
      timeZone: TZ,
      hours: overnight,
      closures: [],
    });
    assert.equal(afterClose.isOpen, false);
  });

  it("overnight from previous day still open when today is a daytime closure", () => {
    const overnight: OpenClosedHoursRow[] = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      openTime: "22:00",
      closeTime: "02:00",
      isClosed: false,
    }));
    // Sunday early morning; Sunday closed as holiday but Sat overnight still running
    const result = evaluateOpenClosed({
      instant: atLocal(2026, 8, 9, 1, 0),
      timeZone: TZ,
      hours: overnight,
      closures: [{ date: "2026-08-09", reason: "Holiday" }],
    });
    assert.equal(result.isOpen, true);
  });
});
