#!/usr/bin/env node
// SPRINT-10: read-only launch inventory via psql. Never prints credentials.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const parsed = new URL(url.replace(/^postgresql:/i, "http:"));
parsed.searchParams.delete("schema");
const PG_BIN = process.env.PG_BIN || "C:\\Program Files\\PostgreSQL\\18\\bin";
const psql = existsSync(path.join(PG_BIN, "psql.exe")) ? path.join(PG_BIN, "psql.exe") : "psql";
const env = { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) };
const args = ["-h", parsed.hostname, "-p", parsed.port || "5432", "-U", decodeURIComponent(parsed.username), "-d", parsed.pathname.replace(/^\//, "").split("?")[0], "-At"];

function q(sql) {
  const r = spawnSync(psql, [...args, "-c", sql], { env, encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr || "psql failed");
    process.exit(r.status ?? 1);
  }
  return r.stdout.trim();
}

console.log("unverified_prices:");
console.log(q(`SELECT name, "basePriceCents" FROM "MenuItem" WHERE "isUnverifiedPrice" ORDER BY name`));
console.log("provisional_groups:");
console.log(q(`SELECT name, prompt FROM "ModifierGroup" WHERE "isProvisional" ORDER BY name`));
console.log("featured_count:", q(`SELECT count(*) FROM "MenuItem" WHERE "isFeatured"`));
console.log("most_ordered_count:", q(`SELECT count(*) FROM "MenuItem" WHERE "isMostOrdered"`));
console.log("items_with_photo:", q(`SELECT count(*) FROM "MenuItem" WHERE "imageUrl" IS NOT NULL`));
console.log("store_config:");
console.log(q(`SELECT "contactPhone", "managerAlertPhone", "managerAlertEmail", "tipPresetsBps", "defaultTipPresetIndex", "taxRateBps", timezone, "orderNumberPrefix" FROM "StoreConfig"`));
console.log("hours:");
console.log(q(`SELECT "dayOfWeek", "openTime", "closeTime", "isClosed" FROM "StoreHours" ORDER BY "dayOfWeek"`));
console.log("staff:");
console.log(q(`SELECT email, role, "isActive" FROM "AdminUser" ORDER BY role, email`));
console.log("item_count:", q(`SELECT count(*) FROM "MenuItem"`));
