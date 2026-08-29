// SPRINT-12: trading-state unit tests — precedence and override forms.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateTradingState,
  TradingOverrideKind,
  defaultOverrideExpiry,
} from "./trading-state";

const HOURS = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  openTime: "11:00",
  closeTime: "21:00",
  isClosed: false,
}));

function base(overrides: Partial<Parameters<typeof evaluateTradingState>[0]> = {}) {
  return evaluateTradingState({
    instant: new Date("2026-08-24T18:00:00.000Z"), // 13:00 Chicago CDT
    timeZone: "America/Chicago",
    orderNumberResetHour: 5,
    acceptingOrders: true,
    hours: HOURS,
    closures: [],
    overrides: [],
    ...overrides,
  });
}

describe("evaluateTradingState precedence", () => {
  it("switch off wins over an open schedule", () => {
    const r = base({ acceptingOrders: false });
    assert.equal(r.isOpen, true);
    assert.equal(r.acceptingOrders, false);
    assert.equal(r.closedReason, "ACCEPTING_ORDERS_OFF");
  });

  it("CLOSED_REST_OF_DAY closes while schedule is open", () => {
    const r = base({
      overrides: [
        {
          id: "1",
          businessDate: "2026-08-24",
          kind: TradingOverrideKind.CLOSED_REST_OF_DAY,
          openTime: null,
          closeTime: null,
          customerMessage: "Kitchen down",
          expiresAt: new Date("2026-08-25T10:00:00.000Z"),
          cancelledAt: null,
        },
      ],
    });
    assert.equal(r.isOpen, false);
    assert.equal(r.closedReason, "OVERRIDE_CLOSED_REST_OF_DAY");
  });

  it("CLOSE_EARLY closes after the early close time", () => {
    const r = base({
      instant: new Date("2026-08-25T01:00:00.000Z"), // 20:00 Chicago
      overrides: [
        {
          id: "1",
          businessDate: "2026-08-24",
          kind: TradingOverrideKind.CLOSE_EARLY,
          openTime: null,
          closeTime: "19:00",
          customerMessage: null,
          expiresAt: new Date("2026-08-25T10:00:00.000Z"),
          cancelledAt: null,
        },
      ],
    });
    assert.equal(r.isOpen, false);
    assert.equal(r.closedReason, "OVERRIDE_CLOSE_EARLY");
  });

  it("OPEN_LATE keeps closed before the late open", () => {
    const r = base({
      instant: new Date("2026-08-24T17:00:00.000Z"), // 12:00 Chicago
      overrides: [
        {
          id: "1",
          businessDate: "2026-08-24",
          kind: TradingOverrideKind.OPEN_LATE,
          openTime: "14:00",
          closeTime: null,
          customerMessage: null,
          expiresAt: new Date("2026-08-25T10:00:00.000Z"),
          cancelledAt: null,
        },
      ],
    });
    assert.equal(r.isOpen, false);
    assert.equal(r.closedReason, "OVERRIDE_OPEN_LATE");
  });

  it("OPEN_ANYWAY opens outside schedule inside the window", () => {
    const r = base({
      instant: new Date("2026-08-24T14:00:00.000Z"), // 09:00 Chicago — before 11:00
      overrides: [
        {
          id: "1",
          businessDate: "2026-08-24",
          kind: TradingOverrideKind.OPEN_ANYWAY,
          openTime: "08:00",
          closeTime: "10:00",
          customerMessage: null,
          expiresAt: new Date("2026-08-25T10:00:00.000Z"),
          cancelledAt: null,
        },
      ],
    });
    assert.equal(r.isOpen, true);
    assert.equal(r.closedReason, null);
  });

  it("expired overrides are ignored", () => {
    const r = base({
      overrides: [
        {
          id: "1",
          businessDate: "2026-08-24",
          kind: TradingOverrideKind.CLOSED_REST_OF_DAY,
          openTime: null,
          closeTime: null,
          customerMessage: null,
          expiresAt: new Date("2026-08-24T12:00:00.000Z"),
          cancelledAt: null,
        },
      ],
    });
    assert.equal(r.isOpen, true);
    assert.equal(r.closedReason, null);
  });

  it("defaultOverrideExpiry is after the business date reset hour", () => {
    const exp = defaultOverrideExpiry("2026-08-24", "America/Chicago", 5);
    assert.ok(exp.getTime() > Date.parse("2026-08-25T09:00:00.000Z"));
  });
});
