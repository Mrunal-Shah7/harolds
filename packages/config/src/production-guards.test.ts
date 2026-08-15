// SPRINT-11: manager destination placeholders fail a production start.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLACEHOLDER_MANAGER_ALERT_EMAIL,
  PLACEHOLDER_MANAGER_ALERT_PHONE,
  managerDestinationProblems,
} from "./production-guards";

describe("manager destination problems", () => {
  it("rejects the seeded placeholders and names them", () => {
    const problems = managerDestinationProblems(
      PLACEHOLDER_MANAGER_ALERT_PHONE,
      PLACEHOLDER_MANAGER_ALERT_EMAIL,
    );
    assert.ok(problems.length >= 2);
    assert.ok(problems.some((p) => p.includes(PLACEHOLDER_MANAGER_ALERT_PHONE)));
    assert.ok(problems.some((p) => p.includes(PLACEHOLDER_MANAGER_ALERT_EMAIL)));
  });

  it("rejects both-absent", () => {
    const problems = managerDestinationProblems(null, null);
    assert.ok(problems.some((p) => /absent or unsendable/.test(p)));
  });

  it("accepts a real phone even when email is empty", () => {
    assert.deepEqual(managerDestinationProblems("+17085551212", null), []);
  });
});
