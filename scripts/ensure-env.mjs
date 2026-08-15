#!/usr/bin/env node
// SPRINT-3: create .env from .env.example ONLY when .env does not already exist.
// Never overwrites an existing .env — protects against the Sprint 2 mid-session overwrite incident.
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

if (existsSync(envPath)) {
  console.log("`.env` already exists — leaving it untouched (never overwrite).");
  process.exit(0);
}

if (!existsSync(examplePath)) {
  console.error("Missing .env.example at", examplePath);
  process.exit(1);
}

copyFileSync(examplePath, envPath);
console.log("Created .env from .env.example — fill in real values before running the app.");
