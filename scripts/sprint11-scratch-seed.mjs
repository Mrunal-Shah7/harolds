#!/usr/bin/env node
// SPRINT-11: seed the scratch database (menu only) and set sendable manager destinations for a production-start rehearsal.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const dbName = "harolds_s11_scratch";
const rewritten = source.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`);
const httpish = source.replace(/^postgresql:/i, "http:");
const parsed = new URL(httpish);
const password = decodeURIComponent(parsed.password);
const user = decodeURIComponent(parsed.username) || "postgres";
const host = parsed.hostname || "localhost";
const port = parsed.port || "5432";
const psql = ["C:/Program Files/PostgreSQL/18/bin/psql.exe", "psql"].find((p) => p === "psql" || fs.existsSync(p));

function run(cmd, args, extraEnv = {}, useShell = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      env: { ...process.env, PGPASSWORD: password, ...extraEnv },
      stdio: "inherit",
      shell: useShell,
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

await run("pnpm", ["--filter", "@harolds/db", "exec", "tsx", "src/seed/index.ts", "--menu-only"], { DATABASE_URL: rewritten, NODE_ENV: "development" }, true);
await run(psql, [
  "-h",
  host,
  "-p",
  port,
  "-U",
  user,
  "-d",
  dbName,
  "-c",
  `UPDATE "StoreConfig" SET "managerAlertPhone" = '+17085550100', "managerAlertEmail" = 'alerts@example.com' WHERE id = 'default';`,
]);
console.log("scratch seeded (menu only) with sendable rehearsal alert destinations");
