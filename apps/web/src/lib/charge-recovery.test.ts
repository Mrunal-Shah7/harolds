// SPRINT-17: recovery from an interrupted charge — the branches where money decisions are made.
//
// `claimOrderForCharge` (tested in packages/db) guarantees only ONE request may call the gateway.
// This file tests what the LOSER does, which is where a double charge would actually happen: it
// holds no claim, it does not know whether the holder took money, and the wrong answer here
// charges a real customer twice.
//
// The gateway is injected. These assertions are about decision-making, not about NMI.
//
// These do NOT green-skip when Postgres is unreachable. A payment-path guarantee that silently
// passes because nothing ran is worse than no test.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma, claimOrderForCharge } from "@harolds/db";
import { JobType, OrderStatus, PaymentStatus } from "@harolds/types";
import type { NormalizedPayment, PaymentOutcome } from "@harolds/payments";
import {
  chargeExistingPending,
  AmbiguousPaymentReason,
  CHARGE_RECOVERY_AFTER_MS,
  type ChargeDeps,
} from "./checkout";
import { ApiErrorCode } from "@harolds/types";

const PREFIX = "s17-recovery-";
const TOTAL_CENTS = 1500;

async function cleanup(): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { clientIdempotencyKey: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = orders.map((o) => o.id);
  if (ids.length > 0) {
    await prisma.printJob.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderStatusEvent.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderLine.deleteMany({ where: { orderId: { in: ids } } });
    // BackgroundJob references the order only inside its JSON payload, so nothing cascades and
    // these have to be matched by the real order ids — which are cuids, NOT prefixed. Matching
    // on PREFIX here silently deleted nothing and left SMS/email/alert jobs behind for every
    // paid order this suite created.
    for (const id of ids) {
      await prisma.backgroundJob.deleteMany({
        where: { payload: { path: ["orderId"], equals: id } },
      });
    }
  }
  await prisma.order.deleteMany({ where: { clientIdempotencyKey: { startsWith: PREFIX } } });
  // The throwaway counter row these tests allocate from (see FUTURE_BUSINESS_DATE).
  await prisma.orderNumberCounter.deleteMany({
    where: { businessDate: new Date(`${FUTURE_BUSINESS_DATE}T00:00:00.000Z`) },
  });
}

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await cleanup();
});

after(cleanup);

let seq = 0;

