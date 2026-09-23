// SPRINT-6: unacknowledged-order manager alert is enqueued exactly once per order.
// SPRINT-18.3: every assertion is scoped to THIS file's own order ids. The sweep is global — it
// alerts every qualifying paid order in the database — so its return count includes paid orders
// that other test files create concurrently, and asserting on that count made the file flaky.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { JobType, OrderStatus, PaymentStatus } from "@harolds/types";
import { prisma } from "./client";
import { enqueueUnacknowledgedKitchenAlerts } from "./kitchen-alerts";
import { applyOrderTransition } from "./order-status";

const PREFIX = "s6alert-";
let sequence = 830_000;

async function cleanup(): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { clientIdempotencyKey: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = orders.map((o) => o.id);
  if (ids.length > 0) {
    await prisma.backgroundJob.deleteMany({
      where: { OR: ids.map((id) => ({ payload: { path: ["orderId"], equals: id } })) },
    });
  }
  await prisma.order.deleteMany({ where: { clientIdempotencyKey: { startsWith: PREFIX } } });
}

/** Alerts of this job type for one order — the only count these tests may assert on. */
async function alertsFor(orderId: string): Promise<number> {
  return prisma.backgroundJob.count({
    where: { type: JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED, payload: { path: ["orderId"], equals: orderId } },
  });
}

async function paidOrder(paidAt: Date, status: OrderStatus = OrderStatus.PAID) {
  const key = `${PREFIX}${Math.random().toString(16).slice(2)}`;
  return prisma.order.create({
    data: {
      orderNumber: `HC-A-${key.slice(-4)}`,
      orderSequence: sequence++,
      businessDate: new Date("2099-04-01T00:00:00.000Z"),
      customerFirstName: "Alex",
      customerLastName: "Patel",
      customerPhone: "+17085550003",
      customerEmail: "s6alert@example.com",
      subtotalCents: 500,
      taxCents: 51,
      tipCents: 0,
      totalCents: 551,
      taxRateBps: 1010,
      taxAppliedPreDiscount: true,
      paymentStatus: PaymentStatus.CAPTURED,
      status,
      paidAt,
      lookupToken: key,
      clientIdempotencyKey: key,
      cartFingerprint: key,
      lines: {
        create: [
          {
            quantity: 1,
            itemName: "Wings",
            boardLabel: "WINGS",
            unitPriceCents: 500,
            modifierTotalCents: 0,
            effectiveUnitPriceCents: 500,
            lineTotalCents: 500,
            selectedModifiers: [],
          },
        ],
      },
    },
  });
}

let dbAvailable = true;

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
  } catch (err) {
    dbAvailable = false;
    console.warn(`[kitchen-alerts.test] skipping: ${(err as Error).message}`);
  }
});

after(async () => {
  if (dbAvailable) await cleanup();
});

describe("unacknowledged kitchen alerts", () => {
  it("inserts exactly once per qualifying order, not once per sweep", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const stale = await paidOrder(new Date(Date.now() - 10 * 60_000));
    const fresh = await paidOrder(new Date());
    const now = new Date();
    await enqueueUnacknowledgedKitchenAlerts({ thresholdMs: 180_000, now });
    assert.equal(await alertsFor(stale.id), 1, "the stale order is alerted on the first sweep");
    await enqueueUnacknowledgedKitchenAlerts({ thresholdMs: 180_000, now });
    assert.equal(await alertsFor(stale.id), 1, "and not again on the second");
    assert.equal(await alertsFor(fresh.id), 0, "a fresh order is not alerted at all");
  });

  it("does not alert an order the kitchen has already started", async () => {
    if (!dbAvailable) return;
    const order = await paidOrder(new Date(Date.now() - 10 * 60_000));
    await applyOrderTransition({
      orderId: order.id,
      to: OrderStatus.IN_PROGRESS,
      source: "KDS",
    });
    await enqueueUnacknowledgedKitchenAlerts({
      thresholdMs: 1_000,
      now: new Date(),
    });
    assert.equal(await alertsFor(order.id), 0);
  });

  it("shares the job type with Sprint 5 so a print-driven alert is not duplicated", async () => {
    if (!dbAvailable) return;
    const order = await paidOrder(new Date(Date.now() - 10 * 60_000), OrderStatus.PRINTED);
    await prisma.backgroundJob.create({
      data: {
        type: JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          reason: "Paid order has print jobs that never reached PRINTED (printer may be off).",
        },
      },
    });
    await enqueueUnacknowledgedKitchenAlerts({ thresholdMs: 1_000, now: new Date() });
    assert.equal(await alertsFor(order.id), 1, "the existing Sprint 5 alert is not duplicated");
  });
});
