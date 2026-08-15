// SPRINT-11: seed runners — menu and accounts are separate; production cannot restore test logins.
import { prisma } from "../client";
import { invalidateStoreConfigCache } from "../store-config";
import { readWorkbook, slugify, defaultWorkbookPath } from "./workbook";
import { hashPin } from "../pin";
import { hashPassword } from "../password";
import { AdminRole } from "@harolds/types";

/** Agreed store configuration values for Harold's Chicken Oak Lawn. */
export const STORE_SEED = {
  id: "default",
  storeName: "Harold's Chicken Oak Lawn",
  addressLine1: "4709 W 95th St",
  addressLine2: null as string | null,
  city: "Oak Lawn",
  state: "IL",
  postalCode: "60453-2515",
  contactPhone: "TODO: CONFIRM PHONE",
  timezone: "America/Chicago",
  taxRateBps: 1010,
  taxAppliedPreDiscount: true,
  orderNumberPrefix: "HC-",
  orderNumberStartValue: 1,
  orderNumberResetHour: 5,
  orderNumberPadWidth: 3,
  normalPrepMinutes: 20,
  busyPrepMinutes: 35,
  isBusy: false,
  tippingEnabled: true,
  tipPresetsBps: [1500, 1800, 2000, 2500],
  defaultTipPresetIndex: 1,
  acceptingOrders: true,
  notAcceptingMessage: null as string | null,
  managerAlertPhone: "TODO: SET MANAGER ALERT PHONE",
  managerAlertEmail: "todo-manager-alerts@localhost",
} as const;

export const PLACEHOLDER_MANAGER_ALERT_PHONE = STORE_SEED.managerAlertPhone;
export const PLACEHOLDER_MANAGER_ALERT_EMAIL = STORE_SEED.managerAlertEmail;

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

export const TEST_STAFF_PIN = "2468";
export const TEST_MANAGER_PIN = "1357";
export const TEST_OWNER_PIN = "9753";
export const TEST_STAFF_PASSWORD = "HaroldsStaff1!";
export const TEST_MANAGER_PASSWORD = "HaroldsManager1!";
export const TEST_OWNER_PASSWORD = "HaroldsOwner1!";

const TEST_STAFF = [
  {
    email: "test-staff@localhost",
    displayName: "Test Staff",
    role: AdminRole.STAFF,
    pin: TEST_STAFF_PIN,
    password: TEST_STAFF_PASSWORD,
  },
  {
    email: "test-manager@localhost",
    displayName: "Test Manager",
    role: AdminRole.MANAGER,
    pin: TEST_MANAGER_PIN,
    password: TEST_MANAGER_PASSWORD,
  },
  {
    email: "test-owner@localhost",
    displayName: "Test Owner",
    role: AdminRole.OWNER,
    pin: TEST_OWNER_PIN,
    password: TEST_OWNER_PASSWORD,
  },
] as const;

export type SeedTarget = "all" | "menu" | "accounts";

export type SeedArgs = {
  target: SeedTarget;
  nodeEnv: string;
  allowExistingOrders: boolean;
  workbookPath?: string;
};

/**
 * Guard that must run before any write. Returns a refusal message or null to proceed.
 * Production never touches test accounts. A database with orders needs an explicit override.
 */
export function describeSeedRefusal(args: {
  target: SeedTarget;
  nodeEnv: string;
  orderCount: number;
  allowExistingOrders: boolean;
}): string | null {
  const wantsAccounts = args.target === "all" || args.target === "accounts";
  if (wantsAccounts && args.nodeEnv === "production") {
    return [
      "Refusing to create, update, or reactivate test accounts against a production database.",
      "Test logins (test-staff@localhost, test-manager@localhost, test-owner@localhost) must not exist in production.",
      "To correct catalogue data, run the menu seed only: pnpm db:seed:menu",
    ].join("\n");
  }
  if (args.orderCount > 0 && !args.allowExistingOrders) {
    return [
      `Refusing to seed a database that already contains ${args.orderCount} order(s).`,
      "Pass --allow-existing-orders (or SEED_ALLOW_EXISTING_ORDERS=1) if you intend to run against this database.",
      "That flag does not permit test accounts in production.",
    ].join("\n");
  }
  return null;
}

export function parseSeedArgs(argv: string[], env: NodeJS.ProcessEnv): SeedArgs {
  const allowExistingOrders =
    argv.includes("--allow-existing-orders") ||
    env.SEED_ALLOW_EXISTING_ORDERS === "1" ||
    env.SEED_ALLOW_EXISTING_ORDERS === "true";
  let target: SeedTarget = "all";
  if (argv.includes("--menu-only")) target = "menu";
  if (argv.includes("--accounts-only")) target = "accounts";
  return {
    target,
    nodeEnv: env.NODE_ENV ?? "development",
    allowExistingOrders,
    workbookPath: env.WORKBOOK_PATH,
  };
}

