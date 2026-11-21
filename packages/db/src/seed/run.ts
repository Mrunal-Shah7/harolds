// SPRINT-11: seed runners — menu and accounts are separate; production cannot restore test logins.
import { prisma } from "../client";
import { invalidateStoreConfigCache } from "../store-config";
import { rebrandUntouchedSeoDefaults } from "../seo";
import { existsSync } from "node:fs";
import { readWorkbook, slugify, workbookPathForBranch } from "./workbook";
import { hashPin } from "../pin";
import { hashPassword } from "../password";
import { AdminRole } from "@harolds/types";
import { adminAccountsPath, readAdminAccounts, seedAdminAccounts } from "./admin-accounts";
import { branchConfigFor, DEFAULT_BRANCH_NAME, env, getBranchConfig } from "@harolds/config";

/**
 * The store facts that differ per location. Burnham's are the agreed values; any other branch
 * starts from visible placeholders, so the storefront never shows another location's address or
 * phone. The owner fills them in from the back office (Store page) before going live.
 */
const BRANCH_FACTS = {
  Burnham: {
    addressLine1: "4709 W 95th St",
    city: "Burnham",
    state: "IL",
    postalCode: "60453-2515",
    contactPhone: "TODO: CONFIRM PHONE",
  },
} as const;

export const PLACEHOLDER_BRANCH_FACTS = {
  addressLine1: "TODO: SET ADDRESS",
  city: "TODO: SET CITY",
  state: "IL",
  postalCode: "00000",
  contactPhone: "TODO: CONFIRM PHONE",
} as const;

const BRANCH = getBranchConfig();
const FACTS =
  BRANCH_FACTS[BRANCH.branchName as keyof typeof BRANCH_FACTS] ?? PLACEHOLDER_BRANCH_FACTS;

