// SPRINT-2: export seeded menu/store payloads into packages/mock-api/fixtures for the offline mock.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import type {
  CategoriesPayload,
  CuratedItemsPayload,
  FullMenu,
  MenuItemSummary,
  MenuItemWithModifiers,
  StoreStatus,
} from "@harolds/types";
import { prisma } from "./client";
import {
  getCategories,
  getFeaturedItems,
  getFullMenu,
  getMostOrderedItems,
} from "./repositories/menu";
import { getStoreStatus } from "./repositories/store";

const fixturesDir = path.join(rootDir, "packages/mock-api/fixtures");

type FixtureMeta = {
  generatedAt: string;
  notes: string[];
  edgeCases: {
    soldOutItemId: string;
    soldOutItemName: string;
    soldOutOptionId: string;
    soldOutOptionName: string;
    requiredGroupId: string;
    requiredGroupPrompt: string;
    optionalMultiSelectGroupId: string;
    optionalMultiSelectGroupPrompt: string;
    optionalMultiSelectMax: number;
    pricedOptionId: string;
    pricedOptionName: string;
    pricedOptionDeltaCents: number;
    itemWithNoModifiersId: string;
    itemWithNoModifiersName: string;
    longestItemNameId: string;
    longestItemName: string;
    longestItemNameLength: number;
    singleItemCategory: {
      present: boolean;
      categoryId: string | null;
      categoryName: string | null;
      note: string;
    };
  };
};

function allItems(menu: FullMenu): MenuItemWithModifiers[] {
  return menu.categories.flatMap((c) => c.items);
}

function applyEdgeCaseMutations(menu: FullMenu): FixtureMeta["edgeCases"] {
  const items = allItems(menu);
  if (items.length === 0) {
    throw new Error("Cannot export fixtures: menu has no items");
  }

  // Prefer an item without modifiers for sold-out item so sold-out option can live elsewhere.
  const soldOutItem =
    items.find((i) => i.modifierGroups.length === 0) ?? items[0]!;
  soldOutItem.isSoldOut = true;

  const itemWithOption = items.find((i) =>
    i.modifierGroups.some((g) => g.options.length > 0),
  );
  if (!itemWithOption) {
    throw new Error("Cannot export fixtures: no modifier options found");
  }
  const groupWithOption = itemWithOption.modifierGroups.find((g) => g.options.length > 0)!;
  const soldOutOption = groupWithOption.options[0]!;
  // Propagate sold-out across every embedded copy of this option id.
  for (const item of items) {
    for (const g of item.modifierGroups) {
      for (const o of g.options) {
        if (o.id === soldOutOption.id) o.isSoldOut = true;
      }
    }
  }

  // Seed has no required groups — invent one for fixture-only storefront edge coverage.
  // Prefer a single-select group so mg_toppings can remain the optional multi-select case.
  const allGroups = items.flatMap((i) => i.modifierGroups);
  const requiredGroup =
    allGroups.find((g) => g.options.length > 0 && g.maxSelect === 1 && !g.isRequired) ??
    allGroups.find((g) => g.options.length > 0 && !g.isRequired) ??
    allGroups[0];
  if (!requiredGroup) {
    throw new Error("Cannot export fixtures: no modifier groups found");
  }
  // Propagate the same required flag to every binding of this group id across the menu.
  for (const item of items) {
    for (const g of item.modifierGroups) {
      if (g.id === requiredGroup.id) {
        g.isRequired = true;
        if (g.minSelect < 1) g.minSelect = 1;
      }
    }
  }

  const optionalMulti = allGroups.find(
    (g) => g.id !== requiredGroup.id && g.maxSelect > 1 && !g.isRequired,
  );
  if (!optionalMulti) {
    throw new Error(
      "Cannot export fixtures: expected an optional multi-select group (mg_toppings max 3)",
    );
  }

  const priced = items
    .flatMap((i) => i.modifierGroups)
    .flatMap((g) => g.options)
    .find((o) => o.priceDeltaCents > 0);
  if (!priced) {
    throw new Error("Cannot export fixtures: expected a priced modifier option (Add Fries)");
  }

  const noMods = items.find((i) => i.modifierGroups.length === 0);
  if (!noMods) {
    throw new Error("Cannot export fixtures: expected items with no modifier groups");
  }

  const longest = items.reduce((a, b) => (a.name.length >= b.name.length ? a : b));

  const singleCat = menu.categories.find((c) => c.items.length === 1);

  return {
    soldOutItemId: soldOutItem.id,
    soldOutItemName: soldOutItem.name,
    soldOutOptionId: soldOutOption.id,
    soldOutOptionName: soldOutOption.name,
    requiredGroupId: requiredGroup.id,
    requiredGroupPrompt: requiredGroup.prompt,
    optionalMultiSelectGroupId: optionalMulti.id,
    optionalMultiSelectGroupPrompt: optionalMulti.prompt,
    optionalMultiSelectMax: optionalMulti.maxSelect,
    pricedOptionId: priced.id,
    pricedOptionName: priced.name,
    pricedOptionDeltaCents: priced.priceDeltaCents,
    itemWithNoModifiersId: noMods.id,
    itemWithNoModifiersName: noMods.name,
    longestItemNameId: longest.id,
    longestItemName: longest.name,
    longestItemNameLength: longest.name.length,
    singleItemCategory: singleCat
      ? {
          present: true,
          categoryId: singleCat.id,
          categoryName: singleCat.name,
          note: "Category currently has exactly one active item.",
        }
      : {
          present: false,
          categoryId: null,
          categoryName: null,
          note:
            "Seeded catalogue has no single-item category (minimum 2 items per category after seed). Storefront should still handle the case.",
        },
  };
}

