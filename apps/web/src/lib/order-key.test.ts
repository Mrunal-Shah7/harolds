// SPRINT-16 Phase 2: the derived idempotency key — Phase 1's reproduction, inverted.
//
// The Phase 1 suite (payment-integrity.test.ts) demonstrates that a remount mints a fresh key and
// so produces a second chargeable order. These tests prove the derivation closes that, and that
// it does NOT close the case it must not: a customer who genuinely changes their cart.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@harolds/db";
import { OrderStatus, PaymentStatus } from "@harolds/types";
import { cartFingerprint } from "./checkout";
import { canonicaliseOrderPayload, deriveIdempotencyKey, newSessionNonce } from "./order-key";

const PREFIX = "hc1-";

async function cleanup(): Promise<void> {
  await prisma.order.deleteMany({ where: { lookupToken: { startsWith: "s16key-" } } });
}

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await cleanup();
});
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

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

const CUSTOMER = {
  firstName: "Test",
  lastName: "Customer",
  phone: "+17085550916",
  email: "Test@Example.com",
  smsConsent: false,
};

async function insertOrder(key: string, fingerprint: string, phone: string, paymentStatus: PaymentStatus) {
  return prisma.order.create({
    data: {
      customerFirstName: "Test",
      customerLastName: "Customer",
      customerPhone: phone,
      customerEmail: "test@example.com",
      smsConsent: false,
      subtotalCents: 1200,
      taxCents: 120,
      tipCents: 180,
      totalCents: 1500,
      taxRateBps: 1000,
      taxAppliedPreDiscount: true,
      tipRateBps: 1500,
      paymentStatus,
      status: OrderStatus.AWAITING_PAYMENT,
      estimatedReadyAt: new Date("2099-01-01T00:00:00.000Z"),
      lookupToken: `s16key-${Math.random().toString(16).slice(2)}`,
      clientIdempotencyKey: key,
      cartFingerprint: fingerprint,
    },
  });
}

describe("SPRINT-16 Phase 2: canonicalisation", () => {
  it("is order-independent — same content in a different order hashes identically", () => {
    const a = {
      lines: [
        { itemId: "b-item", quantity: 1, selectedOptionIds: ["o2", "o1"], customerNote: null },
        { itemId: "a-item", quantity: 2, selectedOptionIds: ["o3"], customerNote: null },
      ],
      tip: { type: "preset" as const, presetIndex: 1 },
    };
    const b = {
      lines: [
        { itemId: "a-item", quantity: 2, selectedOptionIds: ["o3"], customerNote: null },
        { itemId: "b-item", quantity: 1, selectedOptionIds: ["o1", "o2"], customerNote: null },
      ],
      tip: { type: "preset" as const, presetIndex: 1 },
    };
    assert.equal(canonicaliseOrderPayload(a, CUSTOMER), canonicaliseOrderPayload(b, CUSTOMER));
  });

  it("is content-sensitive — one changed modifier hashes differently", () => {
    const changed = {
      ...CART,
      lines: [{ ...CART.lines[0]!, selectedOptionIds: ["opt-hot", "opt-extra-bread"] }],
    };
    assert.notEqual(
      canonicaliseOrderPayload(CART, CUSTOMER),
      canonicaliseOrderPayload(changed, CUSTOMER),
    );
  });

  it("normalises email case and whitespace so trivia does not fork the key", () => {
    const messy = { ...CUSTOMER, email: "  TEST@example.COM  ", firstName: " Test " };
    assert.equal(canonicaliseOrderPayload(CART, CUSTOMER), canonicaliseOrderPayload(CART, messy));
  });
});

describe("SPRINT-16 Phase 2: key derivation", () => {
  it("the same inputs derive the same key (the derivation is deterministic)", async () => {
    const nonce = newSessionNonce();
    const before = await deriveIdempotencyKey(nonce, CART, CUSTOMER);
    const again = await deriveIdempotencyKey(nonce, CART, CUSTOMER);
    assert.equal(before, again);
    assert.ok(before.startsWith(PREFIX));
  });

  it("survives a REALISTIC reload, where the customer retypes their contact details", async () => {
    // The cart and the nonce come back from localStorage. The contact fields do NOT — they are
    // `useState("")` on the checkout form, so the customer types them again, and rarely
    // byte-identically. If retyping forked the key, the client half of the fix would do nothing
    // on the exact scenario it is named for.
    const nonce = newSessionNonce();
    const asTypedFirst = {
      firstName: "Test",
      lastName: "Customer",
      phone: "(708) 555-0916",
      email: "Test@Example.com",
      smsConsent: false,
    };
    const asRetyped = {
      firstName: "test ",
      lastName: " Customer",
      phone: "7085550916",
      email: "  test@example.com ",
      smsConsent: false,
    };

    assert.equal(
      await deriveIdempotencyKey(nonce, CART, asTypedFirst),
      await deriveIdempotencyKey(nonce, CART, asRetyped),
      "formatting, case and whitespace are not order identity",
    );
  });

  it("a genuinely different customer still derives a different key", async () => {
    const nonce = newSessionNonce();
    assert.notEqual(
      await deriveIdempotencyKey(nonce, CART, CUSTOMER),
      await deriveIdempotencyKey(nonce, CART, { ...CUSTOMER, phone: "+17085559999" }),
    );
  });

  it("a changed tip, quantity or contact derives a different key", async () => {
    const nonce = newSessionNonce();
    const base = await deriveIdempotencyKey(nonce, CART, CUSTOMER);
    assert.notEqual(
      base,
      await deriveIdempotencyKey(nonce, { ...CART, tip: { type: "preset", presetIndex: 2 } }, CUSTOMER),
      "a changed tip is a new order",
    );
    assert.notEqual(
      base,
      await deriveIdempotencyKey(nonce, { ...CART, lines: [{ ...CART.lines[0]!, quantity: 3 }] }, CUSTOMER),
      "a changed quantity is a new order",
    );
    assert.notEqual(
      base,
      await deriveIdempotencyKey(nonce, CART, { ...CUSTOMER, phone: "+17085559999" }),
      "a changed contact is a new order",
    );
  });

  it("a rotated nonce derives a different key, so the decline retry path still works", async () => {
    const a = await deriveIdempotencyKey(newSessionNonce(), CART, CUSTOMER);
    const b = await deriveIdempotencyKey(newSessionNonce(), CART, CUSTOMER);
    assert.notEqual(a, b);
  });
});

describe("SPRINT-16 Phase 2: Phase 1's defect is closed", () => {
  it("a reload after an ambiguous outcome matches the existing order instead of creating a second", async () => {
    const phone = "+17085550918";
    const customer = { ...CUSTOMER, phone };
    const nonce = newSessionNonce();
    const fingerprint = cartFingerprint(CART);

    const firstKey = await deriveIdempotencyKey(nonce, CART, customer);
    const first = await insertOrder(firstKey, fingerprint, phone, PaymentStatus.UNKNOWN);

    // The reload: the cart AND the nonce survive in localStorage, so the key is rederived.
    const secondKey = await deriveIdempotencyKey(nonce, CART, customer);
    assert.equal(secondKey, firstKey, "the rederived key is the same key");

    // This is checkoutOrder's first action. It now matches, so the replay block handles it and
    // the create path — and the second charge — is never reached.
    const match = await prisma.order.findUnique({ where: { clientIdempotencyKey: secondKey } });
    assert.notEqual(match, null);
    assert.equal(match!.id, first.id);

    const all = await prisma.order.findMany({ where: { customerPhone: phone } });
    assert.equal(all.length, 1, "one cart, one order — the double charge is not reachable");
  });
});