export async function seedMenu(workbookPath: string): Promise<void> {
  const data = readWorkbook(workbookPath);

  let placeholderItems = 0;
  let provisionalGroups = 0;

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
        isProvisional,
      },
    });
  }
  console.log(
    `modifier_groups: upserted ${data.modifier_groups.length} rows (${provisionalGroups} provisional)`,
  );

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
        isDefaultSelected: row.default_selected,
      },
    });
  }
  console.log(`modifier_options: upserted ${data.modifier_options.length} rows`);

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

    const existing = await prisma.menuItem.findUnique({ where: { workbookId: row.item_id } });
    if (existing) {
      await prisma.menuItem.update({
        where: { workbookId: row.item_id },
        data: {
          categoryId,
          name: row.display_name,
          slug: slugify(row.display_name),
          boardLabel: row.board_label,
          basePriceCents: row.price_cents,
          sortOrder: nextSort,
          isUnverifiedPrice,
        },
      });
    } else {
      await prisma.menuItem.create({
        data: {
          workbookId: row.item_id,
          categoryId,
          name: row.display_name,
          slug: slugify(row.display_name),
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
  }
  console.log(
    `items: upserted ${data.items.length} rows (${placeholderItems} PLACEHOLDER/unverified); preserved sold-out, photos, curated flags on existing rows`,
  );

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

/**
 * Insert store config and hours only when absent. Previously this upsert overwrote
 * contact phone, tip presets, tax, hours, manager alerts, acceptingOrders, and isBusy.
 */
export async function seedStoreConfigIfAbsent(): Promise<void> {
  const existing = await prisma.storeConfig.findUnique({ where: { id: STORE_SEED.id } });
  if (existing) {
    console.log("store_config: left as-is (already present; will not overwrite edited values)");
  } else {
    await prisma.storeConfig.create({
      data: {
        ...STORE_SEED,
        tipPresetsBps: [...STORE_SEED.tipPresetsBps],
      },
    });
    console.log("store_config: inserted singleton row");
  }

  for (const hours of HOURS_SEED) {
    const row = await prisma.storeHours.findUnique({ where: { dayOfWeek: hours.dayOfWeek } });
    if (row) continue;
    await prisma.storeHours.create({ data: hours });
  }
  const hourCount = await prisma.storeHours.count();
  console.log(`store_hours: ${hourCount} rows (inserted missing days only; never overwrites)`);

  const closureCount = await prisma.storeClosure.count();
  console.log(`store_closures: left as-is (count=${closureCount}; seed inserts none)`);

  const counterCount = await prisma.orderNumberCounter.count();
  console.log(`order_number_counter: left as-is (count=${counterCount})`);

  invalidateStoreConfigCache();
}

export async function seedTestStaff(): Promise<void> {
  for (const staff of TEST_STAFF) {
    const pinHash = await hashPin(staff.pin);
    const passwordHash = await hashPassword(staff.password);
    await prisma.adminUser.upsert({
      where: { email: staff.email },
      create: {
        email: staff.email,
        displayName: staff.displayName,
        role: staff.role,
        passwordHash,
        pinHash,
        isActive: true,
        failedPinAttempts: 0,
        failedPasswordAttempts: 0,
        lockedUntil: null,
      },
      update: {
        displayName: staff.displayName,
        role: staff.role,
        passwordHash,
        pinHash,
        isActive: true,
        failedPinAttempts: 0,
        failedPasswordAttempts: 0,
        lockedUntil: null,
      },
    });
  }
  console.log(
    `admin_user: upserted ${TEST_STAFF.length} test accounts (staff PIN ${TEST_STAFF_PIN}, manager PIN ${TEST_MANAGER_PIN}, owner PIN ${TEST_OWNER_PIN} — change before a live shift)`,
  );
}

export async function runSeed(args: SeedArgs): Promise<{ ok: true } | { ok: false; message: string }> {
  const orderCount = await prisma.order.count();
  const refusal = describeSeedRefusal({
    target: args.target,
    nodeEnv: args.nodeEnv,
    orderCount,
    allowExistingOrders: args.allowExistingOrders,
  });
  if (refusal) {
    return { ok: false, message: refusal };
  }

  const workbookPath = args.workbookPath ?? defaultWorkbookPath();
  if (args.target === "all" || args.target === "menu") {
    console.log(`Seeding menu from ${workbookPath}`);
    await seedMenu(workbookPath);
    await seedStoreConfigIfAbsent();
  }
  if (args.target === "all" || args.target === "accounts") {
    await seedTestStaff();
  }
  console.log("Seed complete.");
  return { ok: true };
}
