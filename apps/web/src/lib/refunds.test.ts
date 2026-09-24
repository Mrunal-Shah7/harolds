// SPRINT-8: refundOrder uses the Sprint 4 service; tests inject a fake gateway port.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { OrderStatus, PaymentStatus } from "@harolds/types";
import {
  AdminValidationError,
  bookRefundFromProcessor,
  parseCurrencyInput,
  prisma,
  reservedRefundCents,
} from "@harolds/db";
import { PaymentClientError } from "@harolds/payments";
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
        throw new Error("the gateway must not be called when the ceiling fails");
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

  it("reserves an unconfirmed refund so a second attempt cannot go out", async () => {
    if (!dbAvailable) return;
    const { order, key } = await paidOrder();

    const first = await refundOrder({
      orderId: order.id,
      amountCents: "full",
      clientIdempotencyKey: `${key}-unknown`,
      refundPaymentFn: async () => ({
        kind: "transport_failure",
        message: "timeout",
        refundId: `rfd_${key}_u`,
      }),
    });
    assert.equal(first.ok, false);
    if (first.ok) return;
    assert.equal(first.code, "TRANSPORT");

    const held = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(held.refundedCents, 0);

    const replay = await refundOrder({
      orderId: order.id,
      amountCents: "full",
      clientIdempotencyKey: `${key}-unknown`,
      refundPaymentFn: async () => {
        throw new Error("replay of an unconfirmed key must not call the gateway");
      },
    });
    assert.equal(replay.ok, false);
    if (!replay.ok) assert.equal(replay.code, "TRANSPORT");

    const second = await refundOrder({
      orderId: order.id,
      amountCents: "full",
      clientIdempotencyKey: `${key}-second`,
      refundPaymentFn: async () => {
        throw new Error("an unconfirmed full refund must reserve the remaining amount");
      },
    });
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.code, "VALIDATION");
  });

  it("lets a later refund use only what an unconfirmed partial did not reserve", async () => {
    if (!dbAvailable) return;
    const { order, key } = await paidOrder();

    const partial = await refundOrder({
      orderId: order.id,
      amountCents: 400,
      clientIdempotencyKey: `${key}-u`,
      refundPaymentFn: async () => ({
        kind: "transport_failure",
        message: "timeout",
        refundId: `rfd_${key}_u`,
      }),
    });
    assert.equal(partial.ok, false);

    const over = await refundOrder({
      orderId: order.id,
      amountCents: 700,
      clientIdempotencyKey: `${key}-over`,
      refundPaymentFn: async () => {
        throw new Error("400 reserved + 700 requested exceeds 1000");
      },
    });
    assert.equal(over.ok, false);
    if (!over.ok) assert.equal(over.code, "VALIDATION");

    const rest = await refundOrder({
      orderId: order.id,
      amountCents: 600,
      clientIdempotencyKey: `${key}-rest`,
      refundPaymentFn: async ({ amountCents }) => ({
        kind: "succeeded",
        refundId: `rfd_${key}_rest`,
        amountCents,
        status: "COMPLETED",
      }),
    });
    assert.equal(rest.ok, true);
    if (rest.ok) assert.equal(rest.order.refundedCents, 600);
  });

  it("releases a declined refund so another attempt can proceed", async () => {
    if (!dbAvailable) return;
    const { order, key } = await paidOrder();

    const declined = await refundOrder({
      orderId: order.id,
      amountCents: 1000,
      clientIdempotencyKey: `${key}-dec`,
      refundPaymentFn: async () => ({
        kind: "declined",
        reason: "Already refunded.",
        code: "ALREADY_REFUNDED",
      }),
    });
    assert.equal(declined.ok, false);
    if (!declined.ok) assert.equal(declined.code, "DECLINED");

    const retry = await refundOrder({
      orderId: order.id,
      amountCents: 250,
      clientIdempotencyKey: `${key}-ok`,
      refundPaymentFn: async ({ amountCents }) => ({
        kind: "succeeded",
        refundId: `rfd_${key}_ok`,
        amountCents,
        status: "COMPLETED",
      }),
    });
    assert.equal(retry.ok, true);
    if (retry.ok) assert.equal(retry.order.refundedCents, 250);
  });

  it("releases the reservation when the gateway never processed the refund", async () => {
    if (!dbAvailable) return;
    const { order, key } = await paidOrder();

    const notSent = await refundOrder({
      orderId: order.id,
      amountCents: 1000,
      clientIdempotencyKey: `${key}-auth`,
      refundPaymentFn: async () => {
        throw new PaymentClientError("Payment gateway credentials are not configured.", "auth");
      },
    });
    assert.equal(notSent.ok, false);
    if (!notSent.ok) {
      assert.equal(notSent.code, "VALIDATION");
      assert.match(notSent.message, /not sent/);
    }
    assert.equal(await reservedRefundCents(order.id), 0);
    const row = await prisma.processorRefund.findUnique({
      where: { clientIdempotencyKey: `${key}-auth` },
    });
    assert.equal(row?.status, "FAILED");
  });

  it("keeps the reservation when a thrown error may have moved money", async () => {
    if (!dbAvailable) return;
    const { order, key } = await paidOrder();

    const unclear = await refundOrder({
      orderId: order.id,
      amountCents: 300,
      clientIdempotencyKey: `${key}-unexpected`,
      refundPaymentFn: async () => {
        throw new PaymentClientError(
          "Gateway approved the reversal but returned no transaction id.",
        );
      },
    });
    assert.equal(unclear.ok, false);
    if (!unclear.ok) assert.equal(unclear.code, "TRANSPORT");
    assert.equal(await reservedRefundCents(order.id), 300);
  });

  it("does not overwrite a refund the webhook confirmed while the gateway call timed out", async () => {
    if (!dbAvailable) return;
    const { order, key } = await paidOrder();
    const refundId = `rfd_${key}_race`;

    const result = await refundOrder({
      orderId: order.id,
      amountCents: 400,
      clientIdempotencyKey: `${key}-race`,
      refundPaymentFn: async ({ amountCents }) => {
        // The webhook lands first, then our own call gives up.
        await bookRefundFromProcessor({
          orderId: order.id,
          amountCents,
          processorRefundId: refundId,
        });
        return { kind: "transport_failure", message: "timeout", refundId: null };
      },
    });
    assert.equal(result.ok, true);

    const row = await prisma.processorRefund.findUnique({
      where: { clientIdempotencyKey: `${key}-race` },
    });
    assert.equal(row?.status, "COMPLETED");
    assert.equal(await reservedRefundCents(order.id), 0);
    const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(refreshed.refundedCents, 400);
  });

  it("sends one gateway refund when the same request arrives twice at once", async () => {
    if (!dbAvailable) return;
    const { order, key } = await paidOrder();
    let calls = 0;
    const slowRefund: NonNullable<Parameters<typeof refundOrder>[0]["refundPaymentFn"]> = async ({
      amountCents,
    }) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { kind: "succeeded", refundId: `rfd_${key}_dup`, amountCents, status: "COMPLETED" };
    };

    await Promise.all([
      refundOrder({
        orderId: order.id,
        amountCents: 200,
        clientIdempotencyKey: `${key}-dup`,
        refundPaymentFn: slowRefund,
      }),
      refundOrder({
        orderId: order.id,
        amountCents: 200,
        clientIdempotencyKey: `${key}-dup`,
        refundPaymentFn: slowRefund,
      }),
    ]);
    assert.equal(calls, 1);
    const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(refreshed.refundedCents, 200);
  });

  it("reports a mistyped partial amount as a validation error", () => {
    assert.throws(() => parseCurrencyInput("abc"), AdminValidationError);
    assert.equal(parseCurrencyInput("5.00"), 500);
  });
});

async function paidOrder() {
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
  return { order, key };
}
