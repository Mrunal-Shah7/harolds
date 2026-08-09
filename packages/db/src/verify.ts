// SPRINT-1: seeded-state verification — summary + invariant checks (non-zero exit on violation)
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { prisma } from "./client";

type Violation = { id: string; message: string };

async function main(): Promise<void> {
  const violations: Violation[] = [];

  const [
    categoryCount,
    itemCount,
    groupCount,
    optionCount,
    bindingCount,
    orderCount,
    orderLineCount,
    printJobCount,
    backgroundJobCount,
    configCount,
    hoursCount,
    closureCount,
    counter,
  ] = await Promise.all([
    prisma.category.count(),
    prisma.menuItem.count(),
    prisma.modifierGroup.count(),
    prisma.modifierOption.count(),
    prisma.itemModifierGroup.count(),
    prisma.order.count(),
    prisma.orderLine.count(),
    prisma.printJob.count(),
    prisma.backgroundJob.count(),
    prisma.storeConfig.count(),
    prisma.storeHours.count(),
    prisma.storeClosure.count(),
    prisma.orderNumberCounter.findUnique({ where: { id: "default" } }),
  ]);

  const unverifiedCount = await prisma.menuItem.count({ where: { isUnverifiedPrice: true } });
  const provisionalCount = await prisma.modifierGroup.count({ where: { isProvisional: true } });
  const pricedOptions = await prisma.modifierOption.count({
    where: { priceDeltaCents: { gt: 0 } },
  });

  const priceAgg = await prisma.menuItem.aggregate({
    _min: { basePriceCents: true },
    _max: { basePriceCents: true },
  });

  const categories = await prisma.category.findMany({
    include: { _count: { select: { items: true } } },
    orderBy: { sortOrder: "asc" },
  });

  const config = await prisma.storeConfig.findUnique({ where: { id: "default" } });

  console.log("=== Harold's Chicken — Seed Verification ===\n");
  console.log("Row counts:");
  console.log(`  Category             ${categoryCount}`);
  console.log(`  MenuItem             ${itemCount}`);
  console.log(`  ModifierGroup        ${groupCount}`);
  console.log(`  ModifierOption       ${optionCount}`);
  console.log(`  ItemModifierGroup    ${bindingCount}`);
  console.log(`  Order                ${orderCount}`);
  console.log(`  OrderLine            ${orderLineCount}`);
  console.log(`  PrintJob             ${printJobCount}`);
  console.log(`  BackgroundJob        ${backgroundJobCount}`);
  console.log(`  StoreConfig          ${configCount}`);
  console.log(`  StoreHours           ${hoursCount}`);
  console.log(`  StoreClosure         ${closureCount}`);
  console.log(`  OrderNumberCounter   ${counter ? 1 : 0}`);

  console.log("\nItems per category:");
  for (const cat of categories) {
    console.log(`  ${cat.slug.padEnd(28)} ${cat._count.items}`);
  }

  console.log(`\nUnverified-price items:     ${unverifiedCount}`);
  console.log(`Provisional modifier groups: ${provisionalCount}`);
  console.log(`Non-zero price-delta options:${pricedOptions}`);
  console.log(`Lowest item price (cents):   ${priceAgg._min.basePriceCents ?? "n/a"}`);
  console.log(`Highest item price (cents):  ${priceAgg._max.basePriceCents ?? "n/a"}`);

  if (config) {
    console.log(`\nStore config:`);
    console.log(`  taxRateBps:          ${config.taxRateBps}`);
    console.log(`  normalPrepMinutes:   ${config.normalPrepMinutes}`);
    console.log(`  busyPrepMinutes:     ${config.busyPrepMinutes}`);
    console.log(`  orderNumberPrefix:   ${config.orderNumberPrefix}`);
  }
  console.log(`  order counter value: ${counter?.currentValue ?? "MISSING"}`);

  // --- Invariants ---
  const badPriceItems = await prisma.menuItem.findMany({
    where: { basePriceCents: { lte: 0 } },
    select: { id: true, workbookId: true, name: true, basePriceCents: true },
  });
  for (const item of badPriceItems) {
    violations.push({
      id: item.id,
      message: `MenuItem ${item.workbookId} ("${item.name}") has basePriceCents=${item.basePriceCents} (must be > 0)`,
    });
  }

  const allItems = await prisma.menuItem.findMany({
    select: { id: true, workbookId: true, categoryId: true },
  });
  const categoryIds = new Set((await prisma.category.findMany({ select: { id: true } })).map((c) => c.id));
  for (const item of allItems) {
    if (!categoryIds.has(item.categoryId)) {
      violations.push({
        id: item.id,
        message: `MenuItem ${item.workbookId} references missing category ${item.categoryId}`,
      });
    }
  }

  const negativeOptions = await prisma.modifierOption.findMany({
    where: { priceDeltaCents: { lt: 0 } },
    select: { id: true, workbookId: true, name: true, priceDeltaCents: true },
  });
  for (const opt of negativeOptions) {
    violations.push({
      id: opt.id,
      message: `ModifierOption ${opt.workbookId} ("${opt.name}") has negative priceDeltaCents=${opt.priceDeltaCents}`,
    });
  }

  const badGroups = await prisma.modifierGroup.findMany({
    select: {
      id: true,
      workbookId: true,
      minSelect: true,
      maxSelect: true,
      isProvisional: true,
      _count: { select: { items: true } },
    },
  });
  for (const g of badGroups) {
    if (g.minSelect > g.maxSelect) {
      violations.push({
        id: g.id,
        message: `ModifierGroup ${g.workbookId} has minSelect (${g.minSelect}) > maxSelect (${g.maxSelect})`,
      });
    }
    if (g._count.items === 0 && !g.isProvisional) {
      violations.push({
        id: g.id,
        message: `ModifierGroup ${g.workbookId} is bound to no items and is not marked provisional`,
      });
    }
  }

  for (const cat of categories) {
    const activeCount = await prisma.menuItem.count({
      where: { categoryId: cat.id, isActive: true },
    });
    if (activeCount === 0) {
      violations.push({
        id: cat.id,
        message: `Category ${cat.workbookId} ("${cat.name}") contains no active items`,
      });
    }
  }

  if (configCount !== 1) {
    violations.push({
      id: "StoreConfig",
      message: `Expected exactly 1 StoreConfig row, found ${configCount}`,
    });
  }
  if (hoursCount !== 7) {
    violations.push({
      id: "StoreHours",
      message: `Expected exactly 7 StoreHours rows, found ${hoursCount}`,
    });
  }

  console.log("\n--- Invariants ---");
  if (violations.length === 0) {
    console.log("All invariants passed.");
    return;
  }

  console.error(`FAILED: ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  [${v.id}] ${v.message}`);
  }
  process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Verify failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
