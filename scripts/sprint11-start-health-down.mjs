#!/usr/bin/env node
// SPRINT-11: spawn a second Next instance against a database name that does not exist.
// Does not log DATABASE_URL. Leaves the working development database running.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const badUrl = source.replace(/\/[^/?]+(\?|$)/, "/harolds_s11_does_not_exist$1");
if (badUrl === source) {
  console.error("could not rewrite database name in DATABASE_URL");
  process.exit(1);
}

const child = spawn(
  "pnpm",
  ["--filter", "@harolds/web", "exec", "next", "dev", "--turbopack", "-p", "3002"],
  {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: badUrl,
      PORT: "3002",
      APP_BASE_URL: "http://127.0.0.1:3002",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3002",
    },
    stdio: "inherit",
    shell: true,
  },
);

child.on("exit", (code) => process.exit(code ?? 1));
