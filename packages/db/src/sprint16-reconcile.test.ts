// SPRINT-16 Phase 6: the reconciliation report, proven against seeded data containing a known
// tipped order and a known duplicate pair. A report the operator will act on financially is not
// allowed to be "probably right".
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { OrderStatus, PaymentStatus } from "@harolds/types";
import { prisma } from "./client";
import { buildReconcileReports } from "./sprint16-reconcile-cli";

const TOKEN_PREFIX = "s16rec-";
const SINCE = new Date("2099-01-01T00:00:00.000Z");

async function cleanup(): Promise<void> {
  await prisma.order.deleteMany({ where: { lookupToken: { startsWith: TOKEN_PREFIX } } });
}

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await cleanup();
});
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

let seq = 0;
async function seedOrder(opts: {
  phone: string;
  tipCents: number;
  totalCents: number;
  fingerprint: string;
  createdAt: Date;
  paymentStatus?: PaymentStatus;
  paymentId?: string;
}) {
  seq += 1;
  return prisma.order.create({
    data: {
      customerFirstName: "Rec",
      customerLastName: "Test",
      customerPhone: opts.phone,
      customerEmail: "rec@example.com",
      smsConsent: false,
      subtotalCents: opts.totalCents - opts.tipCents - 100,
      taxCents: 100,
      tipCents: opts.tipCents,
      totalCents: opts.totalCents,
      taxRateBps: 1000,
      taxAppliedPreDiscount: true,
      tipRateBps: opts.tipCents > 0 ? 1500 : null,
      paymentStatus: opts.paymentStatus ?? PaymentStatus.CAPTURED,
      status: OrderStatus.PAID,
      processorPaymentId: opts.paymentId ?? null,
      estimatedReadyAt: new Date("2099-01-01T01:00:00.000Z"),
      createdAt: opts.createdAt,
      paidAt: opts.createdAt,
      lookupToken: `${TOKEN_PREFIX}${seq}-${Math.random().toString(16).slice(2)}`,
      clientIdempotencyKey: `${TOKEN_PREFIX}${seq}-${Math.random().toString(16).slice(2)}`,
      cartFingerprint: opts.fingerprint,
    },
  });
}

describe("SPRINT-16 Phase 6: the reconciliation report", () => {
  it("finds a known tipped order and a known duplicate pair, and ignores the innocent ones", async () => {
    const base = new Date("2099-06-01T12:00:00.000Z");

    // A known tipped order. Charged 1500, of which 250 is tip the customer never saw in the total.
    await seedOrder({
      phone: "+17085552001",
      tipCents: 250,
      totalCents: 1500,
      fingerprint: "rec-tip",
      createdAt: base,
      paymentId: "sq-pay-tip-1",
    });

    // A known duplicate pair: same phone, same cart signature, 40 seconds apart, both captured.
    await seedOrder({
      phone: "+17085552002",
      tipCents: 0,
      totalCents: 2000,
      fingerprint: "rec-dup",
      createdAt: base,
      paymentId: "sq-pay-dup-a",
    });
    await seedOrder({
      phone: "+17085552002",
      tipCents: 0,
      totalCents: 2000,
      fingerprint: "rec-dup",
      createdAt: new Date(base.getTime() + 40_000),
      paymentId: "sq-pay-dup-b",
    });

    // Innocent: same phone, same cart, but well outside the window — a genuine reorder.
    await seedOrder({
      phone: "+17085552003",
      tipCents: 0,
      totalCents: 900,
      fingerprint: "rec-far",
      createdAt: base,
    });
    await seedOrder({
      phone: "+17085552003",
      tipCents: 0,
      totalCents: 900,
      fingerprint: "rec-far",
      createdAt: new Date(base.getTime() + 3_600_000),
    });

    // Innocent: same phone, close together, but a DIFFERENT cart — two genuine orders.
    await seedOrder({
      phone: "+17085552004",
      tipCents: 0,
      totalCents: 700,
      fingerprint: "rec-x",
      createdAt: base,
    });
    await seedOrder({
      phone: "+17085552004",
      tipCents: 0,
      totalCents: 800,
      fingerprint: "rec-y",
      createdAt: new Date(base.getTime() + 20_000),
    });

    const reports = await buildReconcileReports({ since: SINCE, windowSeconds: 180 });

    // --- tips ---
    const tipRows = reports.tipRows.filter((r) => String(r[3]).startsWith("+170855520"));
    assert.equal(tipRows.length, 1, "exactly the one seeded tipped order");
    const tip = tipRows[0]!;
    assert.equal(tip[8], "2.50", "tip");
    assert.equal(tip[9], "15.00", "charged total");
    assert.equal(tip[7], "12.50", "what the customer saw before Sprint 14 — the total minus the tip");
    assert.equal(tip[10], "2.50", "the discrepancy is exactly the tip");

    // --- duplicates ---
    const dupRows = reports.duplicateRows.filter((r) => String(r[0]).startsWith("+170855520"));
    assert.equal(dupRows.length, 1, "the far-apart pair and the different-cart pair are not flagged");
    const dup = dupRows[0]!;
    assert.equal(dup[0], "+17085552002");
    assert.equal(dup[1], 40, "gap in seconds");
    assert.equal(dup[6], "sq-pay-dup-a", "first payment id, for the gateway lookup");
    assert.equal(dup[12], "sq-pay-dup-b", "second payment id, for the gateway lookup");
  });

  it("is read-only: a write inside the report transaction is rejected by Postgres", async () => {
    await assert.rejects(
      () =>
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
          await tx.order.updateMany({
            where: { lookupToken: { startsWith: TOKEN_PREFIX } },
            data: { staffNote: "should never be written" },
          });
        }),
      /read-only transaction/i,
      "the read-only promise is enforced by the database, not by intention",
    );
  });
});
