#!/usr/bin/env node
// SPRINT-11: print the production missing-variable message (no live credentials).
import { missingProductionVariables } from "../packages/config/src/production-guards.ts";

const missing = missingProductionVariables({
  NODE_ENV: "production",
  PRINTER_SDP_SHARED_SECRET: "secret",
});
console.log(
  [
    "Environment validation failed. Fix the following variable(s):",
    ...missing.map((line) => `  - ${line}`),
    "",
    "See .env.example for documentation of every variable.",
  ].join("\n"),
);
