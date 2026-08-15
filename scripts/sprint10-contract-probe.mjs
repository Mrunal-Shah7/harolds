#!/usr/bin/env node
// SPRINT-10: probe live public API against the frozen 1.2.0 contract (paths, envelope, error codes).
const base = process.env.APP_BASE_URL || "http://127.0.0.1:3000";

async function waitForUp() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/v1/health`, { redirect: "manual" });
      if (res.status === 200 || res.status === 503) return;
    } catch {
      /* not up */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("API did not become reachable");
}

function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
}

await waitForUp();

const checks = [];

async function get(path) {
  const res = await fetch(`${base}${path}`, { redirect: "manual" });
  const json = await res.json().catch(() => null);
  return { res, json };
}

const health = await get("/api/v1/health");
checks.push(["health envelope version", health.json?.meta?.version === "1.2.0"]);
checks.push(["health has squareEnvironment", typeof health.json?.data?.squareEnvironment === "string"]);
checks.push(["health additive checks present", Boolean(health.json?.data?.checks)]);

const menu = await get("/api/v1/menu");
checks.push(["menu 200", menu.res.status === 200]);
checks.push(["menu version 1.2.0", menu.json?.meta?.version === "1.2.0"]);
checks.push(["menu categories array", Array.isArray(menu.json?.data?.categories)]);
const firstItem = menu.json?.data?.categories?.[0]?.items?.[0];
checks.push(["menu item has no client price field named price", firstItem ? firstItem.price === undefined : true]);
checks.push(["menu item has basePriceCents integer", Number.isInteger(firstItem?.basePriceCents)]);

const cats = await get("/api/v1/menu/categories");
checks.push(["categories 200", cats.res.status === 200]);

const featured = await get("/api/v1/menu/featured");
checks.push(["featured 200", featured.res.status === 200]);
checks.push(["featured items array", Array.isArray(featured.json?.data?.items) || Array.isArray(featured.json?.data)]);

const most = await get("/api/v1/menu/most-ordered");
checks.push(["most-ordered 200", most.res.status === 200]);

const store = await get("/api/v1/store/status");
checks.push(["store status 200", store.res.status === 200]);
checks.push(["store timezone present", typeof store.json?.data?.timezone === "string"]);
checks.push(["store taxRateBps integer", Number.isInteger(store.json?.data?.taxRateBps)]);
checks.push(["store no CORS", store.res.headers.get("access-control-allow-origin") == null]);

const missing = await get("/api/v1/this-path-does-not-exist");
checks.push(["unknown path 404", missing.res.status === 404]);
checks.push(["unknown path NOT_FOUND", missing.json?.error?.code === "NOT_FOUND"]);

const priced = await fetch(`${base}/api/v1/quote`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ lines: [], totalCents: 100 }),
});
const pricedJson = await priced.json();
checks.push(["quote rejects client totalCents", priced.status === 400]);
checks.push(["quote PRICE forbidden code", pricedJson?.error?.code === "VALIDATION_ERROR"]);

const malformed = await fetch(`${base}/api/v1/quote`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{not-json",
});
const malformedJson = await malformed.json().catch(() => null);
checks.push(["malformed quote 400", malformed.status === 400]);
checks.push(["malformed quote VALIDATION_ERROR", malformedJson?.error?.code === "VALIDATION_ERROR"]);

const orderPriced = await fetch(`${base}/api/v1/orders`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ cart: { lines: [] }, total: 12.99, sourceId: "tok" }),
});
const orderPricedJson = await orderPriced.json();
checks.push(["orders rejects client total", orderPriced.status === 400]);
checks.push(["orders price rejection is VALIDATION_ERROR", orderPricedJson?.error?.code === "VALIDATION_ERROR"]);

let passed = 0;
let failed = 0;
for (const [name, ok] of checks) {
  if (ok) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    fail(name);
  }
}
console.log(`contract probe ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
