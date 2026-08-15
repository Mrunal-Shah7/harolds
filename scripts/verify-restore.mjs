#!/usr/bin/env node
// SPRINT-9: compare live vs restored drill database row counts. Never prints credentials.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

const liveName = process.argv[2];
const restoreName = process.argv[3];
if (!liveName || !restoreName) {
  console.error("Usage: node --env-file=.env scripts/verify-restore.mjs <live-db> <restore-db>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const parsed = new URL(url.replace(/^postgresql:/i, "http:"));
const PG_BIN = process.env.PG_BIN || "C:\\Program Files\\PostgreSQL\\18\\bin";
const psql = existsSync(path.join(PG_BIN, "psql.exe")) ? path.join(PG_BIN, "psql.exe") : "psql";
const env = { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) };
const host = parsed.hostname;
const port = parsed.port || "5432";
const user = decodeURIComponent(parsed.username);

const TABLES = [
  "Category",
  "MenuItem",
  "ModifierGroup",
  "ModifierOption",
  "ItemModifierGroup",
  "Order",
  "OrderLine",
  "OrderNumberCounter",
  "ProcessorWebhookEvent",
  "ProcessorRefund",
  "PrintJob",
  "PrinterHeartbeat",
  "BackgroundJob",
  "SmsSuppression",
  "SmsInboundEvent",
  "StoreConfig",
  "AdminUser",
  "AdminSession",
  "OrderStatusEvent",
  "StoreHours",
  "StoreClosure",
  "AdminAuditLog",
];

const countSql = TABLES.map((t) => `SELECT '${t}' AS table, count(*)::int AS n FROM "${t}"`).join(" UNION ALL ");

function query(db, sql) {
  const result = spawnSync(
    psql,
    ["-h", host, "-p", port, "-U", user, "-d", db, "-At", "-c", sql],
    { env, encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(result.stderr || `psql failed for ${db}`);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

function parseCounts(raw) {
  const out = {};
  for (const line of raw.split("\n").filter(Boolean)) {
    const [table, n] = line.split("|");
    out[table] = Number(n);
  }
  return out;
}

const live = parseCounts(query(liveName, countSql));
const restored = parseCounts(query(restoreName, countSql));

let mismatch = 0;
console.log("table\tlive\trestore");
for (const table of TABLES) {
  const a = live[table] ?? -1;
  const b = restored[table] ?? -1;
  if (a !== b) mismatch += 1;
  console.log(`${table}\t${a}\t${b}${a === b ? "" : "\tMISMATCH"}`);
}

const storeLive = query(liveName, `SELECT id, "taxRateBps", "orderNumberPrefix" FROM "StoreConfig"`);
const storeRestored = query(restoreName, `SELECT id, "taxRateBps", "orderNumberPrefix" FROM "StoreConfig"`);
console.log("store_config live:", storeLive);
console.log("store_config restore:", storeRestored);
if (storeLive !== storeRestored) {
  mismatch += 1;
  console.error("StoreConfig mismatch");
}

const sampleSql = `SELECT o.id, o."orderNumber", o.status, count(l.id)::int
FROM "Order" o
LEFT JOIN "OrderLine" l ON l."orderId" = o.id
GROUP BY o.id
ORDER BY o."createdAt" DESC
LIMIT 5`;
const sampleLive = query(liveName, sampleSql);
const sampleRestored = query(restoreName, sampleSql);
console.log("sample orders live:\n" + sampleLive);
console.log("sample orders restore:\n" + sampleRestored);
if (sampleLive !== sampleRestored) {
  mismatch += 1;
  console.error("Sample order mismatch");
}

if (mismatch > 0) {
  console.error(`restore verification failed: ${mismatch} mismatch(es)`);
  process.exit(1);
}
console.log("restore verification passed");
