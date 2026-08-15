// SPRINT-9: health check fails when the database is down or the worker is stale.
import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { getHealthSnapshot } from "./health";
import { markWorkerPass, resetWorkerHeartbeat } from "./worker-heartbeat";
import { captureException, clearCapturedErrors, recentCapturedErrors } from "./errors";
import { redactFields, REDACTED } from "@harolds/config";
import { BODY_LIMITS } from "@harolds/config";
import { readBoundedJson } from "./read-json";
import { browserSecurityHeaders, contentSecurityPolicy } from "@harolds/config";
import { isSdpAuthenticated } from "./sdp-auth";

describe("health snapshot", () => {
  afterEach(() => {
    resetWorkerHeartbeat();
  });

  it("is unhealthy when the database is unreachable", async () => {
    markWorkerPass();
    const snap = await getHealthSnapshot(new Date(), { databaseUp: async () => false });
    assert.equal(snap.ok, false);
    assert.equal(snap.checks.database, "down");
  });

  it("is unhealthy when the worker has not run recently", async () => {
    resetWorkerHeartbeat();
    const snap = await getHealthSnapshot(new Date(), { databaseUp: async () => true });
    assert.equal(snap.ok, false);
    assert.equal(snap.checks.worker, "down");
  });

  it("is healthy when the database is up and the worker just ran", async () => {
    markWorkerPass();
    const snap = await getHealthSnapshot(new Date(), { databaseUp: async () => true });
    assert.equal(snap.ok, true);
    assert.equal(snap.checks.database, "up");
    assert.equal(snap.checks.worker, "up");
  });
});

describe("error capture redaction", () => {
  afterEach(() => {
    clearCapturedErrors();
  });

  it("redacts secrets in captured context", async () => {
    await captureException(new Error("boom"), {
      password: "HaroldsOwner1!",
      token: "has_secret",
      customerEmail: "pat@example.com",
      orderId: "ord_1",
    });
    const last = recentCapturedErrors().at(-1);
    assert.ok(last);
    assert.equal(last?.context.password, REDACTED);
    assert.equal(last?.context.token, REDACTED);
    assert.equal(last?.context.customerEmail, REDACTED);
    assert.equal(last?.context.orderId, "ord_1");
    assert.equal(JSON.stringify(last).includes("HaroldsOwner1!"), false);
  });
});

describe("bounded JSON", () => {
  it("rejects an oversized body before parsing", async () => {
    const request = new Request("http://localhost/api/v1/quote", {
      method: "POST",
      headers: { "content-length": String(BODY_LIMITS.jsonPublicBytes + 10), "content-type": "application/json" },
      body: "{}",
    });
    const result = await readBoundedJson(request);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.response.status, 400);
  });

  it("rejects an oversized body without a content-length header before parsing", async () => {
    const body = "x".repeat(BODY_LIMITS.jsonPublicBytes + 20);
    const request = new Request("http://localhost/api/v1/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const result = await readBoundedJson(request);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.response.status, 400);
  });

  it("rejects an oversized admin body without a content-length header", async () => {
    const body = "x".repeat(BODY_LIMITS.jsonAdminBytes + 20);
    const request = new Request("http://localhost/api/internal/admin/store", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body,
    });
    const result = await readBoundedJson(request, { maxBytes: BODY_LIMITS.jsonAdminBytes, kind: "admin" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.response.status, 400);
  });

  it("rejects malformed JSON as validation, not a server error", async () => {
    const request = new Request("http://localhost/api/v1/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    const result = await readBoundedJson(request);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.response.status, 400);
  });
});

describe("security headers and print auth", () => {
  it("sets CSP, frame options, nosniff, and referrer policy", () => {
    const headers = browserSecurityHeaders({ isHttps: true, isProduction: true });
    assert.match(headers["Content-Security-Policy"] ?? "", /squarecdn/);
    assert.equal(headers["X-Frame-Options"], "DENY");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.match(headers["Strict-Transport-Security"] ?? "", /max-age=/);
    assert.match(contentSecurityPolicy(), /frame-ancestors 'none'/);
  });

  it("refuses an invalid print secret without mentioning serials", () => {
    const request = new Request("http://localhost/api/v1/print/poll?key=wrong-secret", { method: "POST" });
    assert.equal(isSdpAuthenticated(request), false);
  });
});

describe("redactFields used by capture", () => {
  it("strips a deliberately logged secret", () => {
    const out = redactFields({ PRINTER_SDP_SHARED_SECRET: "should-not-appear", ok: true }) as Record<string, unknown>;
    assert.equal(out.PRINTER_SDP_SHARED_SECRET, REDACTED);
    assert.equal(out.ok, true);
  });
});
