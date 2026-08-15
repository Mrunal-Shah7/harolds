#!/usr/bin/env node
// SPRINT-11: apply deploy migrations to a scratch database, then optionally drop it. Does not log secrets.
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
const dropOnly = process.argv.includes("--drop");

const rewritten = source.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`);
if (rewritten === source) {
  console.error("could not rewrite database name");
  process.exit(1);
}

const httpish = source.replace(/^postgresql:/i, "http:");
const parsed = new URL(httpish);
const password = decodeURIComponent(parsed.password);
const user = decodeURIComponent(parsed.username) || "postgres";
const host = parsed.hostname || "localhost";
const port = parsed.port || "5432";

const psqlCandidates = [
  process.env.PSQL_PATH,
  "C:/Program Files/PostgreSQL/18/bin/psql.exe",
  "C:/Program Files/PostgreSQL/17/bin/psql.exe",
  "psql",
].filter(Boolean);
const psql = psqlCandidates.find((p) => p === "psql" || fs.existsSync(p));
if (!psql) {
  console.error("psql not found");
  process.exit(1);
}

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

const ident = dbName.replace(/"/g, '""');
if (dropOnly) {
  await run(psql, ["-h", host, "-p", port, "-U", user, "-d", "postgres", "-c", `DROP DATABASE IF EXISTS "${ident}" WITH (FORCE);`]);
  console.log(`dropped scratch database ${dbName}`);
  process.exit(0);
}

await run(psql, ["-h", host, "-p", port, "-U", user, "-d", "postgres", "-c", `DROP DATABASE IF EXISTS "${ident}" WITH (FORCE);`]);
await run(psql, ["-h", host, "-p", port, "-U", user, "-d", "postgres", "-c", `CREATE DATABASE "${ident}";`]);
await run("pnpm", ["db:migrate:deploy"], { DATABASE_URL: rewritten, PGPASSWORD: password }, true);
console.log(`migrated scratch database ${dbName}`);
