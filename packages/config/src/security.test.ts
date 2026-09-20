// SPRINT-9 / SPRINT-17: exemptions and NMI Collect.js CSP sources.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RATE_LIMITS,
  contentSecurityPolicy,
  isRateLimitExemptPath,
} from "./security";

describe("rate limit policy", () => {
  it("exempts printer poll, gateway webhook, kitchen queue, and health", () => {
    assert.equal(isRateLimitExemptPath("/api/v1/print/poll"), true);
    assert.equal(isRateLimitExemptPath("/api/v1/print/complete"), true);
    assert.equal(isRateLimitExemptPath("/api/v1/webhooks/nmi"), true);
    // SPRINT-17: the Twilio inbound webhook was deleted with the SMS subsystem.
    assert.equal(isRateLimitExemptPath("/api/v1/webhooks/twilio"), false);
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
  it("allows Collect.js script, frame, connect and style origins", () => {
    const csp = contentSecurityPolicy();
    // Both gateway hosts must be present: the CSP is a static header, so a policy carrying
    // only the active one would break the moment NMI_ENVIRONMENT flipped.
    assert.match(csp, /script-src[^;]*https:\/\/secure\.nmi\.com/);
    assert.match(csp, /script-src[^;]*https:\/\/sandbox\.nmi\.com/);
    // Collect.js mounts its card fields as iframes served from the gateway.
    assert.match(csp, /frame-src[^;]*https:\/\/secure\.nmi\.com/);
    assert.match(csp, /frame-src[^;]*https:\/\/sandbox\.nmi\.com/);
    assert.match(csp, /style-src[^;]*nmi\.com/);
    assert.match(csp, /connect-src[^;]*nmi\.com/);
    assert.match(csp, /frame-ancestors 'none'/);
    // Square's CDNs must be gone entirely, not merely unused.
    assert.doesNotMatch(csp, /square/i);
  });

  it("allows the Apple Pay SDK host that Collect.js injects for itself", () => {
    // Not a wallet feature — this checkout has none. Collect.js appends the Apple script tag in
    // its own constructor before configure() runs, and nothing suppresses it, so omitting the
    // host means a CSP violation on every checkout load. The hyphen matters.
    const csp = contentSecurityPolicy();
    assert.match(csp, /script-src[^;]*https:\/\/applepay\.cdn-apple\.com/);
  });
});
