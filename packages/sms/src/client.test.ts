// SPRINT-7: SMS outcome taxonomy and redaction (no live Twilio).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyTwilioError, isUnsubscribedCode } from "./errors";
import { redactPhone } from "./redact";

describe("redactPhone", () => {
  it("never contains the full number", () => {
    const raw = "+17085551234";
    const redacted = redactPhone(raw);
    assert.equal(redacted.includes("7085551234"), false);
    assert.equal(redacted.includes(raw), false);
    assert.match(redacted, /\*\*\*1234/);
  });
});

describe("classifyTwilioError", () => {
  it("treats an invalid number as rejected (permanent)", () => {
    const r = classifyTwilioError({ code: 21211, status: 400, message: "Invalid To" });
    assert.equal(r.kind, "rejected");
  });

  it("treats 429 / 5xx as transport_failure", () => {
    const r = classifyTwilioError({ code: 20429, status: 429, message: "Too many requests" });
    assert.equal(r.kind, "transport_failure");
    const s = classifyTwilioError({ status: 503, message: "unavailable" });
    assert.equal(s.kind, "transport_failure");
  });

  it("recognises carrier unsubscribe", () => {
    assert.equal(isUnsubscribedCode("21610"), true);
  });
});
