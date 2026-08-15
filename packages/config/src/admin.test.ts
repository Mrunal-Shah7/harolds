// SPRINT-8: admin session is shorter than a kitchen shift; lockout is distinct.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADMIN_DEFAULTS, getAdminConfig } from "./admin";
import { KITCHEN_DEFAULTS } from "./kitchen";

describe("getAdminConfig", () => {
  it("uses a 4-hour session and 15-minute lockout, shorter than kitchen", () => {
    const cfg = getAdminConfig();
    assert.equal(cfg.sessionTtlMs, ADMIN_DEFAULTS.sessionTtlMs);
    assert.equal(cfg.sessionTtlMs, 4 * 60 * 60 * 1000);
    assert.equal(cfg.maxPasswordFailures, 5);
    assert.equal(cfg.passwordLockoutMs, 15 * 60 * 1000);
    assert.ok(cfg.sessionTtlMs < KITCHEN_DEFAULTS.sessionTtlMs);
    assert.ok(cfg.passwordLockoutMs > KITCHEN_DEFAULTS.pinLockoutMs);
  });
});
