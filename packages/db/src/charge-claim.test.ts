// SPRINT-17: the charge claim — the whole double-charge defence under NMI.
//
// Square deduplicated on an idempotency key, so a racing or repeated `createPayment` was free.
// NMI has no such field, and this account's processor REJECTS `dup_seconds` outright, so a
// second call to the gateway for one order takes a second payment from a real customer. These
// tests exercise the conditional UPDATE that makes that impossible, against a real PostgreSQL —
// the guarantee is a database concurrency property, and a mocked prisma would assert nothing.
//
// Like the Sprint 16 payment tests, these do NOT green-skip when Postgres is unreachable. A
// payment-path guarantee that silently passes because nothing ran is worse than no test.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { OrderStatus, PaymentStatus } from "@harolds/types";
import { prisma } from "./client";
import { claimOrderForCharge, releaseChargeClaim, recordProcessorPaymentId } from "./repositories/orders";
import { markOrderPaymentFailed, markOrderPaymentUnknown } from "./repositories/orders";

const PREFIX = "s17-claim-";

async function cleanup(): Promise<void> {
  await prisma.order.deleteMany({ where: { clientIdempotencyKey: { startsWith: PREFIX } } });
}

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await cleanup();
});

// No `beforeEach` and no `$disconnect` here. Both are module-scoped, and the db package runs
// its test files in ONE process (`tsx --test src/**/*.test.ts`), so either would reach across
// into the other suites — disconnecting the client out from under them.
after(cleanup);

let seq = 0;

