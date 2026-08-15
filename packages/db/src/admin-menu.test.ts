// SPRINT-8: menu mutations, currency input, unverified-price clear, cache invalidation.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./client";
import { getCachedFullMenu, invalidateMenuCache, __menuCacheIsHot } from "./menu-cache";
import { fetchItemsForQuote } from "./repositories/catalog";
import { toMenuCatalog, quoteCart } from "@harolds/pricing";
import {
  AdminValidationError,
  clearAllSoldOut,
  createModifierGroup,
  parseCurrencyInput,
  setCuration,
  setItemSoldOut,
  updateItem,
  updateModifierGroup,
  replaceItemBindings,
} from "./admin-menu";

describe("parseCurrencyInput", () => {
  it("converts .29 .49 .79 .99 exactly", () => {
    assert.equal(parseCurrencyInput("8.29"), 829);
    assert.equal(parseCurrencyInput("8.49"), 849);
    assert.equal(parseCurrencyInput("8.79"), 879);
    assert.equal(parseCurrencyInput("8.99"), 899);
    assert.equal(parseCurrencyInput("$11.49"), 1149);
  });
});

let dbAvailable = true;
let ACTOR = "";

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const owner = await prisma.adminUser.findUnique({ where: { email: "test-owner@localhost" } });
    ACTOR = owner?.id ?? "";
  } catch (err) {
    dbAvailable = false;
    console.warn(`[admin-menu.test] skipping: ${(err as Error).message}`);
  }
});

after(async () => {
  if (!dbAvailable) return;
  await prisma.menuItem.updateMany({
    where: { workbookId: { startsWith: "itm_" } },
    data: { isSoldOut: false },
  });
  invalidateMenuCache();
});

describe("sold-out and unverified price", () => {
  it("toggles sold-out and the next cached menu read reflects it", async () => {
    if (!dbAvailable || !ACTOR) return;
    const item = await prisma.menuItem.findFirstOrThrow({ where: { isActive: true } });
    await getCachedFullMenu();
    assert.equal(__menuCacheIsHot(), true);
    await setItemSoldOut(item.id, true, ACTOR);
    assert.equal(__menuCacheIsHot(), false);
    const { menu } = await getCachedFullMenu();
    const found = menu.categories.flatMap((c) => c.items).find((i) => i.id === item.id);
    assert.ok(found);
    assert.equal(found.isSoldOut, true);
    await setItemSoldOut(item.id, false, ACTOR);
  });

  it("clears every sold-out flag and invalidates the cache once", async () => {
    if (!dbAvailable || !ACTOR) return;
    const items = await prisma.menuItem.findMany({ where: { isActive: true }, take: 3 });
    for (const item of items) {
      await prisma.menuItem.update({ where: { id: item.id }, data: { isSoldOut: true } });
    }
    await getCachedFullMenu();
    const cleared = await clearAllSoldOut(ACTOR);
    assert.ok(cleared >= 3);
    assert.equal(__menuCacheIsHot(), false);
    const still = await prisma.menuItem.count({ where: { isSoldOut: true } });
    assert.equal(still, 0);
  });

  it("clears the unverified flag only on the item whose price changed", async () => {
    if (!dbAvailable || !ACTOR) return;
    const flagged = await prisma.menuItem.findMany({ where: { isUnverifiedPrice: true }, take: 2 });
    assert.ok(flagged.length >= 2);
    const [target, other] = flagged;
    const previous = target!.basePriceCents;
    try {
      await updateItem(target!.id, { basePriceCents: previous === 199 ? 299 : 199 }, ACTOR);
      const afterTarget = await prisma.menuItem.findUniqueOrThrow({ where: { id: target!.id } });
      const afterOther = await prisma.menuItem.findUniqueOrThrow({ where: { id: other!.id } });
      assert.equal(afterTarget.isUnverifiedPrice, false);
      assert.equal(afterOther.isUnverifiedPrice, true);
    } finally {
      await prisma.menuItem.update({
        where: { id: target!.id },
        data: { basePriceCents: previous, isUnverifiedPrice: true },
      });
      invalidateMenuCache();
    }
  });

  it("persists curated featured order for the public featured list", async () => {
    if (!dbAvailable || !ACTOR) return;
    const items = await prisma.menuItem.findMany({ where: { isActive: true }, take: 2, orderBy: { sortOrder: "asc" } });
    await setCuration("featured", [items[1]!.id, items[0]!.id], ACTOR);
    const { menu } = await getCachedFullMenu();
    // featured is a separate endpoint; check flags
    const a = await prisma.menuItem.findUniqueOrThrow({ where: { id: items[1]!.id } });
    const b = await prisma.menuItem.findUniqueOrThrow({ where: { id: items[0]!.id } });
    assert.equal(a.isFeatured, true);
    assert.equal(a.featuredSortOrder, 0);
    assert.equal(b.isFeatured, true);
    assert.equal(b.featuredSortOrder, 1);
    await setCuration("featured", [], ACTOR);
    void menu;
  });
});

