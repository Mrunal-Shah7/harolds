// Regression: a captured order must never be re-numbered, however far the kitchen has taken it.
//
// THE BUG THIS COVERS. `markOrderPaidAndAllocate` used to short-circuit only when
// `status === PAID && paymentStatus === CAPTURED && orderNumber`. The gateway redelivers
// `payment.updated`, and by the time a retry arrives the kitchen has usually advanced the order
// to PRINTED / IN_PROGRESS / READY. The status half of that guard then failed, the retry fell
// through, and the order was allocated a SECOND number and reset to PAID — a customer watching
// the order-status page saw HC-001 turn into HC-002, and the ticket returned to the board.
//
// The guard is now keyed on the payment alone. These tests pin that: replaying capture at every
// downstream status must be a no-op.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./client";
import { markOrderPaidAndAllocate } from "./repositories/orders";
import { OrderStatus, PaymentStatus } from "@harolds/types";

const MARKER = "ordnum-idem-test";
let dbAvailable = true;

async function cleanup(): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { customerLastName: MARKER },
    select: { id: true },
  });
  // The throwaway counter row these orders allocate from (see FUTURE_BUSINESS_DATE).
  await prisma.orderNumberCounter.deleteMany({
    where: { businessDate: new Date(`${FUTURE_BUSINESS_DATE}T00:00:00.000Z`) },
  });
  const ids = orders.map((o) => o.id);
  if (ids.length === 0) return;
  await prisma.printJob.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.orderStatusEvent.deleteMany({ where: { orderId: { in: ids } } }).catch(() => undefined);
  await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
}

/** A minimal AWAITING_PAYMENT order, enough for the capture path to run against. */
async function seedPendingOrder(token: string) {
  return prisma.order.create({
    data: {
      lookupToken: token,
      status: OrderStatus.AWAITING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
      customerFirstName: "Idem",
      customerLastName: MARKER,
      customerPhone: "+17085550100",
      customerEmail: "idem@localhost",
      smsConsent: false,
      subtotalCents: 1000,
      taxCents: 100,
      tipCents: 0,
      totalCents: 1100,
      taxRateBps: 1000,
      taxAppliedPreDiscount: true,
      clientIdempotencyKey: `${MARKER}-client-${token}`,
      cartFingerprint: `${MARKER}-fingerprint`,
    },
  });
}

/**
 * Allocation happens under the business date containing `paidAt`. Using the wall clock here
 * consumes real order numbers from the store's live counter on every run — and the counter is
 * gap-free and never rolls back, so deleting these orders in cleanup does NOT give them back.
 * A far-future date allocates from a throwaway row that cleanup deletes instead.
 */
const FUTURE_BUSINESS_DATE = "2099-07-05";

const captureArgs = {
  paymentId: "txn_test_idem",
  paidAt: new Date(`${FUTURE_BUSINESS_DATE}T18:00:00.000Z`),
  kitchenSerial: "TESTKITCHEN",
  counterSerial: "TESTCOUNTER",
  printMaxAttempts: 5,
  cardLast4: "1111",
};

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    dbAvailable = false;
    console.warn(
      `[order-number-idempotency.test] DATABASE_URL unreachable — skipping: ${(err as Error).message}`,
    );
    return;
  }
  await cleanup();
});

after(async () => {
  if (dbAvailable) await cleanup();
});

describe("markOrderPaidAndAllocate is idempotent past PAID", () => {
  it("replaying capture on a PAID order keeps the same number", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const order = await seedPendingOrder(`${MARKER}-paid-${Date.now()}`);

    const first = await markOrderPaidAndAllocate(order.id, captureArgs);
    assert.ok(first.orderNumber, "first capture allocates a number");

    const second = await markOrderPaidAndAllocate(order.id, captureArgs);
    assert.equal(second.orderNumber, first.orderNumber, "replay must not re-allocate");
    assert.equal(second.orderSequence, first.orderSequence);
  });

  // The regression proper: each of these is a status the kitchen moves an order into, and each
  // one used to defeat the guard.
  for (const advanced of [
    OrderStatus.PRINTED,
    OrderStatus.IN_PROGRESS,
    OrderStatus.READY,
    OrderStatus.PICKED_UP,
  ]) {
    it(`a redelivered webhook against a ${advanced} order changes nothing`, async (t) => {
      if (!dbAvailable) return t.skip("no database");
      const order = await seedPendingOrder(`${MARKER}-${advanced}-${Date.now()}`);
      const captured = await markOrderPaidAndAllocate(order.id, captureArgs);
      const originalNumber = captured.orderNumber;
      assert.ok(originalNumber);

      // The kitchen advances it, exactly as the KDS does.
      await prisma.order.update({ where: { id: order.id }, data: { status: advanced } });

      // The gateway retries the payment webhook.
      const replayed = await markOrderPaidAndAllocate(order.id, captureArgs);

      assert.equal(replayed.orderNumber, originalNumber, "the order number must not change");
      assert.equal(replayed.status, advanced, "fulfilment progress must not be reset to PAID");

      const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(fresh.orderNumber, originalNumber);
      assert.equal(fresh.status, advanced);

      // And no second receipt was queued for the same order.
      const jobs = await prisma.printJob.count({ where: { orderId: order.id } });
      assert.equal(jobs, 1, "a replay must not enqueue a second receipt");
    });
  }
});
