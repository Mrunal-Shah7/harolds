// SPRINT-11: production seed guards — test accounts never land on production; config is insert-if-absent.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "../client";
import {
  describeBranchRefusal,
  describeSeedRefusal,
  parseSeedArgs,
  seedStoreConfigIfAbsent,
  STORE_SEED,
} from "./run";
import { readWorkbook, workbookPathForBranch } from "./workbook";
import { parseAdminAccounts, readAdminAccounts } from "./admin-accounts";
import { invalidateStoreConfigCache } from "../store-config";

describe("seed guards", () => {
  it("refuses test accounts in production with a clear message", () => {
    const message = describeSeedRefusal({
      target: "test-accounts",
      nodeEnv: "production",
      orderCount: 0,
      allowExistingOrders: false,
    });
    assert.ok(message);
    assert.match(message, /Refusing to create, update, or reactivate test accounts/);
    assert.match(message, /production/);
    assert.match(message, /db:seed:menu/);
  });

  it("allows the combined seed (menu + real accounts) in production on an empty database", () => {
    const message = describeSeedRefusal({
      target: "all",
      nodeEnv: "production",
      orderCount: 0,
      allowExistingOrders: false,
    });
    assert.equal(message, null);
  });

  it("allows the real accounts seed in production, even once orders exist", () => {
    for (const orderCount of [0, 12]) {
      assert.equal(
        describeSeedRefusal({ target: "accounts", nodeEnv: "production", orderCount, allowExistingOrders: false }),
        null,
      );
    }
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
      target: "test-accounts",
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
    assert.equal(parseSeedArgs(["--test-accounts-only"], { NODE_ENV: "development" }).target, "test-accounts");
    assert.equal(parseSeedArgs([], { NODE_ENV: "development" }).target, "all");
  });

  it("reads the existing-orders override from argv or env", () => {
    assert.equal(parseSeedArgs(["--allow-existing-orders"], {}).allowExistingOrders, true);
    assert.equal(parseSeedArgs([], { SEED_ALLOW_EXISTING_ORDERS: "1" }).allowExistingOrders, true);
    assert.equal(parseSeedArgs([], {}).allowExistingOrders, false);
  });

  it("reads the branch a per-branch script was written for", () => {
    assert.equal(parseSeedArgs(["--menu-only", "--branch=Zion"], {}).branch, "Zion");
    assert.equal(parseSeedArgs(["--menu-only"], {}).branch, undefined);
  });
});

describe("real back-office accounts file", () => {
  const good = { email: " Owner@Example.com ", password: "Str0ng-enough", displayName: "Owner", role: "owner" };

  it("accepts a valid file and normalises email and role", () => {
    const { accounts, problems } = parseAdminAccounts({ accounts: [good] });
    assert.deepEqual(problems, []);
    assert.equal(accounts[0]?.email, "owner@example.com");
    assert.equal(accounts[0]?.role, "OWNER");
  });

  it("rejects a password the back office would reject, naming the account but never the password", () => {
    const { accounts, problems } = parseAdminAccounts({ accounts: [{ ...good, password: "Sh@61" }] });
    assert.equal(accounts.length, 0, "nothing is seeded when any row is bad");
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? "", /owner@example\.com.*at least 8 characters/);
    assert.doesNotMatch(problems[0] ?? "", /Sh@61/);
  });

  it("reports every problem at once: bad email, duplicate, missing name, unknown role", () => {
    const { problems } = parseAdminAccounts({
      accounts: [good, { ...good }, { ...good, email: "not-an-email" }, { ...good, email: "b@x.com", displayName: "", role: "BOSS" }],
    });
    assert.ok(problems.some((p) => /listed twice/.test(p)));
    assert.ok(problems.some((p) => /not an email/.test(p)));
    assert.ok(problems.some((p) => /displayName/.test(p)));
    assert.ok(problems.some((p) => /role/.test(p)));
  });

  it("explains a missing file instead of seeding nothing silently", () => {
    const { problems } = readAdminAccounts(path.join(path.dirname(fileURLToPath(import.meta.url)), "no-such-accounts.json"));
    assert.match(problems.join(" "), /seed-accounts\.example\.json/);
  });
});

describe("per-branch menu seeding", () => {
  it("refuses another branch's script, and allows its own (case-insensitive) or none", () => {
    assert.match(describeBranchRefusal("Zion", "Burnham") ?? "", /for branch "Zion", but STORE_BRANCH_NAME is "Burnham"/);
    assert.match(describeBranchRefusal("Burnham", "Zion") ?? "", /Refusing to seed/);
    assert.equal(describeBranchRefusal("zion", "Zion"), null);
    assert.equal(describeBranchRefusal(undefined, "Zion"), null);
  });

  it("gives each branch its own workbook, and every committed one parses", () => {
    for (const branch of ["Burnham", "Zion"]) {
      const file = workbookPathForBranch(branch);
      assert.ok(file.endsWith(path.join("docs", "menus", `harolds-${branch.toLowerCase()}-menu.xlsx`)));
      const data = readWorkbook(file);
      assert.ok(data.items.length > 0, `${branch} workbook has items`);
    }
    assert.notEqual(workbookPathForBranch("Burnham"), workbookPathForBranch("Zion"));
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
