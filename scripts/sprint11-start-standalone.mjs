#!/usr/bin/env node
// SPRINT-11: production-mode standalone start against the scratch database (dummy providers, not live credentials).
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const dbName = process.env.S11_STANDALONE_DB || "harolds_s11_scratch";
const rewritten = source.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`);
const standaloneDir = process.env.S11_STANDALONE_DIR
  ? path.resolve(process.env.S11_STANDALONE_DIR)
  : path.join(root, "apps/web/.next/standalone/apps/web");
const port = process.env.PORT || "3001";

const child = spawn("node", ["server.js"], {
  cwd: standaloneDir,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: port,
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: rewritten,
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
    TWILIO_ACCOUNT_SID: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    TWILIO_AUTH_TOKEN: "s11_rehearsal_token_not_live",
    TWILIO_FROM_NUMBER: "+17085550000",
    EMAIL_API_KEY: "re_s11_rehearsal_not_live",
    EMAIL_FROM_ADDRESS: "orders@example.com",
    PRINTER_SDP_SHARED_SECRET: "s11rehearsalprintsecret32chars!!",
    SENTRY_DSN: "",
    TRUST_PROXY: "",
  },
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => process.exit(code ?? 1));
