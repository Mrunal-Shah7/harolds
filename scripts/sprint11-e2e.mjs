#!/usr/bin/env node
// SPRINT-11: full API flow with Sprint 11 guards active — menu, quote, sandbox order, print, kitchen, notify.
const base = process.env.APP_BASE_URL || "http://127.0.0.1:3000";

function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
}

async function waitForUp() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/v1/health`);
      if (res.status === 200 || res.status === 503) {
        const json = await res.json();
        if (json.data?.ok) return json;
        if (res.status === 200) return json;
      }
    } catch {
      /* not up */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("server did not become reachable");
}

const health = await waitForUp();
console.log(`ok health square=${health.data?.squareEnvironment} db=${health.data?.checks?.database}`);

const menu = await (await fetch(`${base}/api/v1/menu`)).json();
const items =
  menu.data?.categories?.flatMap((c) => c.items ?? []) ?? [];
const item = items.find((i) => i.isSoldOut === false && !(i.modifierGroups ?? []).some((g) => g.isRequired));
if (!item?.id) {
  fail("no orderable item without required modifiers");
  process.exit(1);
}
console.log(`ok menu item=${item.id} ${item.name}`);

const quote = await fetch(`${base}/api/v1/quote`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ lines: [{ itemId: item.id, quantity: 1, selectedOptionIds: [] }] }),
});
const quoteJson = await quote.json();
if (quote.status !== 200) fail(`quote ${quote.status} ${JSON.stringify(quoteJson.error)}`);
else console.log(`ok quote total=${quoteJson.data?.totalCents} orderable=${quoteJson.data?.orderable}`);

let hoursRestored = true;
let savedHours = null;
const signin = await fetch(`${base}/api/internal/admin/auth/signin`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "test-owner@localhost", password: "HaroldsOwner1!" }),
});
if (signin.status !== 200) fail(`admin signin ${signin.status}`);
const adminCookie = (signin.headers.get("set-cookie") ?? "").split(";")[0];

async function restoreHours() {
  if (hoursRestored || !savedHours) return;
  const res = await fetch(`${base}/api/internal/admin/store/hours`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ rows: savedHours }),
  });
  hoursRestored = res.status === 200;
  console.log(hoursRestored ? "ok hours restored" : `FAIL hours restore ${res.status}`);
}

try {
  if (quoteJson.data && quoteJson.data.orderable === false) {
    const store = await fetch(`${base}/api/internal/admin/store`, { headers: { cookie: adminCookie } });
    const storeJson = await store.json();
    savedHours = storeJson.data?.hours ?? [];
    hoursRestored = false;
    const openRows = savedHours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      openTime: "00:00",
      closeTime: "23:59",
      isClosed: false,
    }));
    const widened = await fetch(`${base}/api/internal/admin/store/hours`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ rows: openRows }),
    });
    if (widened.status !== 200) fail(`widen hours ${widened.status} ${await widened.text()}`);
    else console.log("ok temporarily widened hours for sandbox checkout (store was closed)");
  }

  const created = await fetch(`${base}/api/v1/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cart: { lines: [{ itemId: item.id, quantity: 1, selectedOptionIds: [] }] },
      customer: {
        firstName: "Sprint",
        lastName: "Eleven",
        phone: "+17085550200",
        email: "sprint11@example.com",
        smsConsent: false,
      },
      paymentToken: "cnon:card-nonce-ok",
      idempotencyKey: `s11-e2e-${Date.now()}`,
    }),
  });
  const createdJson = await created.json();
  if (created.status !== 200 || !createdJson.data?.id) {
    fail(`sandbox order ${created.status} ${JSON.stringify(createdJson.error ?? createdJson)}`);
  } else {
    console.log(`ok sandbox order ${createdJson.data.orderNumber} id=${createdJson.data.id} total=${createdJson.data.totalCents}`);
    const roster = await (await fetch(`${base}/api/internal/kitchen/auth/roster`)).json();
    const staff = roster.data?.staff?.find((s) => s.role === "STAFF") ?? roster.data?.staff?.[0];
    if (!staff?.id) fail("kitchen roster empty");
    else {
      const ksignin = await fetch(`${base}/api/internal/kitchen/auth/signin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: staff.id, pin: "2468" }),
      });
      const kjson = await ksignin.json();
      const token = kjson.data?.token;
      if (ksignin.status !== 200 || !token) fail(`kitchen signin ${ksignin.status}`);
      else {
        const queue = await fetch(`${base}/api/internal/kitchen/queue`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const queueJson = await queue.json();
        const found = queueJson.data?.orders?.find((o) => o.id === createdJson.data.id);
        const printQueued = queueJson.data?.printHealth?.counts?.QUEUED ?? 0;
        if (!found) fail("paid order not on kitchen queue");
        else console.log(`ok kitchen queue has ${createdJson.data.orderNumber} printQueued=${printQueued}`);
        const transition = await fetch(`${base}/api/internal/kitchen/orders/${createdJson.data.id}/transition`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ to: "IN_PROGRESS" }),
        });
        const tjson = await transition.json();
        if (transition.status !== 200) fail(`transition ${transition.status} ${JSON.stringify(tjson.error)}`);
        else console.log(`ok kitchen transition ${tjson.data?.from} → ${tjson.data?.to}`);
      }
    }

    const dash = await fetch(`${base}/api/internal/admin/dashboard`, { headers: { cookie: adminCookie } });
    const dashJson = await dash.json();
    const jobCounts = dashJson.data?.jobs?.counts ?? {};
    const printCounts = dashJson.data?.print?.counts ?? dashJson.data?.printers ?? null;
    console.log(
      `ok dashboard jobs pending=${jobCounts.PENDING ?? "?"} failed=${jobCounts.FAILED ?? "?"} dead=${jobCounts.DEAD ?? "?"} reconcile=${dashJson.data?.reconciliation?.lastBusinessDate ?? "none"} findings=${dashJson.data?.reconciliation?.lastFindingCount ?? "n/a"} print=${JSON.stringify(printCounts)}`,
    );
    const pending = (jobCounts.PENDING ?? 0) + (jobCounts.FAILED ?? 0) + (jobCounts.DEAD ?? 0) + (jobCounts.RUNNING ?? 0) + (jobCounts.SUCCEEDED ?? 0);
    if (pending < 1) fail("expected notification jobs to be enqueued");
    else console.log("ok notification jobs present on operations dashboard");
  }
} finally {
  await restoreHours();
}

if (process.exitCode) process.exit(process.exitCode);
console.log("sprint11-e2e passed");
