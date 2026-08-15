// SPRINT-9: rate-limit thresholds, exemptions, recovery, and Retry-After.
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { RATE_LIMITS, isRateLimitExemptPath } from "@harolds/config";
import { resetRateLimitStore, takeRateLimit, checkPathExemption } from "./rate-limit";
import { clientAddress } from "./client-ip";
import { enforceRateLimit, rateLimitedResponse } from "./enforce-rate-limit";

describe("rate limiter", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("rejects at the configured threshold and recovers after the window", () => {
    const now = 1_000_000;
    for (let i = 0; i < RATE_LIMITS.quote.limit; i += 1) {
      const ok = takeRateLimit({ bucket: "quote", clientId: "1.1.1.1", now: now + i });
      assert.equal(ok.limited, false);
    }
    const blocked = takeRateLimit({ bucket: "quote", clientId: "1.1.1.1", now: now + RATE_LIMITS.quote.limit });
    assert.equal(blocked.limited, true);
    if (blocked.limited) {
      assert.ok(blocked.retryAfterSeconds >= 1);
    }
    const later = takeRateLimit({
      bucket: "quote",
      clientId: "1.1.1.1",
      now: now + RATE_LIMITS.quote.windowMs + 1,
    });
    assert.equal(later.limited, false);
  });

  it("keys clients separately so one source does not block another", () => {
    const now = 2_000_000;
    for (let i = 0; i < RATE_LIMITS.quote.limit; i += 1) {
      takeRateLimit({ bucket: "quote", clientId: "10.0.0.1", now });
    }
    const other = takeRateLimit({ bucket: "quote", clientId: "10.0.0.2", now });
    assert.equal(other.limited, false);
  });

  it("never limits printer poll, Square webhook, or kitchen queue paths", () => {
    assert.equal(checkPathExemption("/api/v1/print/poll"), true);
    assert.equal(isRateLimitExemptPath("/api/v1/webhooks/square"), true);
    assert.equal(isRateLimitExemptPath("/api/internal/kitchen/queue"), true);
    const printerPollIntervalMs = 5_000;
    const severalMinutesMs = 3 * 60_000;
    for (let elapsed = 0; elapsed <= severalMinutesMs; elapsed += printerPollIntervalMs) {
      const request = new Request("http://localhost/api/v1/print/poll?key=test", { method: "POST" });
      assert.equal(enforceRateLimit(request, "quote"), null);
    }
    for (let i = 0; i < 40; i += 1) {
      const burst = new Request("http://localhost/api/v1/webhooks/square", { method: "POST" });
      assert.equal(enforceRateLimit(burst, "orders"), null);
    }
    for (let elapsed = 0; elapsed <= severalMinutesMs; elapsed += 3_000) {
      const queue = new Request("http://localhost/api/internal/kitchen/queue");
      assert.equal(enforceRateLimit(queue, "kitchenOther"), null);
    }
  });

  it("returns 429 with Retry-After", () => {
    const response = rateLimitedResponse(12, "quote");
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "12");
  });
});

describe("client address", () => {
  it("uses the left-most forwarded address when the proxy is trusted", () => {
    const request = new Request("http://localhost/api/v1/quote", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    assert.equal(clientAddress(request, true), "203.0.113.9");
  });

  it("ignores forwarded headers when the proxy is not trusted", () => {
    const request = new Request("http://localhost/api/v1/quote", {
      headers: { "x-forwarded-for": "203.0.113.9" },
    });
    assert.equal(clientAddress(request, false), "direct");
  });
});
