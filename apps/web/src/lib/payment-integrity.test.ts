// SPRINT-16: payment integrity — the double-charge reproduction and its fix.
//
// PHASE 1 writes the reproduction FIRST (Critical rule 7). The `reproduction` suite asserts the
// DEFECTIVE behaviour and is expected to PASS against pre-fix code — that pass is the evidence
// the defect is real. Phase 2 inverts it into the `fixed` suite below.
//
// READ THIS BEFORE BEING ALARMED. This file SIMULATES THE PRE-FIX CLIENT — `legacyMintedKey()`
// reproduces the old `useState(newIdempotencyKey)` behaviour and inserts orders directly. It does
// NOT exercise the current code path, so the assertion that one cart yields TWO orders is a
// frozen record of the defect, not a live one. The inversion — one cart, one order, against the
// real derivation — is in order-key.test.ts, and the server-side guarantee is in
// duplicate-guard.test.ts.
//
// Unlike the Sprint 8 refund tests, these do NOT green-skip when Postgres is unreachable. A
// payment-path guarantee that silently passes because nothing ran is worse than no test.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@harolds/db";
import { OrderStatus, PaymentStatus } from "@harolds/types";
import { cartFingerprint, paymentCorrelationId } from "./checkout";

const PREFIX = "s16-";

async function cleanup(): Promise<void> {
  await prisma.order.deleteMany({ where: { clientIdempotencyKey: { startsWith: PREFIX } } });
}

