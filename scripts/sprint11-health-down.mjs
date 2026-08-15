#!/usr/bin/env node
// SPRINT-11: health over HTTP with a database name that does not exist (working DB left running).
const base = process.env.APP_BASE_URL || "http://127.0.0.1:3002";

async function waitForHealth() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/v1/health`, { redirect: "manual" });
      const json = await res.json();
      return { status: res.status, json };
    } catch {
      /* not up */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("health-down instance did not become reachable");
}

const { status, json } = await waitForHealth();
const db = json.data?.checks?.database;
const ok = json.data?.ok;
console.log(`health status=${status} ok=${ok} database=${db}`);
if (status !== 503) {
  console.error("expected 503 when the database is unreachable");
  process.exit(1);
}
if (ok !== false || db !== "down") {
  console.error("expected data.ok=false and checks.database=down");
  process.exit(1);
}
console.log("sprint11-health-down passed");