function syncCuratedFlags(
  curated: MenuItemSummary[],
  menu: FullMenu,
): MenuItemSummary[] {
  const byId = new Map(allItems(menu).map((i) => [i.id, i]));
  return curated.map((item) => {
    const live = byId.get(item.id);
    if (!live) return item;
    return {
      ...item,
      isSoldOut: live.isSoldOut,
      isFeatured: live.isFeatured,
      isMostOrdered: live.isMostOrdered,
    };
  });
}

async function writeJson(fileName: string, value: unknown): Promise<void> {
  const target = path.join(fixturesDir, fileName);
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`wrote ${path.relative(rootDir, target)}`);
}

async function main(): Promise<void> {
  await mkdir(fixturesDir, { recursive: true });

  const [menu, storeStatus, categories, featured, mostOrdered] = await Promise.all([
    getFullMenu(),
    getStoreStatus(),
    getCategories(),
    getFeaturedItems(),
    getMostOrderedItems(),
  ]);

  const edgeCases = applyEdgeCaseMutations(menu);
  const featuredSynced = syncCuratedFlags(featured, menu);
  const mostOrderedSynced = syncCuratedFlags(mostOrdered, menu);

  const categoriesPayload: CategoriesPayload = { categories };
  const featuredPayload: CuratedItemsPayload = { items: featuredSynced };
  const mostOrderedPayload: CuratedItemsPayload = { items: mostOrderedSynced };

  const meta: FixtureMeta = {
    generatedAt: new Date().toISOString(),
    notes: [
      "Fixtures exported from a seeded database then mutated in-memory for storefront edge cases.",
      "isRequired=true on one modifier group is fixture-only (seed has no required groups).",
      "No DATABASE_URL is required to run @harolds/mock-api — it reads these JSON files only.",
    ],
    edgeCases,
  };

  await writeJson("menu.json", menu satisfies FullMenu);
  await writeJson("store-status.json", storeStatus satisfies StoreStatus);
  await writeJson("categories.json", categoriesPayload);
  await writeJson("featured.json", featuredPayload);
  await writeJson("most-ordered.json", mostOrderedPayload);
  await writeJson("meta.json", meta);

  // SPRINT-3: board labels are not on the public menu contract, but quote snapshots need them.
  // Export a side map so the mock pricing catalog matches the real API snapshots.
  const boardRows = await prisma.menuItem.findMany({
    select: { id: true, boardLabel: true },
  });
  const boardLabels: Record<string, string | null> = {};
  for (const row of boardRows) boardLabels[row.id] = row.boardLabel;
  await writeJson("board-labels.json", boardLabels);

  // SPRINT-4: internal modifier group names are not on the public menu contract (prompt only).
  // Side fixture so mock quote/order snapshots match the real API when name ≠ prompt.
  const groupRows = await prisma.modifierGroup.findMany({
    select: { id: true, name: true },
  });
  const groupNames: Record<string, string> = {};
  for (const row of groupRows) groupNames[row.id] = row.name;
  await writeJson("group-names.json", groupNames);

  console.log("edge cases:", JSON.stringify(edgeCases, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
