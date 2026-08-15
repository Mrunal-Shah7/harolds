// SPRINT-8: refundOrder uses the Sprint 4 service; tests inject a fake Square port.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { OrderStatus, PaymentStatus } from "@harolds/types";
import { prisma } from "@harolds/db";
import { refundOrder } from "./refunds";

const PREFIX = "s8ref-";
let sequence = 890_000;
let dbAvailable = true;

async function cleanup(): Promise<void> {
  await prisma.order.deleteMany({ where: { clientIdempotencyKey: { startsWith: PREFIX } } });
}

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
  } catch (err) {
    dbAvailable = false;
    console.warn(`[refunds.test] skipping: ${(err as Error).message}`);
  }
});

after(async () => {
  if (dbAvailable) await cleanup();
});

describe("refundOrder via existing service", () => {
  it("applies a partial then a full remaining refund and rejects above the ceiling", async () => {
    if (!dbAvailable) return;
    const key = `${PREFIX}${Math.random().toString(16).slice(2)}`;
    const order = await prisma.order.create({
      data: {
        orderNumber: `HC-RF-${key.slice(-4)}`,
        orderSequence: sequence++,
        businessDate: new Date("2099-08-15T00:00:00.000Z"),
        customerFirstName: "Refund",
        customerLastName: "Case",
        customerPhone: "+17085550888",
        customerEmail: "s8ref@example.com",
        subtotalCents: 800,
        taxCents: 80,
        tipCents: 120,
        totalCents: 1000,
        taxRateBps: 1010,
        taxAppliedPreDiscount: true,
        paymentStatus: PaymentStatus.CAPTURED,
        status: OrderStatus.PAID,
        paidAt: new Date(),
        processorPaymentId: `pay_${key}`,
        lookupToken: key,
        clientIdempotencyKey: key,
        cartFingerprint: key,
        lines: {
          create: [
            {
              quantity: 1,
              itemName: "2pc Dark",
              unitPriceCents: 800,
              modifierTotalCents: 0,
              effectiveUnitPriceCents: 800,
              lineTotalCents: 800,
              selectedModifiers: [],
            },
          ],
        },
      },
    });

    const before = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(before.refundedCents, 0);
    assert.equal(before.status, OrderStatus.PAID);

    const partial = await refundOrder({
      orderId: order.id,
      amountCents: 250,
      clientIdempotencyKey: `${key}-p`,
      refundPaymentFn: async ({ amountCents }) => ({
        kind: "succeeded",
        refundId: `rfd_${key}_p`,
        amountCents,
        status: "COMPLETED",
      }),
    });
    assert.equal(partial.ok, true);
    if (!partial.ok) return;
    assert.equal(partial.order.refundedCents, 250);
    assert.equal(partial.order.paymentStatus, PaymentStatus.PARTIALLY_REFUNDED);

    const over = await refundOrder({
      orderId: order.id,
      amountCents: 9999,
      clientIdempotencyKey: `${key}-over`,
      refundPaymentFn: async () => {
        throw new Error("Square must not be called when the ceiling fails");
      },
    });
    assert.equal(over.ok, false);
    if (!over.ok) assert.equal(over.code, "VALIDATION");

    const rest = await refundOrder({
      orderId: order.id,
      amountCents: "full",
      clientIdempotencyKey: `${key}-f`,
      refundPaymentFn: async ({ amountCents }) => ({
        kind: "succeeded",
        refundId: `rfd_${key}_f`,
        amountCents,
        status: "COMPLETED",
      }),
    });
    assert.equal(rest.ok, true);
    if (!rest.ok) return;
    assert.equal(rest.order.refundedCents, 1000);
    assert.equal(rest.order.status, OrderStatus.REFUNDED);
  });
});
