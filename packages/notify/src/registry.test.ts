// SPRINT-7: registry completeness — an unregistered type fails at construction.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JobType } from "@harolds/types";
import { JOB_HANDLERS } from "./handlers";
import { createDefaultJobRegistry, createJobRegistry } from "./registry";

describe("createJobRegistry", () => {
  it("accepts the full production map", () => {
    const registry = createDefaultJobRegistry();
    assert.equal(typeof registry[JobType.SMS_ORDER_CONFIRMATION], "function");
    assert.equal(typeof registry[JobType.EMAIL_ORDER_READY], "function");
  });

  it("fails loudly when a declared type is missing, then the full map is used again", () => {
    const { EMAIL_ORDER_READY: _omit, ...rest } = JOB_HANDLERS;
    assert.throws(() => createJobRegistry(rest), /EMAIL_ORDER_READY/);
    const restored = createDefaultJobRegistry();
    assert.equal(typeof restored[JobType.EMAIL_ORDER_READY], "function");
  });
});
