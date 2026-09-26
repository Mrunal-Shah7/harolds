// SPRINT-9 / SPRINT-17 / SPRINT-18.2 / SPRINT-19: exemptions and NMI Collect.js CSP sources.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { env } from "./env";
import { nmiGatewayUrls } from "./nmi-gateway";
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

/** The sources listed for one directive of a generated policy. */
function sources(csp: string, directive: string): string[] {
  const entry = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${directive} `));
  return entry ? entry.split(/\s+/).slice(1) : [];
}

const COLLECT_JS_DIRECTIVES = ["script-src", "style-src", "frame-src", "connect-src"];

describe("content security policy", () => {
  // SPRINT-18.2: the expected origin is DERIVED from nmi-gateway.ts, never written here. The
  // literal values are pinned once, in nmi-gateway.test.ts.
  for (const environment of ["sandbox", "production"] as const) {
    it(`allows exactly the ${environment} gateway on every Collect.js directive`, () => {
      // SPRINT-19: wallets pinned OFF. This is the gateway-only policy; with Google Pay on,
      // frame-src legitimately gains its hosts (wallets.test.ts), whatever the local .env says.
      const csp = contentSecurityPolicy(environment, { applePay: false, googlePay: false });
      const active = nmiGatewayUrls(environment).origin;
      const other = nmiGatewayUrls(environment === "production" ? "sandbox" : "production").origin;
      for (const directive of COLLECT_JS_DIRECTIVES) {
        assert.ok(sources(csp, directive).includes(active), `${directive} must allow ${active}`);
        assert.ok(!sources(csp, directive).includes(other), `${directive} must not allow ${other}`);
      }
      // Only one gateway origin in the whole policy: self, the Apple SDK host and the gateway.
      const gatewayLike = sources(csp, "frame-src").filter((s) => s !== "'self'");
      assert.deepEqual(gatewayLike, [active]);
    });
  }

  it("follows the running process's NMI_ENVIRONMENT by default", () => {
    assert.equal(contentSecurityPolicy(), contentSecurityPolicy(env.NMI_ENVIRONMENT));
  });

  it("keeps the fixed directives", () => {
    const csp = contentSecurityPolicy();
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