async function makePendingOrder(overrides: Record<string, unknown> = {}) {
  seq += 1;
  const unique = `${PREFIX}${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.order.create({
    data: {
      customerFirstName: "Test",
      customerLastName: "Customer",
      customerPhone: "+17085550917",
      customerEmail: "test@example.com",
      smsConsent: false,
      smsConsentAt: null,
      subtotalCents: 1200,
      taxCents: 120,
      tipCents: 180,
      totalCents: 1500,
      taxRateBps: 1000,
      taxAppliedPreDiscount: true,
      tipRateBps: 1500,
      paymentStatus: PaymentStatus.PENDING,
      status: OrderStatus.AWAITING_PAYMENT,
      estimatedReadyAt: new Date("2099-01-01T00:00:00.000Z"),
      lookupToken: unique,
      clientIdempotencyKey: unique,
      cartFingerprint: "fp-claim",
      ...overrides,
    },
  });
}

describe("claimOrderForCharge", () => {
  it("grants the claim on a pending, unclaimed, uncharged order", async () => {
    const order = await makePendingOrder();
    const claim = await claimOrderForCharge(order.id);

    assert.equal(claim.kind, "claimed");
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.ok(after.chargeClaimedAt, "the claim is recorded on the row");
  });

  it("grants the claim to exactly ONE of two concurrent attempts", async () => {
    // The whole point. Both callers read an identical pending order and both try to charge it;
    // PostgreSQL must let only one through. If this ever fails, customers are charged twice.
    const order = await makePendingOrder();

    const results = await Promise.all([
      claimOrderForCharge(order.id),
      claimOrderForCharge(order.id),
      claimOrderForCharge(order.id),
      claimOrderForCharge(order.id),
      claimOrderForCharge(order.id),
    ]);

    const claimed = results.filter((r) => r.kind === "claimed");
    assert.equal(claimed.length, 1, "exactly one caller may contact the gateway");
    for (const loser of results.filter((r) => r.kind !== "claimed")) {
      assert.equal(loser.kind, "in_flight", "losers see the claim as in flight, not chargeable");
    }
  });

  it("refuses an order that already carries a payment id", async () => {
    const order = await makePendingOrder();
    await recordProcessorPaymentId(order.id, "txn_already");

    const claim = await claimOrderForCharge(order.id);
    assert.equal(claim.kind, "already_charged");
  });

  it("refuses an order whose payment has already resolved", async () => {
    // Deliberately NOT a PAID/CAPTURED fixture. A paid order with no kitchen acknowledgement is
    // swept by `enqueueUnacknowledgedKitchenAlerts`, whose count is global — leaving one behind
    // makes an unrelated suite fail depending on file order. A declined and a cancelled order
    // exercise the same branch without creating work for the kitchen sweep.
    const declined = await makePendingOrder({ paymentStatus: PaymentStatus.FAILED });
    assert.equal((await claimOrderForCharge(declined.id)).kind, "not_chargeable");

    const cancelled = await makePendingOrder({ status: OrderStatus.CANCELLED });
    assert.equal((await claimOrderForCharge(cancelled.id)).kind, "not_chargeable");
  });

  it("a DECLINED order is not_chargeable, even though it carries a transaction id", async () => {
    // NMI returns a `transactionid` on declines as well as approvals, and we keep it so the
    // failure stays traceable. Checking `processorPaymentId` before `paymentStatus` therefore
    // reported a declined order as `already_charged`, and the caller replayed it to the customer
    // as a successfully placed order they had never paid for.
    const order = await makePendingOrder();
    await claimOrderForCharge(order.id);
    await markOrderPaymentFailed(order.id, {
      processorPaymentId: "txn_declined_but_real",
      reason: "Your card was declined. Please try a different payment method.",
    });

    const claim = await claimOrderForCharge(order.id);
    assert.equal(claim.kind, "not_chargeable", "a decline is never 'already charged'");
  });

  it("reports a missing order rather than throwing", async () => {
    assert.equal((await claimOrderForCharge("ord_does_not_exist")).kind, "not_found");
  });
});

describe("claim lifecycle", () => {
  it("recordProcessorPaymentId clears the claim", async () => {
    // The payment id is the stronger guard from here on, so leaving the claim set would strand
    // a perfectly healthy order in the recovery path forever.
    const order = await makePendingOrder();
    await claimOrderForCharge(order.id);
    await recordProcessorPaymentId(order.id, "txn_ok");

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(after.chargeClaimedAt, null);
    assert.equal(after.processorPaymentId, "txn_ok");
  });

  it("a decline releases the claim — no money moved, so a retry is safe", async () => {
    const order = await makePendingOrder();
    await claimOrderForCharge(order.id);
    await markOrderPaymentFailed(order.id, { reason: "Your card was declined." });

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(after.chargeClaimedAt, null, "a definite decline frees the order");
  });

  it("an UNKNOWN outcome KEEPS the claim — money may have moved", async () => {
    // This is the case the whole design exists for. Releasing here would re-open the order to a
    // second sale for money that may already have left the customer's account.
    const order = await makePendingOrder();
    await claimOrderForCharge(order.id);
    await markOrderPaymentUnknown(order.id, { processorPaymentId: null });

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.ok(after.chargeClaimedAt, "an indeterminate outcome must not free the order");
    assert.equal(after.paymentStatus, PaymentStatus.UNKNOWN);
  });
});

describe("releaseChargeClaim", () => {
  it("frees an unpaid order so it can be reclaimed", async () => {
    const order = await makePendingOrder();
    const claim = await claimOrderForCharge(order.id);
    assert.equal(claim.kind, "claimed");
    const claimedAt = (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .chargeClaimedAt!;

    assert.equal(await releaseChargeClaim(order.id, claimedAt), true);
    const reclaim = await claimOrderForCharge(order.id);
    assert.equal(reclaim.kind, "claimed", "a released order is chargeable again");
  });

  it("REFUSES to free a claim it did not observe", async () => {
    // The double-charge hole this closes: request B sees A's claim, finds no gateway record
    // (because A's sale is still in flight and unbooked), and tries to release. Matching the
    // exact timestamp means B can only ever clear the claim it actually saw — so a claim taken
    // or retaken since B looked survives, and A keeps its exclusive right to charge.
    const order = await makePendingOrder();
    await claimOrderForCharge(order.id);

    const staleTimestamp = new Date(Date.now() - 60_000);
    assert.equal(await releaseChargeClaim(order.id, staleTimestamp), false);

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.ok(after.chargeClaimedAt, "the live claim is untouched");
    assert.equal((await claimOrderForCharge(order.id)).kind, "in_flight");
  });

  it("REFUSES to free an order that has a payment id", async () => {
    // Releasing a charged order is a licence to charge it twice, so the release is conditional
    // on the order still being unpaid — even when a caller asks for it directly.
    const order = await makePendingOrder();
    await claimOrderForCharge(order.id);
    await prisma.order.update({
      where: { id: order.id },
      data: { processorPaymentId: "txn_landed", chargeClaimedAt: new Date() },
    });

    const claimedAt = (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .chargeClaimedAt!;
    assert.equal(await releaseChargeClaim(order.id, claimedAt), false);

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.ok(after.chargeClaimedAt, "a charged order stays claimed");
    assert.equal((await claimOrderForCharge(order.id)).kind, "already_charged");
  });
});