before(async () => {
  // Fail loudly rather than skipping. See the header note.
  await prisma.$queryRaw`SELECT 1`;
  await cleanup();
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const sequence = 916_000;

/** The client's pre-Sprint-16 key: a fresh random value on every component mount. */
function legacyMintedKey(): string {
  return `${PREFIX}hc-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Stands in for `createPendingOrder` + the charge attempt. We insert directly so the test needs
 * no priced quote and no gateway call — the mechanism under test is the idempotency lookup, not
 * the pricing path.
 */
async function createOrderAttempt(args: {
  clientIdempotencyKey: string;
  fingerprint: string;
  phone: string;
  paymentStatus?: PaymentStatus;
  totalCents?: number;
}) {
  return prisma.order.create({
    data: {
      orderNumber: null,
      orderSequence: null,
      businessDate: null,
      customerFirstName: "Test",
      customerLastName: "Customer",
      customerPhone: args.phone,
      customerEmail: "test@example.com",
      smsConsent: false,
      smsConsentAt: null,
      subtotalCents: 1200,
      taxCents: 120,
      tipCents: 180,
      totalCents: args.totalCents ?? 1500,
      taxRateBps: 1000,
      taxAppliedPreDiscount: true,
      tipRateBps: 1500,
      paymentStatus: args.paymentStatus ?? PaymentStatus.PENDING,
      status: OrderStatus.AWAITING_PAYMENT,
      estimatedReadyAt: new Date("2099-01-01T00:00:00.000Z"),
      lookupToken: `${PREFIX}${Math.random().toString(16).slice(2)}${sequence}`,
      clientIdempotencyKey: args.clientIdempotencyKey,
      cartFingerprint: args.fingerprint,
    },
  });
}

const CART = {
  lines: [
    {
      itemId: "item-half-dark",
      quantity: 1,
      selectedOptionIds: ["opt-mild", "opt-extra-bread"],
      customerNote: null,
    },
  ],
  tip: { type: "preset" as const, presetIndex: 1 },
};

// ---------------------------------------------------------------------------
// PHASE 1 — the reproduction. These assertions describe the DEFECT.
// ---------------------------------------------------------------------------
describe("SPRINT-16 Phase 1 reproduction: the reachable double charge", () => {
  it("a reload after PAYMENT_FAILED mints a new key, matches nothing, and yields a second chargeable order", async () => {
    const phone = "+17085550916";
    const fingerprint = cartFingerprint(CART);

    // Attempt 1: the customer pays, the gateway returns transport_failure, and checkout.ts calls
    // markOrderPaymentUnknown — PaymentStatus.UNKNOWN. The screen says PAYMENT_FAILED.
    const firstKey = legacyMintedKey();
    const first = await createOrderAttempt({
      clientIdempotencyKey: firstKey,
      fingerprint,
      phone,
      paymentStatus: PaymentStatus.UNKNOWN,
    });

    // The customer reloads. The cart survives in localStorage; the key does not, because it is
    // `useState(newIdempotencyKey)` and a remount mints a fresh one.
    const secondKey = legacyMintedKey();
    assert.notEqual(secondKey, firstKey, "a remount mints a different key — this is the defect");

    // checkoutOrder's first action is this lookup. With a fresh key it matches nothing, so the
    // whole replay block is skipped and a new order is created.
    const replayCandidate = await prisma.order.findUnique({
      where: { clientIdempotencyKey: secondKey },
    });
    assert.equal(replayCandidate, null, "the fresh key matches no existing order");

    const second = await createOrderAttempt({
      clientIdempotencyKey: secondKey,
      fingerprint,
      phone,
    });

    // Two orders for one cart. Under Square the two distinct idempotency keys were the reason
    // the processor could not collapse them; under NMI there is no gateway-side dedupe AT ALL,
    // so the per-order correlation ids differing merely confirms these are separate charges.
    assert.notEqual(second.id, first.id, "a second order exists for the same cart");
    assert.notEqual(
      paymentCorrelationId(second.id),
      paymentCorrelationId(first.id),
      "separate orders charge separately — the gateway cannot dedupe them",
    );

    const orders = await prisma.order.findMany({
      where: { customerPhone: phone, clientIdempotencyKey: { startsWith: PREFIX } },
    });
    assert.equal(orders.length, 2, "DEFECT REPRODUCED: one cart produced two chargeable orders");
  });

  it("the cart survives a reload but the idempotency key does not — the asymmetry that causes it", () => {
    // The cart is persisted under `harolds.cart.v1` by lib/cart-context.tsx. The idempotency key
    // is component state. Same content therefore yields a different key on every mount.
    const beforeReload = legacyMintedKey();
    const afterReload = legacyMintedKey();
    const cartUnchanged = cartFingerprint(CART) === cartFingerprint(CART);

    assert.equal(cartUnchanged, true, "the cart is byte-identical across the reload");
    assert.notEqual(beforeReload, afterReload, "but the key is not — nothing ties it to the cart");
  });
});

// ---------------------------------------------------------------------------
// PHASE 1 — the case the fix must NOT break.
// ---------------------------------------------------------------------------
describe("SPRINT-16 Phase 1: a deliberately changed cart must still create a new order", () => {
  it("changing a modifier changes the fingerprint", () => {
    const changed = {
      ...CART,
      lines: [{ ...CART.lines[0]!, selectedOptionIds: ["opt-hot", "opt-extra-bread"] }],
    };
    assert.notEqual(
      cartFingerprint(CART),
      cartFingerprint(changed),
      "a different modifier must be a different cart",
    );
  });

  it("changing the tip changes the fingerprint", () => {
    const changed = { ...CART, tip: { type: "preset" as const, presetIndex: 2 } };
    assert.notEqual(cartFingerprint(CART), cartFingerprint(changed), "a different tip is a different cart");
  });

  it("a changed cart creates a genuinely separate order", async () => {
    const phone = "+17085550917";
    const firstFingerprint = cartFingerprint(CART);
    const changedCart = { ...CART, lines: [{ ...CART.lines[0]!, quantity: 3 }] };
    const changedFingerprint = cartFingerprint(changedCart);
    assert.notEqual(firstFingerprint, changedFingerprint);

    const first = await createOrderAttempt({
      clientIdempotencyKey: legacyMintedKey(),
      fingerprint: firstFingerprint,
      phone,
      paymentStatus: PaymentStatus.FAILED,
    });
    const second = await createOrderAttempt({
      clientIdempotencyKey: legacyMintedKey(),
      fingerprint: changedFingerprint,
      phone,
      totalCents: 4500,
    });

    assert.notEqual(second.id, first.id);
    assert.notEqual(second.cartFingerprint, first.cartFingerprint);
  });
});
