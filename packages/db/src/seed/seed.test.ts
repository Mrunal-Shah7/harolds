// SPRINT-11: production seed guards — test accounts never land on production; config is insert-if-absent.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "../client";
import { describeSeedRefusal, parseSeedArgs, seedStoreConfigIfAbsent, STORE_SEED } from "./run";
import { invalidateStoreConfigCache } from "../store-config";

describe("seed guards", () => {
  it("refuses test accounts in production with a clear message", () => {
    const message = describeSeedRefusal({
      target: "accounts",
      nodeEnv: "production",
      orderCount: 0,
      allowExistingOrders: false,
    });
    assert.ok(message);
    assert.match(message, /Refusing to create, update, or reactivate test accounts/);
    assert.match(message, /production/);
    assert.match(message, /db:seed:menu/);
  });

  it("refuses the combined seed in production even on an empty database", () => {
    const message = describeSeedRefusal({
      target: "all",
      nodeEnv: "production",
      orderCount: 0,
      allowExistingOrders: true,
    });
    assert.ok(message);
    assert.match(message, /test accounts/);
  });

  it("allows the menu seed in production when the database has no orders", () => {
    const message = describeSeedRefusal({
      target: "menu",
      nodeEnv: "production",
      orderCount: 0,
      allowExistingOrders: false,
    });
    assert.equal(message, null);
  });

  it("refuses any seed against a database with orders unless the override flag is set", () => {
    const blocked = describeSeedRefusal({
      target: "menu",
      nodeEnv: "development",
      orderCount: 3,
      allowExistingOrders: false,
    });
    assert.ok(blocked);
    assert.match(blocked, /--allow-existing-orders/);
    const allowed = describeSeedRefusal({
      target: "menu",
      nodeEnv: "development",
      orderCount: 3,
      allowExistingOrders: true,
    });
    assert.equal(allowed, null);
  });

  it("the override flag still cannot create test accounts in production", () => {
    const message = describeSeedRefusal({
      target: "accounts",
      nodeEnv: "production",
      orderCount: 12,
      allowExistingOrders: true,
    });
    assert.ok(message);
    assert.match(message, /production/);
  });

  it("development still seeds accounts on a fresh database", () => {
    const message = describeSeedRefusal({
      target: "all",
      nodeEnv: "development",
      orderCount: 0,
      allowExistingOrders: false,
    });
    assert.equal(message, null);
  });
});

describe("parseSeedArgs", () => {
  it("splits menu and accounts via flags", () => {
    assert.equal(parseSeedArgs(["--menu-only"], { NODE_ENV: "development" }).target, "menu");
    assert.equal(parseSeedArgs(["--accounts-only"], { NODE_ENV: "development" }).target, "accounts");
    assert.equal(parseSeedArgs([], { NODE_ENV: "development" }).target, "all");
  });

  it("reads the existing-orders override from argv or env", () => {
    assert.equal(parseSeedArgs(["--allow-existing-orders"], {}).allowExistingOrders, true);
    assert.equal(parseSeedArgs([], { SEED_ALLOW_EXISTING_ORDERS: "1" }).allowExistingOrders, true);
    assert.equal(parseSeedArgs([], {}).allowExistingOrders, false);
  });
});

describe("store seed placeholders", () => {
  it("still documents the unsendable manager destinations used by production startup checks", () => {
    assert.equal(STORE_SEED.managerAlertPhone, "TODO: SET MANAGER ALERT PHONE");
    assert.equal(STORE_SEED.managerAlertEmail, "todo-manager-alerts@localhost");
  });
});

describe("store config insert-if-absent", () => {
  it("does not overwrite an edited contact phone or tip preset", async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      return;
    }
    const before = await prisma.storeConfig.findUnique({ where: { id: STORE_SEED.id } });
    if (!before) return;
    await prisma.storeConfig.update({
      where: { id: STORE_SEED.id },
      data: { contactPhone: "S11-GUARD-TEST", defaultTipPresetIndex: 0 },
    });
    try {
      await seedStoreConfigIfAbsent();
      const after = await prisma.storeConfig.findUniqueOrThrow({ where: { id: STORE_SEED.id } });
      assert.equal(after.contactPhone, "S11-GUARD-TEST");
      assert.equal(after.defaultTipPresetIndex, 0);
    } finally {
      await prisma.storeConfig.update({
        where: { id: STORE_SEED.id },
        data: {
          contactPhone: before.contactPhone,
          defaultTipPresetIndex: before.defaultTipPresetIndex,
        },
      });
      invalidateStoreConfigCache();
    }
  });
});
