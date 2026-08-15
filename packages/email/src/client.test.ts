// SPRINT-7: email outcome taxonomy and redaction (no live Resend).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyResendError, isPlausibleEmail } from "./errors";
import { redactEmail } from "./redact";

describe("redactEmail", () => {
  it("never contains the full address", () => {
    const raw = "customer@example.com";
    const redacted = redactEmail(raw);
    assert.equal(redacted.includes("customer@example.com"), false);
    assert.equal(redacted.includes("customer"), false);
    assert.match(redacted, /^c\*\*\*@\*\*\*\.com$/);
  });
});

describe("classifyResendError", () => {
  it("treats 422 / 400 as rejected (permanent)", () => {
    assert.equal(classifyResendError({ statusCode: 422, message: "invalid" }).kind, "rejected");
    assert.equal(classifyResendError({ statusCode: 400, message: "bad" }).kind, "rejected");
  });

  it("treats 429 / 5xx as transport_failure", () => {
    assert.equal(classifyResendError({ statusCode: 429, message: "rate" }).kind, "transport_failure");
    assert.equal(classifyResendError({ statusCode: 503, message: "down" }).kind, "transport_failure");
  });
});

describe("isPlausibleEmail", () => {
  it("rejects placeholders without a dotted domain", () => {
    assert.equal(isPlausibleEmail("todo-manager-alerts@localhost"), false);
    assert.equal(isPlausibleEmail("ok@haroldschicken.com"), true);
  });
});
