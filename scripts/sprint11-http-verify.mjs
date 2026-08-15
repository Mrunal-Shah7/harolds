#!/usr/bin/env node
// SPRINT-11: prove sold-out cache invalidation and 304 over HTTP against a running server.
const base = process.env.APP_BASE_URL || "http://127.0.0.1:3000";

async function waitForUp() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/v1/health`, { redirect: "manual" });
      if (res.status === 200 || res.status === 503) return;
    } catch {
      /* not up */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("server did not become reachable");
}

function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
}

await waitForUp();

const malformed = await fetch(`${base}/api/v1/quote`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{not-json",
});
if (malformed.status !== 400) fail(`malformed quote status ${malformed.status}`);
else {
  const body = await malformed.json();
  if (body.error?.code !== "VALIDATION_ERROR") fail(`malformed quote code ${body.error?.code}`);
  else console.log("ok malformed quote → 400 VALIDATION_ERROR (not 500)");
}

const menu1 = await fetch(`${base}/api/v1/menu`);
if (menu1.status !== 200) fail(`menu1 ${menu1.status}`);
const etag1 = menu1.headers.get("etag");
const menu1Json = await menu1.json();
const item = menu1Json.data?.categories?.flatMap((c) => c.items ?? [])?.find((i) => i.isSoldOut === false);
if (!item?.id) {
  fail("no in-stock item on public menu");
} else {
  const notModified = await fetch(`${base}/api/v1/menu`, { headers: { "if-none-match": etag1 ?? "" } });
  if (notModified.status !== 304) fail(`conditional menu ${notModified.status} etag=${etag1}`);
  else console.log(`ok conditional menu 304 etag=${etag1}`);

  const signin = await fetch(`${base}/api/internal/admin/auth/signin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "test-owner@localhost", password: "HaroldsOwner1!" }),
  });
  if (signin.status !== 200) fail(`admin signin ${signin.status} ${await signin.text()}`);
  const setCookie = signin.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  if (!cookie.startsWith("harolds_admin=")) fail(`no admin cookie: ${setCookie}`);

  const toggleOn = await fetch(`${base}/api/internal/admin/menu/items/${item.id}/sold-out`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ isSoldOut: true }),
  });
  if (toggleOn.status !== 200) fail(`sold-out on ${toggleOn.status} ${await toggleOn.text()}`);

  const menu2 = await fetch(`${base}/api/v1/menu`);
  const menu2Json = await menu2.json();
  const etag2 = menu2.headers.get("etag");
  const after = menu2Json.data?.categories?.flatMap((c) => c.items ?? [])?.find((i) => i.id === item.id);
  if (!after?.isSoldOut) fail(`sold-out did not appear on the immediately following public menu request (etag1=${etag1} etag2=${etag2})`);
  else if (etag2 === etag1) fail("etag unchanged after sold-out toggle");
  else console.log(`ok sold-out visible immediately item=${item.id} etag ${etag1} → ${etag2}`);

  const toggleOff = await fetch(`${base}/api/internal/admin/menu/items/${item.id}/sold-out`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ isSoldOut: false }),
  });
  if (toggleOff.status !== 200) fail(`sold-out off ${toggleOff.status}`);
  else console.log("ok sold-out restored");
}

if (process.exitCode) process.exit(process.exitCode);
console.log("sprint11-http-verify passed");