/** An order already claimed by someone else, with the claim aged by `claimAgeMs`. */
async function claimedOrder(claimAgeMs: number) {
  seq += 1;
  const unique = `${PREFIX}${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
  const order = await prisma.order.create({
    data: {
      customerFirstName: "Test",
      customerLastName: "Customer",
      customerPhone: "+17085550918",
      customerEmail: "test@example.com",
      subtotalCents: 1200,
      taxCents: 120,
      tipCents: 180,
      totalCents: TOTAL_CENTS,
      taxRateBps: 1000,
      taxAppliedPreDiscount: true,
      tipRateBps: 1500,
      paymentStatus: PaymentStatus.PENDING,
      status: OrderStatus.AWAITING_PAYMENT,
      estimatedReadyAt: new Date("2099-01-01T00:00:00.000Z"),
      lookupToken: unique,
      clientIdempotencyKey: unique,
      cartFingerprint: "fp-recovery",
      // Someone else already holds the claim — this is the losing request's view of the world.
      // Relative to the PINNED clock, not the wall clock, so claim age stays meaningful.
      chargeClaimedAt: new Date(FUTURE_NOW.getTime() - claimAgeMs),
    },
    include: { lines: true },
  });
  return order;
}

const AGED = CHARGE_RECOVERY_AFTER_MS + 5_000;
const YOUNG = 1_000;

/**
 * Every test that reaches PAID allocates a real order number, and `OrderNumberCounter` is
 * gap-free and never rolls back — deleting the order in cleanup does NOT return its number. Run
 * on the wall clock, this file burns numbers out of the store's live counter on every run, so a
 * real order the next morning jumps by however many times the suite ran.
 *
 * So the clock is pinned far into the future: allocation lands on a throwaway 2099 counter row,
 * which cleanup deletes. Same approach as order-numbers.test.ts. Never let this use Date.now().
 */
const FUTURE_BUSINESS_DATE = "2099-07-04";
const FUTURE_NOW = new Date("2099-07-04T18:00:00.000Z");

function gatewaySale(overrides: Partial<NormalizedPayment> = {}): NormalizedPayment {
  return {
    paymentId: "txn_recovered",
    status: "completed",
    amountCents: TOTAL_CENTS,
    orderId: "unused",
    referenceId: "unused",
    createdAt: "2026-09-15T00:00:00",
    cardLast4: "1111",
    ...overrides,
  };
}

/** Records whether the gateway was contacted at all. */
function makeDeps(over: Partial<ChargeDeps> & { charged?: string[] } = {}): ChargeDeps {
  const charged = over.charged ?? [];
  return {
    createPayment: (async (input) => {
      charged.push(input.orderId);
      return {
        kind: "succeeded",
        paymentId: "txn_new_charge",
        amountCents: input.amountCents,
        status: "completed",
        rawStatus: "100",
        cardLast4: "1111",
      } satisfies PaymentOutcome;
    }) as ChargeDeps["createPayment"],
    findPaymentByOrderId: async () => null,
    now: () => FUTURE_NOW.getTime(),
    ...over,
  };
}

describe("recovery: a claim that may still be live", () => {
  it("NEVER charges, and never touches the claim, while the holder could still be in flight", async () => {
    // THE double-charge hole. A sale in flight has not been booked at the gateway yet, so
    // `findPaymentByOrderId` returns null — identical to "the request never arrived". Acting on
    // that ambiguity releases a live claim and charges a second time. Until the in-flight window
    // closes, the loser must do nothing at all.
    const order = await claimedOrder(YOUNG);
    const charged: string[] = [];
    let gatewayAsked = false;

    const result = await chargeExistingPending(
      order,
      "tok_test",
      makeDeps({
        charged,
        findPaymentByOrderId: async () => {
          gatewayAsked = true;
          return null;
        },
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(charged.length, 0, "no second charge");
    assert.equal(gatewayAsked, false, "a young claim is not even investigated");

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.ok(after.chargeClaimedAt, "the live claim survives");
    assert.equal(after.paymentStatus, PaymentStatus.PENDING, "no state was invented");
  });

  it("fails closed when the gateway cannot be reached", async () => {
    const order = await claimedOrder(AGED);
    const charged: string[] = [];

    const result = await chargeExistingPending(
      order,
      "tok_test",
      makeDeps({
        charged,
        findPaymentByOrderId: async () => {
          throw new Error("gateway unreachable");
        },
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(charged.length, 0, "unknown state must never authorise a charge");
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.ok(after.chargeClaimedAt, "the claim is kept for the reconciler");
  });
});

describe("recovery: an abandoned claim", () => {
  it("charges once when the gateway confirms the previous attempt never arrived", async () => {
    const order = await claimedOrder(AGED);
    const charged: string[] = [];

    const result = await chargeExistingPending(
      order,
      "tok_test",
      makeDeps({ charged, findPaymentByOrderId: async () => null }),
    );

    assert.equal(result.ok, true);
    assert.deepEqual(charged, [order.id], "exactly one charge");

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(after.processorPaymentId, "txn_new_charge");
    assert.equal(after.paymentStatus, PaymentStatus.CAPTURED);
    assert.equal(after.chargeClaimedAt, null, "the claim is retired once the payment id is set");
  });

  it("CONVERGES instead of charging when the gateway already has a matching sale", async () => {
    // The previous attempt succeeded and died before it could record the outcome. Finishing it
    // is the correct behaviour; charging again would take the money twice.
    const order = await claimedOrder(AGED);
    const charged: string[] = [];

    const result = await chargeExistingPending(
      order,
      "tok_test",
      makeDeps({ charged, findPaymentByOrderId: async () => gatewaySale() }),
    );

    assert.equal(result.ok, true);
    assert.equal(charged.length, 0, "a recovered sale must not be re-charged");

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(after.processorPaymentId, "txn_recovered");
    assert.equal(after.paymentStatus, PaymentStatus.CAPTURED);
    assert.ok(after.orderNumber, "the order reaches the kitchen");
  });

  it("raises a manager alert and refuses to act when the recovered sale is for a different amount", async () => {
    const order = await claimedOrder(AGED);
    const charged: string[] = [];

    const result = await chargeExistingPending(
      order,
      "tok_test",
      makeDeps({
        charged,
        findPaymentByOrderId: async () => gatewaySale({ amountCents: TOTAL_CENTS - 100 }),
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(charged.length, 0, "never charge on top of a mismatched sale");

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.notEqual(after.paymentStatus, PaymentStatus.CAPTURED, "never mark paid on a mismatch");

    const alerts = await prisma.backgroundJob.findMany({
      where: {
        type: JobType.ALERT_MANAGER_PAYMENT_DISCREPANCY,
        payload: { path: ["orderId"], equals: order.id },
      },
    });
    assert.equal(alerts.length, 1, "a human is told");
  });

  it("records the payment id but stays unresolved when the recovered sale is not complete", async () => {
    const order = await claimedOrder(AGED);
    const charged: string[] = [];

    const result = await chargeExistingPending(
      order,
      "tok_test",
      makeDeps({
        charged,
        findPaymentByOrderId: async () => gatewaySale({ status: "failed" }),
      }),
    );

    assert.equal(result.ok, false);
    assert.equal(charged.length, 0);

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(after.processorPaymentId, "txn_recovered", "the pointer is kept for reconciliation");
    assert.equal(after.paymentStatus, PaymentStatus.UNKNOWN);
  });
});

describe("a definite decline is reported as a decline, not as an unknown outcome", () => {
  it("surfaces the gateway's specific reason and does not strand the order", async () => {
    // What a customer sees when the card is genuinely refused. This must NOT share wording with
    // the ambiguous path: a decline is definite, so telling them to wait and check their email
    // would stop them simply trying another card.
    const order = await claimedOrder(AGED);
    const charged: string[] = [];

    const result = await chargeExistingPending(
      order,
      "tok_test",
      makeDeps({
        charged,
        createPayment: (async (input) => {
          charged.push(input.orderId);
          return {
            kind: "declined",
            paymentId: "txn_declined",
            reason: "Your card has insufficient funds for this purchase.",
            code: "INSUFFICIENT_FUNDS",
          };
        }) as ChargeDeps["createPayment"],
      }),
    );

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.code, ApiErrorCode.PAYMENT_DECLINED);
    assert.match(result.message, /insufficient funds/i);
    assert.doesNotMatch(result.message, /couldn't confirm/i, "a decline is never ambiguous copy");
    assert.equal(charged.length, 1);

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(after.paymentStatus, PaymentStatus.FAILED);
    assert.equal(after.chargeClaimedAt, null, "a decline frees the order for another card");
  });

  it("replays a previous decline as a decline rather than as an unknown outcome", async () => {
    const order = await claimedOrder(AGED);
    await chargeExistingPending(
      order,
      "tok_test",
      makeDeps({
        createPayment: (async () => ({
          kind: "declined",
          paymentId: "txn_declined",
          reason: "Your card was declined. Please try a different payment method.",
          code: "CARD_DECLINED",
        })) as ChargeDeps["createPayment"],
      }),
    );

    const reloaded = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { lines: true },
    });
    const replay = await chargeExistingPending(reloaded, "tok_test", makeDeps());
    assert.equal(replay.ok, false);
    if (replay.ok) throw new Error("unreachable");
    assert.equal(replay.code, ApiErrorCode.PAYMENT_DECLINED);
    assert.match(replay.message, /declined/i);
  });
});

describe("the ambiguous path says WHY, without claiming to know the outcome", () => {
  it("attaches a machine-readable reason a human can act on", async () => {
    const order = await claimedOrder(AGED);
    const result = await chargeExistingPending(
      order,
      "tok_test",
      makeDeps({
        createPayment: (async () => ({
          kind: "transport_failure",
          message: "Could not reach the payment processor.",
          paymentId: null,
        })) as ChargeDeps["createPayment"],
      }),
    );

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.code, ApiErrorCode.PAYMENT_FAILED);
    assert.equal(result.details?.reason, AmbiguousPaymentReason.GATEWAY_UNCONFIRMED);
    // The customer-facing sentence must not mention texts: SMS was removed in Sprint 18.
    assert.doesNotMatch(result.message, /text/i);
  });

  it("names a live claim distinctly from a gateway that never answered", async () => {
    const order = await claimedOrder(YOUNG);
    const result = await chargeExistingPending(order, "tok_test", makeDeps());
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.details?.reason, AmbiguousPaymentReason.CHARGE_IN_PROGRESS);
  });
});

describe("recovery: an order that no longer needs charging", () => {
  it("replays a paid order rather than charging it again", async () => {
    const order = await claimedOrder(AGED);
    await prisma.order.update({
      where: { id: order.id },
      data: { processorPaymentId: "txn_done", paymentStatus: PaymentStatus.CAPTURED },
    });
    const charged: string[] = [];

    const result = await chargeExistingPending(
      { ...order, processorPaymentId: "txn_done" },
      "tok_test",
      makeDeps({ charged }),
    );

    assert.equal(result.ok, true);
    assert.equal(charged.length, 0);
    assert.equal((await claimOrderForCharge(order.id)).kind, "already_charged");
  });
});
