// SPRINT-9: redaction is by field name; a call site that logs a secret still emits [redacted].
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REDACTED, isSensitiveLogKey, redactFields } from "./log";

describe("log redaction", () => {
  it("redacts secrets, tokens, PINs, phones, and emails by field name", () => {
    const out = redactFields({
      password: "HaroldsOwner1!",
      pin: "2468",
      token: "has_abc",
      customerPhone: "+17085551234",
      customerEmail: "pat@example.com",
      SQUARE_ACCESS_TOKEN: "sq0at-secret",
      PRINTER_SDP_SHARED_SECRET: "query-secret",
      orderId: "ord_keep",
      amountCents: 879,
    }) as Record<string, unknown>;
    assert.equal(out.password, REDACTED);
    assert.equal(out.pin, REDACTED);
    assert.equal(out.token, REDACTED);
    assert.equal(out.customerPhone, REDACTED);
    assert.equal(out.customerEmail, REDACTED);
    assert.equal(out.SQUARE_ACCESS_TOKEN, REDACTED);
    assert.equal(out.PRINTER_SDP_SHARED_SECRET, REDACTED);
    assert.equal(out.orderId, "ord_keep");
    assert.equal(out.amountCents, 879);
    const blob = JSON.stringify(out);
    assert.equal(blob.includes("HaroldsOwner1!"), false);
    assert.equal(blob.includes("2468"), false);
    assert.equal(blob.includes("pat@example.com"), false);
    assert.equal(blob.includes("+17085551234"), false);
  });

  it("redacts the print secret in a query string", () => {
    const out = redactFields({
      url: "https://example.com/api/v1/print/poll?key=super-secret-value",
    }) as Record<string, unknown>;
    assert.equal(String(out.url).includes("super-secret-value"), false);
    assert.match(String(out.url), /\[redacted\]/);
  });

  it("does not treat orderId as sensitive", () => {
    assert.equal(isSensitiveLogKey("orderId"), false);
    assert.equal(isSensitiveLogKey("jobId"), false);
    assert.equal(isSensitiveLogKey("password"), true);
  });

  it("does not redact capability flags that happen to contain email", () => {
    const out = redactFields({
      emailConfigured: false,
      smsConfigured: true,
      email: "pat@example.com",
    }) as Record<string, unknown>;
    assert.equal(out.emailConfigured, false);
    assert.equal(out.smsConfigured, true);
    assert.equal(out.email, REDACTED);
  });
});
