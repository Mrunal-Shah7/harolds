// SPRINT-1: idempotent seed — menu from workbook + store configuration
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

// Load root .env before Prisma client / env schema are used
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { prisma } from "../client";
import { invalidateStoreConfigCache } from "../store-config";
import { readWorkbook, slugify, defaultWorkbookPath } from "./workbook";

/** Agreed store configuration values for Harold's Chicken Oak Lawn. */
export const STORE_SEED = {
  id: "default",
  storeName: "Harold's Chicken Oak Lawn",
  // OUTSTANDING: exact street address — placeholder until business confirms
  addressLine1: "TODO: CONFIRM STREET ADDRESS",
  addressLine2: null as string | null,
  city: "Oak Lawn",
  state: "IL",
  // OUTSTANDING: exact postal code
  postalCode: "TODO",
  // OUTSTANDING: exact contact phone
  contactPhone: "TODO: CONFIRM PHONE",
  timezone: "America/Chicago",
  // Known rate 10.10% → 1010 basis points
  taxRateBps: 1010,
  taxAppliedPreDiscount: true,
  orderNumberPrefix: "HC",
  orderNumberStartValue: 1000,
  normalPrepMinutes: 20,
  busyPrepMinutes: 35,
  isBusy: false,
  tippingEnabled: true,
  // 15%, 18%, 20%, 25%
  tipPresetsBps: [1500, 1800, 2000, 2500],
  defaultTipPresetIndex: 1,
  acceptingOrders: true,
  notAcceptingMessage: null as string | null,
} as const;

/**
 * Uniform week hours matching the current ordering-page hours (mid-morning to late evening).
 * Exact per-day hours are an outstanding business input — see SPRINT-1-NOTES.
 */
export const HOURS_SEED: {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}[] = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  openTime: "10:30",
  closeTime: "23:00",
  isClosed: false,
}));

async function seedMenu(workbookPath: string): Promise<void> {
  const data = readWorkbook(workbookPath);

  let placeholderItems = 0;
  let provisionalGroups = 0;

  // 1. Categories
  for (const row of data.categories) {
    const slug = slugify(row.display_name);
    await prisma.category.upsert({
      where: { workbookId: row.category_id },
      create: {
        workbookId: row.category_id,
        name: row.display_name,
        slug,
        sortOrder: row.sort_order,
        isActive: row.active,
      },
      update: {
        name: row.display_name,
        slug,
        sortOrder: row.sort_order,
        isActive: row.active,
      },
    });
  }
  console.log(`categories: upserted ${data.categories.length} rows`);

  // 2. Modifier groups
  for (const row of data.modifier_groups) {
    const isProvisional = row.flag === "PROVISIONAL";
    if (isProvisional) provisionalGroups += 1;
    await prisma.modifierGroup.upsert({
      where: { workbookId: row.group_id },
      create: {
        workbookId: row.group_id,
        name: row.internal_name,
        prompt: row.customer_prompt,
        isRequired: row.required,
        minSelect: row.min_select,
        maxSelect: row.max_select,
        sortOrder: row.sort_order,
        isActive: true,
        isProvisional,
      },
      update: {
        name: row.internal_name,
        prompt: row.customer_prompt,
        isRequired: row.required,
        minSelect: row.min_select,
        maxSelect: row.max_select,
        sortOrder: row.sort_order,
        isActive: true,
        isProvisional,
      },
    });
  }
  console.log(
    `modifier_groups: upserted ${data.modifier_groups.length} rows (${provisionalGroups} provisional)`,
  );

  // 3. Modifier options
  const groupsByWorkbook = Object.fromEntries(
    (await prisma.modifierGroup.findMany()).map((g) => [g.workbookId, g.id]),
  );
  for (const row of data.modifier_options) {
    const groupId = groupsByWorkbook[row.group_id];
    if (!groupId) throw new Error(`Missing group for option ${row.option_id}`);
    await prisma.modifierOption.upsert({
      where: { workbookId: row.option_id },
      create: {
        workbookId: row.option_id,
        groupId,
        name: row.option_name,
        priceDeltaCents: row.price_delta_cents,
        sortOrder: row.sort_order,
        isActive: true,
        isSoldOut: false,
        isDefaultSelected: row.default_selected,
      },
      update: {
        groupId,
        name: row.option_name,
        priceDeltaCents: row.price_delta_cents,
        sortOrder: row.sort_order,
        isActive: true,
        isSoldOut: false,
        isDefaultSelected: row.default_selected,
      },
    });
  }
  console.log(`modifier_options: upserted ${data.modifier_options.length} rows`);

  // 4. Items — sort order derived from row order within each category (workbook has no item sort_order)
  const categoriesByWorkbook = Object.fromEntries(
    (await prisma.category.findMany()).map((c) => [c.workbookId, c.id]),
  );
  const sortByCategory = new Map<string, number>();
  for (const row of data.items) {
    const categoryId = categoriesByWorkbook[row.category_id];
    if (!categoryId) throw new Error(`Missing category for item ${row.item_id}`);
    const nextSort = (sortByCategory.get(row.category_id) ?? 0) + 1;
    sortByCategory.set(row.category_id, nextSort);

    const isUnverifiedPrice = row.flag === "PLACEHOLDER";
    if (isUnverifiedPrice) placeholderItems += 1;

    await prisma.menuItem.upsert({
      where: { workbookId: row.item_id },
      create: {
        workbookId: row.item_id,
        categoryId,
        name: row.display_name,
        boardLabel: row.board_label,
        basePriceCents: row.price_cents,
        imageUrl: null,
        isActive: true,
        isSoldOut: false,
        sortOrder: nextSort,
        isUnverifiedPrice,
      },
      update: {
        categoryId,
        name: row.display_name,
        boardLabel: row.board_label,
        basePriceCents: row.price_cents,
        imageUrl: null,
        isActive: true,
        isSoldOut: false,
        sortOrder: nextSort,
        isUnverifiedPrice,
      },
    });
  }
  console.log(
    `items: upserted ${data.items.length} rows (${placeholderItems} PLACEHOLDER/unverified)`,
  );

  // 5. Item–modifier-group bindings
  const itemsByWorkbook = Object.fromEntries(
    (await prisma.menuItem.findMany()).map((it) => [it.workbookId, it.id]),
  );
  for (const row of data.item_modifier_groups) {
    const itemId = itemsByWorkbook[row.item_id];
    const groupId = groupsByWorkbook[row.group_id];
    if (!itemId || !groupId) {
      throw new Error(`Missing item/group for binding ${row.item_id}+${row.group_id}`);
    }
    await prisma.itemModifierGroup.upsert({
      where: {
        itemId_groupId: { itemId, groupId },
      },
      create: {
        itemId,
        groupId,
        sortOrder: row.sort_order,
      },
      update: {
        sortOrder: row.sort_order,
      },
    });
  }
  console.log(`item_modifier_groups: upserted ${data.item_modifier_groups.length} rows`);
}

