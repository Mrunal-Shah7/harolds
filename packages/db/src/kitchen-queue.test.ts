// SPRINT-6: kitchen queue is ordered by paidAt and independent of print-job state.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { OrderStatus, PaymentStatus, PrintJobStatus, PrintTarget } from "@harolds/types";
import { prisma } from "./client";
import { getKitchenOrder, listKitchenQueue } from "./kitchen-queue";
import { applyOrderTransition } from "./order-status";
import { getPublicOrderView } from "./repositories/orders";

const PREFIX = "s6queue-";
let sequence = 820_000;

async function cleanup(): Promise<void> {
  await prisma.order.deleteMany({ where: { clientIdempotencyKey: { startsWith: PREFIX } } });
}

async function makeOrder(opts: {
  status?: OrderStatus;
  paidAt: Date;
  lastName?: string;
  withFailedPrint?: boolean;
}) {
  const key = `${PREFIX}${Math.random().toString(16).slice(2)}`;
  const order = await prisma.order.create({
    data: {
      orderNumber: `HC-Q-${key.slice(-4)}`,
      orderSequence: sequence++,
      businessDate: new Date("2099-03-01T00:00:00.000Z"),
      customerFirstName: "Jordan",
      customerLastName: opts.lastName ?? "Nguyen",
      customerPhone: "+17085550002",
      customerEmail: "s6queue@example.com",
      subtotalCents: 1598,
      taxCents: 161,
      tipCents: 200,
      totalCents: 1959,
      taxRateBps: 1010,
      taxAppliedPreDiscount: true,
      paymentStatus: PaymentStatus.CAPTURED,
      status: opts.status ?? OrderStatus.PAID,
      paidAt: opts.paidAt,
      customerNote: "extra ranch",
      lookupToken: key,
      clientIdempotencyKey: key,
      cartFingerprint: key,
      lines: {
        create: [
          {
            quantity: 2,
            itemName: "6pc Mixed",
            boardLabel: "6 MIX",
            unitPriceCents: 649,
            modifierTotalCents: 150,
            effectiveUnitPriceCents: 799,
            lineTotalCents: 1598,
            selectedModifiers: [
              {
                groupName: "Heat",
                groupPrompt: "How hot?",
                optionName: "Mild",
                priceDeltaCents: 0,
              },
              {
                groupName: "Side",
                groupPrompt: "Choose a side",
                optionName: "Fries",
                priceDeltaCents: 150,
              },
            ],
            customerNote: "no pickle",
          },
        ],
      },
    },
    include: { lines: true },
  });
  if (opts.withFailedPrint) {
    await prisma.printJob.createMany({
      data: [
        {
          orderId: order.id,
          target: PrintTarget.KITCHEN_TICKET,
          status: PrintJobStatus.CANCELLED,
          payload: "<epos-print/>",
          printerSerial: "DEAD-SERIAL",
        },
        {
          orderId: order.id,
          target: PrintTarget.COUNTER_RECEIPT,
          status: PrintJobStatus.FAILED,
          payload: "<epos-print/>",
          printerSerial: "DEAD-SERIAL",
        },
      ],
    });
  }
  return order;
}

let dbAvailable = true;

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
  } catch (err) {
    dbAvailable = false;
    console.warn(`[kitchen-queue.test] skipping: ${(err as Error).message}`);
  }
});

after(async () => {
  if (dbAvailable) await cleanup();
});

describe("kitchen queue", () => {
  it("returns qualifying statuses oldest-paid first, with full ticket fields", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const older = await makeOrder({ paidAt: new Date("2026-08-15T12:00:00.000Z") });
    const newer = await makeOrder({
      paidAt: new Date("2026-08-15T12:05:00.000Z"),
      status: OrderStatus.IN_PROGRESS,
    });
    await makeOrder({
      paidAt: new Date("2026-08-15T11:00:00.000Z"),
      status: OrderStatus.PICKED_UP,
    });
    await makeOrder({
      paidAt: new Date("2026-08-15T11:30:00.000Z"),
      status: OrderStatus.CANCELLED,
    });

    const queue = (await listKitchenQueue()).filter((o) => o.id === older.id || o.id === newer.id);
    assert.equal(queue.length, 2);
    assert.equal(queue[0]?.id, older.id);
    assert.equal(queue[1]?.id, newer.id);
    const card = queue[0]!;
    assert.equal(card.customerFirstName, "Jordan");
    assert.equal(card.customerLastInitial, "N");
    assert.equal(card.customerNote, "extra ranch");
    assert.equal(card.lines.length, 1);
    assert.equal(card.lines[0]?.itemName, "6pc Mixed");
    assert.equal(card.lines[0]?.customerNote, "no pickle");
    assert.equal(card.lines[0]?.selectedModifiers.length, 2);
    assert.equal(card.lines[0]?.selectedModifiers[1]?.optionName, "Fries");
    assert.ok(card.paidAt);
    assert.equal(card.printedAt, null);

    const detail = await getKitchenOrder(older.id);
    assert.equal(detail?.id, older.id);
    assert.equal(detail?.lines[0]?.boardLabel, "6 MIX");
  });

  it("still lists an order whose print jobs are all cancelled or failed", async () => {
    if (!dbAvailable) return;
    const order = await makeOrder({
      paidAt: new Date(),
      withFailedPrint: true,
    });
    const queue = await listKitchenQueue();
    assert.ok(queue.some((o) => o.id === order.id));
  });

  it("public status view reflects a kitchen-driven later status with the same fields", async () => {
    if (!dbAvailable) return;
    const order = await makeOrder({ paidAt: new Date() });
    await applyOrderTransition({
      orderId: order.id,
      to: OrderStatus.IN_PROGRESS,
      source: "KDS",
    });
    const full = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { lines: true },
    });
    const view = getPublicOrderView(full);
    assert.equal(view.status, OrderStatus.IN_PROGRESS);
    assert.equal(view.firstName, "Jordan");
    assert.ok("subtotalCents" in view);
    assert.ok("lines" in view);
    assert.equal("lookupToken" in view, false);
    assert.equal("customerPhone" in view, false);
  });
});
