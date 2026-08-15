// SPRINT-5: multi-serial printer config
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPrinterConfig } from "./printers";

describe("getPrinterConfig", () => {
  it("exposes the configured serial and treats one device as both targets", () => {
    const cfg = getPrinterConfig();
    assert.ok(cfg.serials.includes(cfg.kitchenSerial));
    assert.ok(cfg.serials.includes(cfg.counterSerial));
    assert.ok(cfg.sharedSecret.length > 0);
    assert.equal(cfg.sentTimeoutMs, 90_000);
    assert.equal(cfg.maxAttempts, 5);
    assert.equal(cfg.retryBackoffMs, 30_000);
    assert.equal(cfg.unacknowledgedOrderMs, 120_000);
  });
});
