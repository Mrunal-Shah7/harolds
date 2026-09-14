// SPRINT-11 / SPRINT-18: manager destination placeholders fail a production start.
//
// Email is the ONLY manager alert channel since SMS was removed, so these assertions changed
// shape: there is no longer a "phone OR email" fallback to satisfy.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLACEHOLDER_MANAGER_ALERT_EMAIL, managerDestinationProblems } from "./production-guards";

describe("manager destination problems", () => {
  it("rejects the seeded placeholder email and names it", () => {
    const problems = managerDestinationProblems(PLACEHOLDER_MANAGER_ALERT_EMAIL);
    assert.ok(problems.length >= 1);
    assert.ok(problems.some((p) => p.includes(PLACEHOLDER_MANAGER_ALERT_EMAIL)));
  });

  it("rejects an absent email", () => {
    const problems = managerDestinationProblems(null);
    assert.ok(problems.some((p) => /absent or unsendable/.test(p)));
  });

  it("rejects an empty-string email", () => {
    assert.ok(managerDestinationProblems("   ").length >= 1);
  });

  it("accepts a real email", () => {
    assert.deepEqual(managerDestinationProblems("manager@example.com"), []);
  });

  it("a phone number is NOT a usable destination any more", () => {
    // Before Sprint 18 a phone alone satisfied this guard. Nothing can send to a phone now, so
    // accepting one would let production start believing alerts were configured when every
    // alert would be dropped.
    assert.ok(managerDestinationProblems("+17085551212").length >= 1);
  });
});
