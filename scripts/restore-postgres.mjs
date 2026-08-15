#!/usr/bin/env node
// SPRINT-9: restore a custom-format dump into a SEPARATE database. Never the live one.
import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

const dumpFile = process.argv[2];
const targetDb = process.argv[3];
if (!dumpFile || !targetDb) {
  console.error("Usage: node --env-file=.env scripts/restore-postgres.mjs <dump-file> <target-database>");
  process.exit(1);
}
if (/^harolds$/i.test(targetDb)) {
  console.error("Refusing to restore onto the live database name. Use harolds_sprint9_restore or similar.");
  process.exit(1);
}

function pgConnectionUri(input) {
  const parsed = new URL(input.replace(/^postgresql:/i, "http:"));
  parsed.searchParams.delete("schema");
  return parsed;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required (used only to find the server)");
  process.exit(1);
}

const parsed = pgConnectionUri(url);
const PG_BIN = process.env.PG_BIN || "C:\\Program Files\\PostgreSQL\\18\\bin";
function bin(name) {
  const win = path.join(PG_BIN, `${name}.exe`);
  if (existsSync(win)) return win;
  return name;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

const host = parsed.hostname;
const port = parsed.port || "5432";
const user = decodeURIComponent(parsed.username);

await run(bin("dropdb"), ["--if-exists", "-h", host, "-p", port, "-U", user, targetDb]);
await run(bin("createdb"), ["-h", host, "-p", port, "-U", user, targetDb]);
const restoreUrl = `postgresql://${parsed.username}:${parsed.password}@${host}:${port}/${targetDb}`;
const started = Date.now();
await run(bin("pg_restore"), ["--no-owner", "--dbname", restoreUrl, dumpFile]);
console.log(`restored ${dumpFile} into ${targetDb} in ${Date.now() - started}ms`);
