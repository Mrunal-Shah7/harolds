#!/usr/bin/env node
// SPRINT-11: exercise the mock API exactly as the storefront handoff describes (no database).
const base = process.env.MOCK_API_URL || "http://127.0.0.1:4001";

async function waitForUp() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/v1/health`);
      if (res.status === 200) return;
    } catch {
      /* not up */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("mock did not become reachable");
}

function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
}

const guest = {
  firstName: "Pat",
  lastName: "Lee",
  phone: "+17085550000",
  email: "pat@example.com",
  smsConsent: false,
};

await waitForUp();

const paths = [
  ["/api/v1/health", 200],
  ["/api/v1/menu", 200],
  ["/api/v1/menu/categories", 200],
  ["/api/v1/menu/featured", 200],
  ["/api/v1/menu/most-ordered", 200],
  ["/api/v1/store/status", 200],
];
for (const [p, want] of paths) {
  const res = await fetch(`${base}${p}`);
  if (res.status !== want) fail(`${p} ${res.status}`);
  else console.log(`ok ${p} ${res.status}`);
}

const menu = await (await fetch(`${base}/api/v1/menu`)).json();
const items =
  menu.data?.categories?.flatMap((c) => (c.items ?? []).map((i) => ({ ...i, categorySlug: c.slug }))) ?? [];
const first = items[0];
const orderable = items.find(
  (i) => i.isSoldOut === false && !(i.modifierGroups ?? []).some((g) => g.isRequired),
);
if (!first?.id) fail("menu has no items");
else {
  const byId = await fetch(`${base}/api/v1/menu/items/${first.id}`);
  if (byId.status !== 200) fail(`item by id ${byId.status}`);
  else console.log(`ok item by id ${first.id}`);
  const bySlug = await fetch(`${base}/api/v1/menu/categories/${first.categorySlug}/items/${first.slug}`);
  if (bySlug.status !== 200) fail(`item by slug ${bySlug.status}`);
  else console.log(`ok item by slug ${first.categorySlug}/${first.slug}`);
}

const quoteItem = orderable ?? first;
const quoteBody = JSON.stringify({
  lines: quoteItem ? [{ itemId: quoteItem.id, quantity: 1, selectedOptionIds: [] }] : [],
});
const quote = await fetch(`${base}/api/v1/quote`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: quoteBody,
});
if (quote.status !== 200 && quote.status !== 400) fail(`quote ${quote.status}`);
else console.log(`ok quote ${quote.status}`);

const missingConsent = await fetch(`${base}/api/v1/orders`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    cart: { lines: quoteItem ? [{ itemId: quoteItem.id, quantity: 1, selectedOptionIds: [] }] : [] },
    customer: { firstName: "Pat", lastName: "Lee", phone: "+17085550000", email: "pat@example.com" },
    paymentToken: "tok_mock",
    idempotencyKey: `s11-mock-noconsent-${Date.now()}`,
  }),
});
const missingConsentJson = await missingConsent.json();
if (missingConsent.status !== 400 || missingConsentJson.error?.code !== "VALIDATION_ERROR") {
  fail(`missing smsConsent ${missingConsent.status} ${missingConsentJson.error?.code}`);
} else console.log("ok missing smsConsent → 400 VALIDATION_ERROR (mock matches real API)");

const triggers = [
  ["/api/v1/menu?forceError=NOT_FOUND", 404, "NOT_FOUND"],
  ["/api/v1/store/status?forceStore=closed", 200, null],
  ["/api/v1/store/status?forceStore=not-accepting", 200, null],
  ["/api/v1/quote?forceError=VALIDATION_ERROR", 400, "VALIDATION_ERROR"],
  ["/api/v1/quote?forceSoldOut=item", 400, "VALIDATION_ERROR"],
];
for (const [p, want, code] of triggers) {
  const res = await fetch(
    `${base}${p}`,
    p.includes("/quote")
      ? { method: "POST", headers: { "content-type": "application/json" }, body: quoteBody }
      : undefined,
  );
  if (res.status !== want) fail(`trigger ${p} ${res.status}`);
  else {
    const json = await res.json();
    if (code && json.error?.code !== code) fail(`trigger ${p} code ${json.error?.code}`);
    else console.log(`ok trigger ${p} ${res.status} ${code ?? ""}`);
  }
}

const headerErr = await fetch(`${base}/api/v1/menu`, { headers: { "X-Mock-Error": "NOT_FOUND" } });
const headerJson = await headerErr.json();
if (headerErr.status !== 404 || headerJson.error?.code !== "NOT_FOUND") {
  fail(`X-Mock-Error ${headerErr.status} ${headerJson.error?.code}`);
} else console.log("ok X-Mock-Error header → 404 NOT_FOUND");

function orderBody() {
  return JSON.stringify({
    cart: { lines: quoteItem ? [{ itemId: quoteItem.id, quantity: 1, selectedOptionIds: [] }] : [] },
    customer: guest,
    paymentToken: "tok_mock",
    idempotencyKey: `s11-mock-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  });
}

