// SPRINT-6: escalation thresholds and elapsed-time formatting (no device required).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escalationLevel, formatElapsed, nextActionStatus } from "./kitchen-escalation";

describe("escalationLevel", () => {
  const paidAt = "2026-08-15T12:00:00.000Z";
  const t0 = Date.parse(paidAt);

  it("stays quiet until the on-screen window, then sounds, only for paid/printed", () => {
    assert.equal(
      escalationLevel({ status: "PAID", paidAt, nowMs: t0 + 59_000, screenMs: 60_000, soundMs: 120_000 }),
      "none",
    );
    assert.equal(
      escalationLevel({ status: "PRINTED", paidAt, nowMs: t0 + 60_000, screenMs: 60_000, soundMs: 120_000 }),
      "screen",
    );
    assert.equal(
      escalationLevel({ status: "PAID", paidAt, nowMs: t0 + 120_000, screenMs: 60_000, soundMs: 120_000 }),
      "sound",
    );
    assert.equal(
      escalationLevel({
        status: "IN_PROGRESS",
        paidAt,
        nowMs: t0 + 120_000,
        screenMs: 60_000,
        soundMs: 120_000,
      }),
      "none",
    );
  });

  it("formats elapsed time and maps tap actions", () => {
    assert.equal(formatElapsed(paidAt, t0 + 125_000), "2:05");
    assert.equal(nextActionStatus("PAID"), "IN_PROGRESS");
    assert.equal(nextActionStatus("PRINTED"), "IN_PROGRESS");
    assert.equal(nextActionStatus("IN_PROGRESS"), "READY");
    assert.equal(nextActionStatus("READY"), "PICKED_UP");
  });
});
