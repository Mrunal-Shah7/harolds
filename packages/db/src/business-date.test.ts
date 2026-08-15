// SPRINT-2: unit tests for resolveBusinessDate — including DST transitions in America/Chicago
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { resolveBusinessDate } from "./business-date";

const TZ = "America/Chicago";
const RESET = 5; // 05:00 local

function utc(iso: string): Date {
  return DateTime.fromISO(iso, { zone: "utc" }).toJSDate();
}

describe("resolveBusinessDate", () => {
  it("returns previous calendar date just before the reset hour", () => {
    // 2026-08-09 04:59 America/Chicago = 09:59 UTC (CDT, UTC-5)
    const instant = DateTime.fromObject(
      { year: 2026, month: 8, day: 9, hour: 4, minute: 59 },
      { zone: TZ },
    ).toUTC().toJSDate();
    assert.equal(resolveBusinessDate(instant, TZ, RESET), "2026-08-08");
  });

  it("returns current calendar date just after the reset hour", () => {
    const instant = DateTime.fromObject(
      { year: 2026, month: 8, day: 9, hour: 5, minute: 0 },
      { zone: TZ },
    ).toUTC().toJSDate();
    assert.equal(resolveBusinessDate(instant, TZ, RESET), "2026-08-09");
  });

  it("returns current calendar date during evening service", () => {
    const instant = DateTime.fromObject(
      { year: 2026, month: 8, day: 9, hour: 22, minute: 30 },
      { zone: TZ },
    ).toUTC().toJSDate();
    assert.equal(resolveBusinessDate(instant, TZ, RESET), "2026-08-09");
  });

  it("an order at 23:50 and one at 00:30 share the earlier business date when reset is 05:00", () => {
    const late = DateTime.fromObject(
      { year: 2026, month: 8, day: 9, hour: 23, minute: 50 },
      { zone: TZ },
    ).toUTC().toJSDate();
    const early = DateTime.fromObject(
      { year: 2026, month: 8, day: 10, hour: 0, minute: 30 },
      { zone: TZ },
    ).toUTC().toJSDate();
    assert.equal(resolveBusinessDate(late, TZ, RESET), "2026-08-09");
    assert.equal(resolveBusinessDate(early, TZ, RESET), "2026-08-09");
  });

  // US spring forward 2026: 2026-03-08 02:00 → 03:00 (CST → CDT)
  it("is correct across spring-forward DST (just before reset on transition Sunday)", () => {
    const beforeReset = DateTime.fromObject(
      { year: 2026, month: 3, day: 8, hour: 4, minute: 30 },
      { zone: TZ },
    ).toUTC().toJSDate();
    assert.equal(resolveBusinessDate(beforeReset, TZ, RESET), "2026-03-07");

    const afterReset = DateTime.fromObject(
      { year: 2026, month: 3, day: 8, hour: 5, minute: 0 },
      { zone: TZ },
    ).toUTC().toJSDate();
    assert.equal(resolveBusinessDate(afterReset, TZ, RESET), "2026-03-08");
  });

  // US fall back 2025: 2025-11-02 02:00 → 01:00 (CDT → CST)
  it("is correct across fall-back DST (evening before and morning after)", () => {
    const evening = DateTime.fromObject(
      { year: 2025, month: 11, day: 1, hour: 22, minute: 0 },
      { zone: TZ },
    ).toUTC().toJSDate();
    assert.equal(resolveBusinessDate(evening, TZ, RESET), "2025-11-01");

    const beforeReset = DateTime.fromObject(
      { year: 2025, month: 11, day: 2, hour: 3, minute: 0 },
      { zone: TZ },
    ).toUTC().toJSDate();
    assert.equal(resolveBusinessDate(beforeReset, TZ, RESET), "2025-11-01");

    const afterReset = DateTime.fromObject(
      { year: 2025, month: 11, day: 2, hour: 6, minute: 0 },
      { zone: TZ },
    ).toUTC().toJSDate();
    assert.equal(resolveBusinessDate(afterReset, TZ, RESET), "2025-11-02");
  });

  it("rejects invalid resetHour", () => {
    assert.throws(() => resolveBusinessDate(utc("2026-08-09T12:00:00Z"), TZ, 24));
  });
});
