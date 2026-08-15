// SPRINT-8: store config tax is owner-only; accepting-orders and hours invalidate public caches.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { AdminRole } from "@harolds/types";
import { prisma } from "./client";
import { getStoreConfig } from "./store-config";
import { getStoreStatus } from "./repositories/store";
import { AdminForbiddenError } from "./admin-auth";
import { updateStoreConfig, upsertStoreHours, createStoreClosure, deleteStoreClosure } from "./admin-store";

let dbAvailable = true;
let ACTOR = "";

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const owner = await prisma.adminUser.findUnique({ where: { email: "test-owner@localhost" } });
    ACTOR = owner?.id ?? "";
  } catch (err) {
    dbAvailable = false;
    console.warn(`[admin-store.test] skipping: ${(err as Error).message}`);
  }
});

after(async () => {
  if (!dbAvailable) return;
  await prisma.storeConfig.update({
    where: { id: "default" },
    data: { acceptingOrders: true, isBusy: false, taxRateBps: 1010 },
  });
  await prisma.storeClosure.deleteMany({ where: { date: { gte: new Date("2099-01-01T00:00:00.000Z") } } });
});

describe("store config mutations", () => {
  it("rejects tax edits from a manager and accepts them from an owner", async () => {
    if (!dbAvailable || !ACTOR) return;
    await assert.rejects(
      () => updateStoreConfig({ taxRateBps: 1020 }, { userId: ACTOR, role: AdminRole.MANAGER }),
      AdminForbiddenError,
    );
    const before = await getStoreConfig();
    await updateStoreConfig({ taxRateBps: 1010 }, { userId: ACTOR, role: AdminRole.OWNER });
    const after = await getStoreConfig();
    assert.equal(after.taxRateBps, 1010);
    assert.equal(before.taxRateBps, 1010);
  });

  it("toggles accepting-orders and reflects on store status immediately", async () => {
    if (!dbAvailable || !ACTOR) return;
    await updateStoreConfig({ acceptingOrders: false }, { userId: ACTOR, role: AdminRole.MANAGER });
    const off = await getStoreStatus();
    assert.equal(off.acceptingOrders, false);
    await updateStoreConfig({ acceptingOrders: true }, { userId: ACTOR, role: AdminRole.MANAGER });
    const on = await getStoreStatus();
    assert.equal(on.acceptingOrders, true);
  });

  it("a closure date closes the store regardless of weekly hours", async () => {
    if (!dbAvailable || !ACTOR) return;
    const date = "2099-12-26";
    await prisma.storeClosure.deleteMany({ where: { date: new Date("2099-12-26T00:00:00.000Z") } });
    const row = await createStoreClosure(date, "test closure", ACTOR);
    const status = await getStoreStatus(new Date("2099-12-26T18:00:00.000Z"));
    assert.equal(status.isOpen, false);
    await deleteStoreClosure(row.id, ACTOR);
  });

  it("changing busy prep updates estimated ready minutes", async () => {
    if (!dbAvailable || !ACTOR) return;
    await updateStoreConfig({ isBusy: true }, { userId: ACTOR, role: AdminRole.MANAGER });
    const busy = await getStoreStatus();
    await updateStoreConfig({ isBusy: false }, { userId: ACTOR, role: AdminRole.MANAGER });
    const normal = await getStoreStatus();
    assert.ok(busy.prepMinutes > normal.prepMinutes);
  });
});

describe("hours", () => {
  it("round-trips seven rows", async () => {
    if (!dbAvailable || !ACTOR) return;
    const current = await prisma.storeHours.findMany({ orderBy: { dayOfWeek: "asc" } });
    await upsertStoreHours(
      current.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime,
        closeTime: h.closeTime,
        isClosed: h.isClosed,
      })),
      ACTOR,
    );
    const again = await prisma.storeHours.findMany({ orderBy: { dayOfWeek: "asc" } });
    assert.equal(again.length, 7);
  });
});
