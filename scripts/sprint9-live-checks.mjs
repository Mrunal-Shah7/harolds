#!/usr/bin/env node
// SPRINT-9: live printer-rate poll + webhook burst + header/health checks against a running server.
const base = process.env.APP_BASE_URL || "http://127.0.0.1:3000";
const secret = process.env.PRINTER_SDP_SHARED_SECRET;
if (!secret) {
  console.error("PRINTER_SDP_SHARED_SECRET is required");
  process.exit(1);
}

async function waitForUp() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/v1/health`);
      if (res.status === 200 || res.status === 503) return res;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not become reachable");
}

const health = await waitForUp();
const healthJson = await health.json();
console.log(`health status=${health.status} ok=${healthJson.data?.ok} db=${healthJson.data?.checks?.database} worker=${healthJson.data?.checks?.worker} square=${healthJson.data?.squareEnvironment}`);

const home = await fetch(`${base}/`);
const csp = home.headers.get("content-security-policy") ?? "";
const frame = home.headers.get("x-frame-options");
const nosniff = home.headers.get("x-content-type-options");
const cors = home.headers.get("access-control-allow-origin");
const reqId = home.headers.get("x-request-id");
console.log(`headers cspSquare=${csp.includes("squarecdn")} frame=${frame} nosniff=${nosniff} cors=${cors ?? "none"} requestId=${Boolean(reqId)}`);

const menu = await fetch(`${base}/api/v1/menu`);
console.log(`menu status=${menu.status}`);

const quote = await fetch(`${base}/api/v1/quote`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{not-json",
});
console.log(`malformed quote status=${quote.status} (expect 400)`);

let pollOk = 0;
let pollLimited = 0;
let pollOther = 0;
const pollMs = Number(process.env.PRINT_POLL_MS || String(3 * 60_000));
const intervalMs = 5_000;
const started = Date.now();
while (Date.now() - started < pollMs) {
  const res = await fetch(`${base}/api/v1/print/poll?key=${encodeURIComponent(secret)}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "ConnectionType=GetRequest",
  });
  if (res.status === 429) pollLimited += 1;
  else if (res.status === 200) pollOk += 1;
  else pollOther += 1;
  const remaining = pollMs - (Date.now() - started);
  if (remaining > intervalMs) await new Promise((r) => setTimeout(r, intervalMs));
  else break;
}
console.log(`print poll ok=${pollOk} limited=${pollLimited} other=${pollOther} elapsedMs=${Date.now() - started}`);

let webhookLimited = 0;
let webhookOther = 0;
for (let i = 0; i < 40; i += 1) {
  const res = await fetch(`${base}/api/v1/webhooks/square`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (res.status === 429) webhookLimited += 1;
  else webhookOther += 1;
}
console.log(`square webhook burst limited=${webhookLimited} other=${webhookOther} (401/400 expected, not 429)`);

if (pollLimited > 0 || webhookLimited > 0) {
  console.error("exemption failed");
  process.exit(1);
}
if (pollOk < 20) {
  console.error("printer poll did not complete enough successful requests");
  process.exit(1);
}
console.log("live hardening checks passed");