/** Store configuration seeded for this deployment's branch (STORE_BRANCH_NAME). */
export const STORE_SEED = {
  id: "default",
  storeName: BRANCH.siteName,
  addressLine1: FACTS.addressLine1 as string,
  addressLine2: null as string | null,
  city: FACTS.city as string,
  state: FACTS.state as string,
  postalCode: FACTS.postalCode as string,
  contactPhone: FACTS.contactPhone as string,
  timezone: "America/Chicago",
  // Burnham's rate. CONFIRM for any other location: sales tax differs by municipality.
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

/**
 * - menu:          menu, store config, hours, SEO names (this branch's workbook)
 * - accounts:      the REAL back-office accounts from seed-accounts.json (allowed in production)
 * - test-accounts: the three fixed test logins (development only, never production)
 * - all:           menu + accounts
 */
export type SeedTarget = "all" | "menu" | "accounts" | "test-accounts";

export type SeedArgs = {
  target: SeedTarget;
  nodeEnv: string;
  allowExistingOrders: boolean;
  workbookPath?: string;
  /** From --branch=<name>: the branch a per-branch script was written for. */
  branch?: string;
  /** The private accounts file (seed-accounts.json, or SEED_ACCOUNTS_PATH). */
  accountsPath: string;
};

/**
 * Guard that must run before any write. Returns a refusal message or null to proceed.
 * Production never gets the test logins. Catalogue and test-login seeds against a database with
 * orders need an explicit override; adding real accounts does not touch orders, so it is exempt.
 */
export function describeSeedRefusal(args: {
  target: SeedTarget;
  nodeEnv: string;
  orderCount: number;
  allowExistingOrders: boolean;
}): string | null {
  if (args.target === "test-accounts" && args.nodeEnv === "production") {
    return [
      "Refusing to create, update, or reactivate test accounts against a production database.",
      "Test logins (test-staff@localhost, test-manager@localhost, test-owner@localhost) must not exist in production.",
      "For the real back-office accounts run: pnpm db:seed:accounts. To correct catalogue data: pnpm db:seed:menu",
    ].join("\n");
  }
  if (args.target !== "accounts" && args.orderCount > 0 && !args.allowExistingOrders) {
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
  if (argv.includes("--test-accounts-only")) target = "test-accounts";
  const branchArg = argv.find((a) => a.startsWith("--branch="));
  return {
    target,
    nodeEnv: env.NODE_ENV ?? "development",
    allowExistingOrders,
    workbookPath: env.WORKBOOK_PATH,
    branch: branchArg ? branchArg.slice("--branch=".length) : undefined,
    accountsPath: adminAccountsPath(env),
  };
}

/**
 * The per-branch scripts (`pnpm db:seed:menu:burnham`, `pnpm db:seed:menu:zion`) pass
 * --branch=<name>. Refuse when it disagrees with this deployment's STORE_BRANCH_NAME: the store
 * name, SEO names and workbook all follow STORE_BRANCH_NAME, so running another branch's script
 * against this database would mix two locations.
 */
export function describeBranchRefusal(requested: string | undefined, configured: string): string | null {
  if (requested === undefined) return null;
  if (slugify(requested) === slugify(configured)) return null;
  return [
    `Refusing to seed: this script is for branch "${requested}", but STORE_BRANCH_NAME is "${configured}".`,
    `Check you are in the right folder and .env. If this database really is ${requested}, set`,
    `STORE_BRANCH_NAME="${requested}" in .env first (unset means "${DEFAULT_BRANCH_NAME}").`,
  ].join("\n");
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

/**
 * The SPRINT-18 migration seeds the SEO site defaults with Burnham's names and domain. On a new
 * branch's database that row would name the wrong location, and canonicalHost cannot be changed
 * from the back office. So for a branch other than Burnham, rewrite the row ONLY while it still
 * holds exactly the migration's values (never an operator's edit), and bump the version as every
 * SEO write must. The menu route's description is aligned under the same rule.
 */
export async function alignSeoDefaultsToBranch(): Promise<void> {
  const migrated = branchConfigFor(DEFAULT_BRANCH_NAME).siteName;
  if (BRANCH.siteName === migrated) {
    console.log("seo_site_defaults: left as-is (Burnham branch)");
    return;
  }
  const host = new URL(env.NEXT_PUBLIC_APP_URL).origin;
  const changed = await rebrandUntouchedSeoDefaults({
    fromSiteName: migrated,
    fromHost: "https://haroldsburnham.com",
    toSiteName: BRANCH.siteName,
    toHost: host,
  });
  if (!changed) {
    console.log("seo_site_defaults: left as-is (absent or already edited)");
    return;
  }
  console.log(`seo_site_defaults: set to "${BRANCH.siteName}" on ${host}`);
  if (host.includes("localhost")) {
    console.warn(
      "seo_site_defaults: canonicalHost is a localhost URL — set NEXT_PUBLIC_APP_URL to the live domain before seeding production.",
    );
  }
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

  const wantsMenu = args.target === "all" || args.target === "menu";
  const wantsAccounts = args.target === "all" || args.target === "accounts";
  const { accounts, problems } = wantsAccounts ? readAdminAccounts(args.accountsPath) : { accounts: [], problems: [] };
  if (problems.length > 0) {
    return { ok: false, message: ["Refusing to seed: the accounts file has problems.", ...problems].join("\n") };
  }
  const branchRefusal = wantsMenu ? describeBranchRefusal(args.branch, BRANCH.branchName) : null;
  if (branchRefusal) {
    return { ok: false, message: branchRefusal };
  }
  const workbookPath = args.workbookPath ?? workbookPathForBranch(BRANCH.branchName);
  if (wantsMenu && !existsSync(workbookPath)) {
    return {
      ok: false,
      message: [
        `No menu workbook for branch "${BRANCH.branchName}": ${workbookPath} does not exist.`,
        `Add one to docs/menus/ (copy an existing branch's file as the template), or point WORKBOOK_PATH at it.`,
      ].join("\n"),
    };
  }
  if (wantsMenu) {
    console.log(`Branch: ${BRANCH.siteName} (STORE_BRANCH_NAME)`);
    console.log(`Seeding menu from ${workbookPath}`);
    await seedMenu(workbookPath);
    await seedStoreConfigIfAbsent();
    await alignSeoDefaultsToBranch();
  }
  if (args.target === "all" || args.target === "accounts") {
    console.log(`Seeding back-office accounts from ${args.accountsPath}`);
    await seedAdminAccounts(accounts);
  }
  if (args.target === "test-accounts") {
    await seedTestStaff();
  }
  console.log("Seed complete.");
  return { ok: true };
}