const declined = await fetch(`${base}/api/v1/orders?forcePayment=declined`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: orderBody(),
});
const declinedJson = await declined.json();
if (declined.status !== 402 || declinedJson.error?.code !== "PAYMENT_DECLINED") {
  fail(`declined ${declined.status} ${declinedJson.error?.code}`);
} else console.log("ok forcePayment=declined → 402 PAYMENT_DECLINED");

const failed = await fetch(`${base}/api/v1/orders?forcePayment=transport`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: orderBody(),
});
const failedJson = await failed.json();
if (failed.status !== 502 || failedJson.error?.code !== "PAYMENT_FAILED") {
  fail(`transport ${failed.status} ${failedJson.error?.code}`);
} else console.log("ok forcePayment=transport → 502 PAYMENT_FAILED");

const soldOutOrder = await fetch(`${base}/api/v1/orders?forceSoldOut=item`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: orderBody(),
});
const soldOutJson = await soldOutOrder.json();
if (soldOutOrder.status !== 409 || soldOutJson.error?.code !== "ITEM_UNAVAILABLE") {
  fail(`forceSoldOut order ${soldOutOrder.status} ${soldOutJson.error?.code}`);
} else console.log("ok forceSoldOut=item → 409 ITEM_UNAVAILABLE");

const closedOrder = await fetch(`${base}/api/v1/orders?forceStore=closed`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: orderBody(),
});
const closedJson = await closedOrder.json();
if (closedOrder.status !== 409 || closedJson.error?.code !== "STORE_CLOSED") {
  fail(`forceStore closed ${closedOrder.status} ${closedJson.error?.code}`);
} else console.log("ok forceStore=closed → 409 STORE_CLOSED");

const pausedOrder = await fetch(`${base}/api/v1/orders?forceStore=not-accepting`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: orderBody(),
});
const pausedJson = await pausedOrder.json();
if (pausedOrder.status !== 409 || pausedJson.error?.code !== "STORE_NOT_ACCEPTING_ORDERS") {
  fail(`forceStore not-accepting ${pausedOrder.status} ${pausedJson.error?.code}`);
} else console.log("ok forceStore=not-accepting → 409 STORE_NOT_ACCEPTING_ORDERS");

const created = await fetch(`${base}/api/v1/orders`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: orderBody(),
});
const createdJson = await created.json();
if (created.status !== 200 || !createdJson.data?.lookupToken) {
  fail(`create order ${created.status} ${JSON.stringify(createdJson.error ?? createdJson)}`);
} else {
  console.log(`ok create order ${createdJson.data.orderNumber} token=${createdJson.data.lookupToken}`);
  const status = await fetch(`${base}/api/v1/orders/status/${createdJson.data.lookupToken}`);
  const statusJson = await status.json();
  if (status.status !== 200 || statusJson.data?.orderNumber !== createdJson.data.orderNumber) {
    fail(`status lookup ${status.status}`);
  } else console.log("ok order status by lookupToken");
}

if (process.exitCode) process.exit(process.exitCode);
console.log("sprint11-mock-handoff passed");
