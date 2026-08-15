// SPRINT-9: exemptions and Square CSP sources.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RATE_LIMITS,
  contentSecurityPolicy,
  isRateLimitExemptPath,
} from "./security";

describe("rate limit policy", () => {
  it("exempts printer poll, Square webhook, kitchen queue, and health", () => {
    assert.equal(isRateLimitExemptPath("/api/v1/print/poll"), true);
    assert.equal(isRateLimitExemptPath("/api/v1/print/complete"), true);
    assert.equal(isRateLimitExemptPath("/api/v1/webhooks/square"), true);
    assert.equal(isRateLimitExemptPath("/api/v1/webhooks/twilio"), true);
    assert.equal(isRateLimitExemptPath("/api/internal/kitchen/queue"), true);
    assert.equal(isRateLimitExemptPath("/api/v1/health"), true);
    assert.equal(isRateLimitExemptPath("/api/v1/quote"), false);
    assert.equal(isRateLimitExemptPath("/api/v1/orders"), false);
  });

  it("gives quote and orders tighter limits than menu", () => {
    assert.ok(RATE_LIMITS.quote.limit < RATE_LIMITS.menu.limit);
    assert.ok(RATE_LIMITS.orders.limit < RATE_LIMITS.quote.limit);
  });
});

describe("content security policy", () => {
  it("allows Square Web Payments script, frame, and connect origins", () => {
    const csp = contentSecurityPolicy();
    assert.match(csp, /squarecdn\.com/);
    assert.match(csp, /squareup\.com/);
    assert.match(csp, /squareupsandbox\.com/);
    assert.match(csp, /frame-ancestors 'none'/);
  });
});
