// SPRINT-16 Phase 3: the retry lockout as a persisted deadline.
//
// The clamping rules are the whole point of testing this: the pre-Sprint-16 countdown could not
// go wrong because it never survived anything. A deadline read from storage can be absent,
// expired, garbage, or in the far future because the device clock moved.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FAILED_RETRY_LOCKOUT_SECONDS, remainingLockoutSeconds } from "./retry-lockout";

const NOW = 1_800_000_000_000;

describe("SPRINT-16 Phase 3: the lockout survives a reload", () => {
  it("a deadline written now still has time left when read back after a reload", () => {
    const deadline = NOW + FAILED_RETRY_LOCKOUT_SECONDS * 1000;
    // The reload: nothing in memory, only the stored deadline and the clock.
    assert.equal(remainingLockoutSeconds(deadline, NOW), FAILED_RETRY_LOCKOUT_SECONDS);
    assert.equal(remainingLockoutSeconds(deadline, NOW + 3_000), 12);
    assert.equal(remainingLockoutSeconds(deadline, NOW + 14_000), 1);
  });

  it("an expired deadline yields no lockout, never a negative countdown", () => {
    assert.equal(remainingLockoutSeconds(NOW - 1, NOW), 0);
    assert.equal(remainingLockoutSeconds(NOW - 600_000, NOW), 0);
    assert.equal(remainingLockoutSeconds(NOW, NOW), 0);
  });

  it("an absent or unparseable deadline yields no lockout", () => {
    assert.equal(remainingLockoutSeconds(null, NOW), 0);
    assert.equal(remainingLockoutSeconds(Number.NaN, NOW), 0);
    assert.equal(remainingLockoutSeconds(Number.POSITIVE_INFINITY, NOW), 0);
  });

  it("a manipulated clock or an edited deadline cannot exceed the configured duration", () => {
    assert.equal(
      remainingLockoutSeconds(NOW + 86_400_000, NOW),
      FAILED_RETRY_LOCKOUT_SECONDS,
      "a deadline a day out still only locks for the configured duration",
    );
    assert.equal(remainingLockoutSeconds(Number.MAX_SAFE_INTEGER, NOW), FAILED_RETRY_LOCKOUT_SECONDS);
  });

  it("the cap honours a caller-supplied maximum", () => {
    assert.equal(remainingLockoutSeconds(NOW + 999_000, NOW, 5), 5);
  });
});
