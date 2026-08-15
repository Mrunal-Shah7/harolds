// SPRINT-7: backoff schedule used by the job worker.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jobRetryBackoffMs, JOB_WORKER_DEFAULTS } from "./jobs";

describe("jobRetryBackoffMs", () => {
  it("doubles from the base up to 16×", () => {
    const base = JOB_WORKER_DEFAULTS.backoffMs;
    assert.equal(jobRetryBackoffMs(base, 1), 30_000);
    assert.equal(jobRetryBackoffMs(base, 2), 60_000);
    assert.equal(jobRetryBackoffMs(base, 3), 120_000);
    assert.equal(jobRetryBackoffMs(base, 4), 240_000);
    assert.equal(jobRetryBackoffMs(base, 5), 480_000);
    assert.equal(jobRetryBackoffMs(base, 6), 480_000);
  });
});