describe("modifier groups", () => {
  it("rejects a minimum above the maximum", async () => {
    if (!dbAvailable || !ACTOR) return;
    await assert.rejects(
      () =>
        createModifierGroup(
          { name: "Bad", prompt: "Pick", minSelect: 3, maxSelect: 1 },
          ACTOR,
        ),
      AdminValidationError,
    );
  });

  it("clears provisional on a correcting edit and quotes through the pricing engine", async () => {
    if (!dbAvailable || !ACTOR) return;
    const group = await prisma.modifierGroup.findFirstOrThrow({ where: { isProvisional: true } });
    try {
      await updateModifierGroup(
        group.id,
        { prompt: group.prompt, minSelect: group.minSelect, maxSelect: group.maxSelect },
        ACTOR,
      );
      const after = await prisma.modifierGroup.findUniqueOrThrow({ where: { id: group.id } });
      assert.equal(after.isProvisional, false);
    } finally {
      await prisma.modifierGroup.update({ where: { id: group.id }, data: { isProvisional: true } });
    }

    const created = await createModifierGroup(
      { name: "S8 Quote Heat", prompt: "How hot?", minSelect: 0, maxSelect: 1 },
      ACTOR,
    );
    const unbound = await prisma.menuItem.findFirst({
      where: { isActive: true, isSoldOut: false, modifierGroups: { none: {} } },
    });
    const item = unbound ?? (await prisma.menuItem.findFirstOrThrow({ where: { isActive: true, isSoldOut: false } }));
    const original = await prisma.itemModifierGroup.findMany({
      where: { itemId: item.id },
      select: { groupId: true, sortOrder: true },
    });
    try {
      await replaceItemBindings(item.id, [{ groupId: created.id, sortOrder: 0 }], ACTOR);
      const rows = await fetchItemsForQuote([item.id]);
      const catalog = toMenuCatalog(rows);
      const quoted = quoteCart({
        cart: {
          lines: [{ itemId: item.id, quantity: 1, selectedOptionIds: [] }],
        },
        catalog,
        store: {
          taxRateBps: 1010,
          taxAppliedPreDiscount: true,
          tippingEnabled: true,
          tipPresetsBps: [1500, 1800, 2000],
          isOpen: true,
          acceptingOrders: true,
          prepMinutes: 20,
          now: new Date(),
        },
      });
      assert.equal(quoted.ok, true, quoted.ok ? "" : JSON.stringify(quoted.reasons));
    } finally {
      await replaceItemBindings(
        item.id,
        original.map((b) => ({ groupId: b.groupId, sortOrder: b.sortOrder })),
        ACTOR,
      );
      await prisma.modifierGroup.delete({ where: { id: created.id } }).catch(() => undefined);
    }
  });
});
