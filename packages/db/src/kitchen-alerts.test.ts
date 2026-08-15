// SPRINT-6: unacknowledged-order manager alert is enqueued exactly once per order.
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
    const first = await enqueueUnacknowledgedKitchenAlerts({ thresholdMs: 180_000, now });
    assert.ok(first >= 1);
    const alerts = await prisma.backgroundJob.findMany({
      where: {
        type: JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED,
        payload: { path: ["orderId"], equals: stale.id },
      },
    });
    assert.equal(alerts.length, 1);
    const second = await enqueueUnacknowledgedKitchenAlerts({ thresholdMs: 180_000, now });
    assert.equal(second, 0);
    const alertsAgain = await prisma.backgroundJob.findMany({
      where: {
        type: JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED,
        payload: { path: ["orderId"], equals: stale.id },
      },
    });
    assert.equal(alertsAgain.length, 1);
    const freshAlerts = await prisma.backgroundJob.findMany({
      where: {
        type: JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED,
        payload: { path: ["orderId"], equals: fresh.id },
      },
    });
    assert.equal(freshAlerts.length, 0);
  });

  it("does not alert an order the kitchen has already started", async () => {
    if (!dbAvailable) return;
    const order = await paidOrder(new Date(Date.now() - 10 * 60_000));
    await applyOrderTransition({
      orderId: order.id,
      to: OrderStatus.IN_PROGRESS,
      source: "KDS",
    });
    const n = await enqueueUnacknowledgedKitchenAlerts({
      thresholdMs: 1_000,
      now: new Date(),
    });
    assert.equal(n, 0);
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
    const n = await enqueueUnacknowledgedKitchenAlerts({ thresholdMs: 1_000, now: new Date() });
    assert.equal(n, 0);
    const alerts = await prisma.backgroundJob.findMany({
      where: {
        type: JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED,
        payload: { path: ["orderId"], equals: order.id },
      },
    });
    assert.equal(alerts.length, 1);
  });
});