async function seedStoreConfig(): Promise<void> {
  const storeCreate = {
    ...STORE_SEED,
    tipPresetsBps: [...STORE_SEED.tipPresetsBps],
  };
  await prisma.storeConfig.upsert({
    where: { id: STORE_SEED.id },
    create: storeCreate,
    update: {
      storeName: STORE_SEED.storeName,
      addressLine1: STORE_SEED.addressLine1,
      addressLine2: STORE_SEED.addressLine2,
      city: STORE_SEED.city,
      state: STORE_SEED.state,
      postalCode: STORE_SEED.postalCode,
      contactPhone: STORE_SEED.contactPhone,
      timezone: STORE_SEED.timezone,
      taxRateBps: STORE_SEED.taxRateBps,
      taxAppliedPreDiscount: STORE_SEED.taxAppliedPreDiscount,
      orderNumberPrefix: STORE_SEED.orderNumberPrefix,
      orderNumberStartValue: STORE_SEED.orderNumberStartValue,
      normalPrepMinutes: STORE_SEED.normalPrepMinutes,
      busyPrepMinutes: STORE_SEED.busyPrepMinutes,
      isBusy: STORE_SEED.isBusy,
      tippingEnabled: STORE_SEED.tippingEnabled,
      tipPresetsBps: [...STORE_SEED.tipPresetsBps],
      defaultTipPresetIndex: STORE_SEED.defaultTipPresetIndex,
      acceptingOrders: STORE_SEED.acceptingOrders,
      notAcceptingMessage: STORE_SEED.notAcceptingMessage,
    },
  });
  console.log("store_config: upserted singleton row");

  for (const hours of HOURS_SEED) {
    await prisma.storeHours.upsert({
      where: { dayOfWeek: hours.dayOfWeek },
      create: hours,
      update: {
        openTime: hours.openTime,
        closeTime: hours.closeTime,
        isClosed: hours.isClosed,
      },
    });
  }
  console.log(`store_hours: upserted ${HOURS_SEED.length} rows`);

  // No closure dates in Sprint 1
  const closureCount = await prisma.storeClosure.count();
  console.log(`store_closures: left as-is (count=${closureCount}; seed inserts none)`);

  // Counter: initialise to start value only if missing; do not reset on reseed (would renumber live orders).
  // On first seed create with start value. On reseed, leave currentValue unchanged.
  await prisma.orderNumberCounter.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      currentValue: STORE_SEED.orderNumberStartValue,
    },
    update: {},
  });
  const counter = await prisma.orderNumberCounter.findUniqueOrThrow({ where: { id: "default" } });
  console.log(`order_number_counter: currentValue=${counter.currentValue}`);

  invalidateStoreConfigCache();
}

async function main(): Promise<void> {
  const workbookPath = process.env.WORKBOOK_PATH ?? defaultWorkbookPath();
  console.log(`Seeding from ${workbookPath}`);
  await seedMenu(workbookPath);
  await seedStoreConfig();
  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
