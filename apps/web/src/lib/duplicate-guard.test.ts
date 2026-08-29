// SPRINT-16 Phase 4: the server-side duplicate-order guard — the actual guarantee.
//
// The derived key is client-side and therefore advisory. These tests exercise the guard against
// the real database, including the concurrency case, which is the only part that cannot be
// reasoned about from the code alone.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPendingOrderGuarded, prisma } from "@harolds/db";
import { OrderStatus, PaymentStatus, type QuoteResult } from "@harolds/types";

const TOKEN_PREFIX = "s16guard-";
const WINDOW_MS = 180_000;

async function cleanup(): Promise<void> {
  await prisma.order.deleteMany({ where: { lookupToken: { startsWith: TOKEN_PREFIX } } });
}

let menuItemId: string;

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await cleanup();
  const item = await prisma.menuItem.findFirst({ where: { isActive: true } });
  assert.ok(item, "the local database must be seeded — run pnpm db:seed:menu");
  menuItemId = item.id;
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

/** A minimal authoritative quote. The guard does not price anything; it only dedupes. */
function quoteFor(totalCents = 1500): QuoteResult {
  return {
    subtotalCents: 1200,
    taxCents: 120,
    totalCents,
    taxRateBps: 1000,
    taxAppliedPreDiscount: true,
    orderable: true,
    blockingReasons: [],
    estimatedReadyAt: new Date("2099-01-01T00:00:00.000Z").toISOString(),
    tip: { type: "preset", presetIndex: 1, rateBps: 1500, tipCents: 180 },
    lines: [
      {
        itemId: menuItemId,
        snapshot: {
          quantity: 1,
          itemName: "Half dark",
          boardLabel: "1/2 DARK",
          baseUnitPriceCents: 1200,
          modifierTotalCents: 0,
          effectiveUnitPriceCents: 1200,
          lineTotalCents: 1200,
          selectedModifiers: [],
          customerNote: null,
        },
      },
    ],
  } as unknown as QuoteResult;
}

let seq = 0;
function guardArgs(opts: { phone: string; fingerprint: string; key?: string; totalCents?: number }) {
  seq += 1;
  return {
    quote: quoteFor(opts.totalCents),
    customer: {
      firstName: "Test",
      lastName: "Customer",
      phoneE164: opts.phone,
      email: "test@example.com",
      smsConsent: false,
      smsConsentAt: null,
    },
    clientIdempotencyKey: opts.key ?? `${TOKEN_PREFIX}${seq}-${Math.random().toString(16).slice(2)}`,
    cartFingerprint: opts.fingerprint,
    lookupToken: `${TOKEN_PREFIX}${seq}-${Math.random().toString(16).slice(2)}`,
    customerNote: null,
    guardWindowMs: WINDOW_MS,
  };
}

