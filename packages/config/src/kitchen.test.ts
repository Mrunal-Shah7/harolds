// SPRINT-6: kitchen config defaults
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getKitchenConfig, KITCHEN_DEFAULTS } from "./kitchen";

describe("getKitchenConfig", () => {
  it("returns shift-length session and documented alert thresholds", () => {
    const cfg = getKitchenConfig();
    assert.equal(cfg.sessionTtlMs, KITCHEN_DEFAULTS.sessionTtlMs);
    assert.equal(cfg.maxPinFailures, 5);
    assert.equal(cfg.pinLockoutMs, 5 * 60 * 1000);
    assert.equal(cfg.pollIntervalMs, 3_000);
    assert.equal(cfg.unackScreenMs, 60_000);
    assert.equal(cfg.unackSoundMs, 120_000);
    assert.equal(cfg.unackAlertMs, 180_000);
    assert.ok(cfg.unackScreenMs < cfg.unackSoundMs);
    assert.ok(cfg.unackSoundMs < cfg.unackAlertMs);
  });
});
