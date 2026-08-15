// SPRINT-11: one scheduled reconciliation pass per business date; restart does not double-run.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { JobType, OrderStatus, PaymentStatus } from "@harolds/types";
import { prisma } from "./client";
import { maybeRunScheduledReconciliation } from "./scheduled-reconcile";
import { businessDateToUtcDate } from "./business-date";

const PREFIX = "s11rec-";
const FUTURE = new Date("2099-08-15T10:30:00.000Z");
const BUSINESS = "2099-08-15";
let sequence = 911_000;
let dbAvailable = true;

async function cleanup(): Promise<void> {
  await prisma.backgroundJob.deleteMany({
    where: {
      type: JobType.ALERT_MANAGER_PAYMENT_DISCREPANCY,
      payload: { path: ["businessDate"], equals: BUSINESS },
    },
  });
  const orders = await prisma.order.findMany({
    where: { clientIdempotencyKey: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = orders.map((o) => o.id);
  if (ids.length > 0) {
    await prisma.backgroundJob.deleteMany({
      where: {
        type: JobType.ALERT_MANAGER_PAYMENT_DISCREPANCY,
        OR: ids.map((id) => ({ payload: { path: ["orderId"], equals: id } })),
      },
    });
  }
  await prisma.order.deleteMany({ where: { clientIdempotencyKey: { startsWith: PREFIX } } });
  await prisma.reconciliationRun.deleteMany({ where: { businessDate: businessDateToUtcDate(BUSINESS) } });
}

async function awaitingWithPayment(paymentId: string) {
  const key = `${PREFIX}${Math.random().toString(16).slice(2)}`;
  return prisma.order.create({
    data: {
      orderNumber: `HC-Q-${key.slice(-4)}`,
      orderSequence: sequence++,
      businessDate: businessDateToUtcDate(BUSINESS),
      customerFirstName: "Quinn",
      customerLastName: "Reconcile",
      customerPhone: "+17085551111",
      customerEmail: "s11rec@example.com",
      subtotalCents: 879,
      taxCents: 89,
      tipCents: 0,
      totalCents: 968,
      taxRateBps: 1010,
      taxAppliedPreDiscount: true,
      paymentStatus: PaymentStatus.PENDING,
      status: OrderStatus.AWAITING_PAYMENT,
      processorPaymentId: paymentId,
      createdAt: FUTURE,
      lookupToken: key,
      clientIdempotencyKey: key,
      cartFingerprint: key,
      lines: {
        create: [
          {
            quantity: 1,
            itemName: "2pc Dark",
            unitPriceCents: 879,
            modifierTotalCents: 0,
            effectiveUnitPriceCents: 879,
            lineTotalCents: 879,
            selectedModifiers: [],
          },
        ],
      },
    },
  });
}

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
  } catch (err) {
    dbAvailable = false;
    console.warn(`[scheduled-reconcile.test] skipping: ${(err as Error).message}`);
  }
});

after(async () => {
  if (dbAvailable) await cleanup();
});

describe("scheduled reconciliation", () => {
  it("skips before the configured store-local hour", async () => {
    if (!dbAvailable) return;
    const tooEarly = DateTime.fromISO("2099-08-15T07:00:00.000Z").toJSDate();
    const result = await maybeRunScheduledReconciliation({
      now: tooEarly,
      hourLocal: 4,
      lookbackHours: 48,
      probePayment: async () => null,
    });
    assert.equal(result.skipped, "too_early");
    assert.equal(await prisma.reconciliationRun.count({ where: { businessDate: businessDateToUtcDate(BUSINESS) } }), 0);
  });

  it("runs once per business date, records findings, and a restart does not run again", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const order = await awaitingWithPayment("sqpay-s11-orphan");
    const markedBefore = await prisma.order.count({
      where: { clientIdempotencyKey: { startsWith: PREFIX } },
    });
    const first = await maybeRunScheduledReconciliation({
      now: FUTURE,
      hourLocal: 4,
      lookbackHours: 48,
      enqueueAlerts: true,
      probePayment: async (id) =>
        id === "sqpay-s11-orphan" ? { status: "completed", amountCents: 968 } : null,
    });
    assert.equal(first.skipped, false);
    assert.equal(first.businessDate, BUSINESS);
    assert.ok(first.findingCount >= 1);
    assert.ok(first.findings.some((f) => f.kind === "ORPHAN_SQUARE_PAYMENT" && f.orderId === order.id));
    const alerts = await prisma.backgroundJob.count({
      where: {
        type: JobType.ALERT_MANAGER_PAYMENT_DISCREPANCY,
        payload: { path: ["businessDate"], equals: BUSINESS },
      },
    });
    assert.equal(alerts, 1);
    const second = await maybeRunScheduledReconciliation({
      now: FUTURE,
      hourLocal: 4,
      lookbackHours: 48,
      enqueueAlerts: true,
      probePayment: async () => {
        throw new Error("must not probe on a skipped pass");
      },
    });
    assert.equal(second.skipped, "already_ran");
    assert.equal(second.runId, first.runId);
    const alertsAfter = await prisma.backgroundJob.count({
      where: {
        type: JobType.ALERT_MANAGER_PAYMENT_DISCREPANCY,
        payload: { path: ["businessDate"], equals: BUSINESS },
      },
    });
    assert.equal(alertsAfter, 1);
    assert.equal(
      await prisma.order.count({ where: { clientIdempotencyKey: { startsWith: PREFIX } } }),
      markedBefore,
    );
  });
});
