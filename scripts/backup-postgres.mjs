#!/usr/bin/env node
// SPRINT-9: take a PostgreSQL backup. Restore is proven by scripts/restore-postgres.mjs.
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("DATABASE_URL is required (run with node --env-file=.env)");
  process.exit(1);
}

function pgConnectionUri(input) {
  const parsed = new URL(input.replace(/^postgresql:/i, "http:"));
  parsed.searchParams.delete("schema");
  const user = parsed.username;
  const pass = parsed.password;
  const auth = user ? `${user}${pass ? `:${pass}` : ""}@` : "";
  const search = parsed.searchParams.toString();
  return `postgresql://${auth}${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}${search ? `?${search}` : ""}`;
}

const url = pgConnectionUri(rawUrl);

const outDir = process.env.BACKUP_DIR || path.join(root, "backups");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = path.join(outDir, `harolds-${stamp}.dump`);

const PG_BIN = process.env.PG_BIN || "C:\\Program Files\\PostgreSQL\\18\\bin";
const pgDump = existsSync(path.join(PG_BIN, "pg_dump.exe"))
  ? path.join(PG_BIN, "pg_dump.exe")
  : process.env.PG_DUMP_PATH || "pg_dump";

const child = spawn(pgDump, ["--format=custom", "--no-owner", "--file", outFile, url], {
  stdio: "inherit",
});

child.on("exit", (code) => {
  if (code === 0) console.log(`backup wrote ${outFile}`);
  process.exit(code ?? 1);
});