describe("SPRINT-16 Phase 4: the duplicate-order guard", () => {
  it("returns the existing order for a matching phone, signature and window", async () => {
    const phone = "+17085551001";
    const fingerprint = "fp-match-1";

    const first = await createPendingOrderGuarded(guardArgs({ phone, fingerprint }));
    assert.equal(first.kind, "created");

    // A different device: a different idempotency key entirely, which the client-side derivation
    // cannot help with. This is the case the guard exists for.
    const second = await createPendingOrderGuarded(guardArgs({ phone, fingerprint }));
    assert.equal(second.kind, "existing", "the second submission is collapsed onto the first");
    assert.equal(second.order.id, first.order.id);
    assert.ok(second.kind === "existing" && second.matchedAgeMs >= 0);

    const all = await prisma.order.findMany({ where: { customerPhone: phone } });
    assert.equal(all.length, 1, "exactly one order exists");
  });

  it("does NOT match a different cart from the same phone", async () => {
    const phone = "+17085551002";
    const a = await createPendingOrderGuarded(guardArgs({ phone, fingerprint: "fp-a" }));
    const b = await createPendingOrderGuarded(guardArgs({ phone, fingerprint: "fp-b" }));
    assert.equal(a.kind, "created");
    assert.equal(b.kind, "created", "a genuinely different cart is a genuinely new order");
    assert.notEqual(b.order.id, a.order.id);
  });

  it("does NOT match the same cart from a different phone", async () => {
    const fingerprint = "fp-shared";
    const a = await createPendingOrderGuarded(guardArgs({ phone: "+17085551003", fingerprint }));
    const b = await createPendingOrderGuarded(guardArgs({ phone: "+17085551004", fingerprint }));
    assert.equal(a.kind, "created");
    assert.equal(b.kind, "created");
  });

  it("does NOT match outside the window", async () => {
    const phone = "+17085551005";
    const fingerprint = "fp-window";
    const first = await createPendingOrderGuarded(guardArgs({ phone, fingerprint }));
    assert.equal(first.kind, "created");
    // Age the first order past the window rather than waiting three minutes.
    await prisma.order.update({
      where: { id: first.order.id },
      data: { createdAt: new Date(Date.now() - WINDOW_MS - 60_000) },
    });
    const second = await createPendingOrderGuarded(guardArgs({ phone, fingerprint }));
    assert.equal(second.kind, "created", "an order older than the window is not a duplicate");
  });

  it("does NOT match a DECLINED order — the customer must be able to retry with another card", async () => {
    const phone = "+17085551006";
    const fingerprint = "fp-declined";
    const first = await createPendingOrderGuarded(guardArgs({ phone, fingerprint }));
    await prisma.order.update({
      where: { id: first.order.id },
      data: { paymentStatus: PaymentStatus.FAILED, paymentFailureReason: "Card declined." },
    });

    const retry = await createPendingOrderGuarded(guardArgs({ phone, fingerprint }));
    assert.equal(
      retry.kind,
      "created",
      "a decline is definite: collapsing the retry onto it would trap the customer on a dead order",
    );
  });

  it("does NOT match a cancelled order", async () => {
    const phone = "+17085551007";
    const fingerprint = "fp-cancelled";
    const first = await createPendingOrderGuarded(guardArgs({ phone, fingerprint }));
    await prisma.order.update({
      where: { id: first.order.id },
      data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
    });
    const again = await createPendingOrderGuarded(guardArgs({ phone, fingerprint }));
    assert.equal(again.kind, "created");
  });

  it("does NOT match a refunded order", async () => {
    const phone = "+17085551008";
    const fingerprint = "fp-refunded";
    const first = await createPendingOrderGuarded(guardArgs({ phone, fingerprint }));
    await prisma.order.update({
      where: { id: first.order.id },
      data: { paymentStatus: PaymentStatus.CAPTURED, refundedCents: 1500 },
    });
    const again = await createPendingOrderGuarded(guardArgs({ phone, fingerprint }));
    assert.equal(again.kind, "created");
  });

  it("matches an order whose payment outcome is UNKNOWN — the case worth collapsing", async () => {
    const phone = "+17085551009";
    const fingerprint = "fp-unknown";
    const first = await createPendingOrderGuarded(guardArgs({ phone, fingerprint }));
    await prisma.order.update({
      where: { id: first.order.id },
      data: { paymentStatus: PaymentStatus.UNKNOWN },
    });
    const second = await createPendingOrderGuarded(guardArgs({ phone, fingerprint }));
    assert.equal(second.kind, "existing", "never fire a second charge against an unknown outcome");
    assert.equal(second.order.id, first.order.id);
  });

  it("TWO CONCURRENT IDENTICAL REQUESTS PRODUCE EXACTLY ONE ORDER", async () => {
    const phone = "+17085551010";
    const fingerprint = "fp-concurrent";

    // Fired together, with different idempotency keys — two tabs, or two devices. Without the
    // advisory lock both would pass the lookup and both would insert.
    const [a, b] = await Promise.all([
      createPendingOrderGuarded(guardArgs({ phone, fingerprint })),
      createPendingOrderGuarded(guardArgs({ phone, fingerprint })),
    ]);

    const kinds = [a.kind, b.kind].sort();
    assert.deepEqual(kinds, ["created", "existing"], "one created, one collapsed");
    assert.equal(a.order.id, b.order.id, "both submissions resolve to the same order");

    const all = await prisma.order.findMany({ where: { customerPhone: phone } });
    assert.equal(all.length, 1, "exactly one order row exists");
  });
});
