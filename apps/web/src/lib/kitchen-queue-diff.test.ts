// SPRINT-6: client-side queue diff (no device required).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appearedOrderIds, disappearedOrderIds } from "./kitchen-queue-diff";

describe("kitchen queue diff", () => {
  it("marks only newly appeared ids", () => {
    assert.deepEqual(appearedOrderIds(["a", "b"], ["a", "b", "c"]), ["c"]);
    assert.deepEqual(appearedOrderIds([], ["a"]), ["a"]);
    assert.deepEqual(appearedOrderIds(["a"], ["a"]), []);
  });

  it("marks ids that left the qualifying set", () => {
    assert.deepEqual(disappearedOrderIds(["a", "b"], ["b"]), ["a"]);
  });
});
