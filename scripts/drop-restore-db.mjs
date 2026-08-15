#!/usr/bin/env node
// SPRINT-9: drop a restore-drill database. Refuses the live name.
import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

const targetDb = process.argv[2];
if (!targetDb) {
  console.error("Usage: node --env-file=.env scripts/drop-restore-db.mjs <database>");
  process.exit(1);
}
if (/^harolds$/i.test(targetDb)) {
  console.error("Refusing to drop the live database.");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const parsed = new URL(url.replace(/^postgresql:/i, "http:"));
const PG_BIN = process.env.PG_BIN || "C:\\Program Files\\PostgreSQL\\18\\bin";
const dropdb = existsSync(path.join(PG_BIN, "dropdb.exe")) ? path.join(PG_BIN, "dropdb.exe") : "dropdb";
const child = spawn(
  dropdb,
  ["--if-exists", "-h", parsed.hostname, "-p", parsed.port || "5432", "-U", decodeURIComponent(parsed.username), targetDb],
  { stdio: "inherit", env: { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) } },
);
child.on("exit", (code) => process.exit(code ?? 1));
