// SPRINT-8 / SPRINT-11: report totals equal stored order cents — fixtures are engine-produced.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { OrderStatus, PaymentStatus } from "@harolds/types";
import { quoteCart, toMenuCatalog } from "@harolds/pricing";
import { prisma } from "./client";
import { salesReport, salesReportToCsv } from "./admin-reports";
import { assertRefundAmount } from "./admin-orders";
import { applyRefundToOrder } from "./refunds";
import { fetchItemsForQuote } from "./repositories/catalog";
import { getStoreConfig } from "./store-config";

const PREFIX = "s8rep-";
let sequence = 880_000;
let dbAvailable = true;

async function cleanup(): Promise<void> {
  await prisma.order.deleteMany({ where: { clientIdempotencyKey: { startsWith: PREFIX } } });
  await prisma.menuItem.deleteMany({ where: { workbookId: { startsWith: PREFIX } } });
}

function assertOrderMoney(row: { subtotalCents: number; taxCents: number; tipCents: number; totalCents: number; orderNumber?: string | null }) {
  assert.equal(
    row.subtotalCents + row.taxCents + row.tipCents,
    row.totalCents,
    `parts must sum to total${row.orderNumber ? ` (${row.orderNumber})` : ""}`,
  );
}

async function enginePaidOrder(args: { quantity: number; tipCents: number; paidAt: Date; itemId: string; itemName: string }) {
  const rows = await fetchItemsForQuote([args.itemId]);
  const catalog = toMenuCatalog(rows);
  const store = await getStoreConfig();
  const quoted = quoteCart({
    cart: {
      lines: [{ itemId: args.itemId, quantity: args.quantity, selectedOptionIds: [] }],
      tip: args.tipCents > 0 ? { type: "amount", amountCents: args.tipCents } : undefined,
    },
    catalog,
    store: {
      taxRateBps: store.taxRateBps,
      taxAppliedPreDiscount: store.taxAppliedPreDiscount,
      tippingEnabled: store.tippingEnabled,
      tipPresetsBps: store.tipPresetsBps,
      isOpen: true,
      acceptingOrders: true,
      prepMinutes: store.normalPrepMinutes,
      now: args.paidAt,
    },
  });
  assert.equal(quoted.ok, true, quoted.ok ? "" : JSON.stringify(quoted.reasons));
  if (!quoted.ok) throw new Error("quote failed");
  assertOrderMoney({
    subtotalCents: quoted.result.subtotalCents,
    taxCents: quoted.result.taxCents,
    tipCents: quoted.result.tip.tipCents,
    totalCents: quoted.result.totalCents,
  });
  const key = `${PREFIX}${Math.random().toString(16).slice(2)}`;
  const order = await prisma.order.create({
    data: {
      orderNumber: `HC-R-${key.slice(-4)}`,
      orderSequence: sequence++,
      businessDate: new Date("2099-08-15T00:00:00.000Z"),
      customerFirstName: "Pat",
      customerLastName: "Report",
      customerPhone: "+17085550999",
      customerEmail: "s8rep@example.com",
      subtotalCents: quoted.result.subtotalCents,
      taxCents: quoted.result.taxCents,
      tipCents: quoted.result.tip.tipCents,
      totalCents: quoted.result.totalCents,
      refundedCents: 0,
      taxRateBps: quoted.result.taxRateBps,
      taxAppliedPreDiscount: quoted.result.taxAppliedPreDiscount,
      paymentStatus: PaymentStatus.CAPTURED,
      status: OrderStatus.PAID,
      paidAt: args.paidAt,
      lookupToken: key,
      clientIdempotencyKey: key,
      cartFingerprint: key,
      lines: {
        create: quoted.result.lines.map((line) => ({
          quantity: line.snapshot.quantity,
          itemName: line.snapshot.itemName,
          boardLabel: line.snapshot.boardLabel,
          unitPriceCents: line.snapshot.baseUnitPriceCents,
          modifierTotalCents: line.snapshot.modifierTotalCents,
          effectiveUnitPriceCents: line.snapshot.effectiveUnitPriceCents,
          lineTotalCents: line.snapshot.lineTotalCents,
          selectedModifiers: line.snapshot.selectedModifiers,
          customerNote: line.snapshot.customerNote,
        })),
      },
    },
  });
  return order;
}

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
  } catch (err) {
    dbAvailable = false;
    console.warn(`[admin-reports.test] skipping: ${(err as Error).message}`);
  }
});

after(async () => {
  if (dbAvailable) await cleanup();
});

describe("sales report", () => {
  it("sums stored totals, tax, tips, and refunds without recomputing", async () => {
    if (!dbAvailable) return;
    const category = await prisma.category.findFirstOrThrow();
    const stamp = Math.random().toString(16).slice(2);
    const item = await prisma.menuItem.create({
      data: {
        workbookId: `${PREFIX}item-${stamp}`,
        categoryId: category.id,
        name: "S8 Report Dinner",
        slug: `${PREFIX}dinner-${stamp}`,
        basePriceCents: 879,
        isActive: true,
        isSoldOut: false,
        sortOrder: 9999,
      },
    });
    const paidAt = new Date("2099-08-15T18:00:00.000Z");
    const a = await enginePaidOrder({ quantity: 2, tipCents: 200, paidAt, itemId: item.id, itemName: item.name });
    const b = await enginePaidOrder({ quantity: 1, tipCents: 0, paidAt, itemId: item.id, itemName: item.name });
    await applyRefundToOrder({ orderId: b.id, addRefundedCents: 200 });
    const bAfter = await prisma.order.findUniqueOrThrow({ where: { id: b.id } });

    assertOrderMoney(a);
    assertOrderMoney(bAfter);

    const report = await salesReport({
      fromDate: "2099-08-15",
      toDate: "2099-08-15",
      timeZone: "America/Chicago",
    });
    const expectedGross = a.totalCents + bAfter.totalCents;
    const expectedTax = a.taxCents + bAfter.taxCents;
    const expectedTip = a.tipCents + bAfter.tipCents;
    const expectedRefunds = bAfter.refundedCents;
    assert.equal(report.totals.grossSalesCents, expectedGross);
    assert.equal(report.totals.taxCollectedCents, expectedTax);
    assert.equal(report.totals.tipsCollectedCents, expectedTip);
    assert.equal(report.totals.refundsIssuedCents, expectedRefunds);
    assert.equal(report.totals.netCents, expectedGross - expectedRefunds);
    const mixed = report.items.find((i) => i.itemName === item.name);
    assert.equal(mixed?.quantity, 3);
    const csv = salesReportToCsv(report);
    assert.match(csv, /gross_sales_cents/);
    assert.match(csv, new RegExp(item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("every paid order in the development database has parts that sum to total", async () => {
    if (!dbAvailable) return;
    const orders = await prisma.order.findMany({
      where: { paidAt: { not: null } },
      select: { orderNumber: true, subtotalCents: true, taxCents: true, tipCents: true, totalCents: true },
    });
    for (const order of orders) {
      assertOrderMoney(order);
    }
  });

  it("rejects a refund above the remaining ceiling", () => {
    assert.throws(() => assertRefundAmount(500, 400), /exceeds remaining/);
    assertRefundAmount(400, 400);
  });
});
