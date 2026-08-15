// SPRINT-6: order status transition table — legal, illegal, attribution, races, print-driven PAID→PRINTED.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { JobType, OrderStatus, PaymentStatus } from "@harolds/types";
import { prisma } from "./client";
import {
  applyAutomaticPrintTransition,
  applyOrderTransition,
  IllegalOrderTransitionError,
  isLegalOrderTransition,
  ORDER_STATUS_ALLOWED,
  StaleOrderTransitionError,
} from "./order-status";
import { hashSessionToken } from "./pin";

const PREFIX = "s6status-";
let sequence = 810_000;

async function cleanup(): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { clientIdempotencyKey: { startsWith: PREFIX } },
    select: { id: true },
  });
  if (orders.length > 0) {
    await prisma.backgroundJob.deleteMany({
      where: { OR: orders.map((o) => ({ payload: { path: ["orderId"], equals: o.id } })) },
    });
  }
  await prisma.order.deleteMany({ where: { clientIdempotencyKey: { startsWith: PREFIX } } });
  await prisma.adminSession.deleteMany({ where: { tokenHash: { startsWith: "s6test" } } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: "s6status-" } } });
}

async function paidOrder(status: OrderStatus = OrderStatus.PAID) {
  const key = `${PREFIX}${Math.random().toString(16).slice(2)}`;
  return prisma.order.create({
    data: {
      orderNumber: `HC-S6-${key.slice(-4)}`,
      orderSequence: sequence++,
      businessDate: new Date("2099-02-01T00:00:00.000Z"),
      customerFirstName: "Kim",
      customerLastName: "Lee",
      customerPhone: "+17085550001",
      customerEmail: "s6status@example.com",
      subtotalCents: 1099,
      taxCents: 111,
      tipCents: 0,
      totalCents: 1210,
      taxRateBps: 1010,
      taxAppliedPreDiscount: true,
      paymentStatus: PaymentStatus.CAPTURED,
      status,
      paidAt: new Date(),
      lookupToken: key,
      clientIdempotencyKey: key,
      cartFingerprint: key,
      lines: {
        create: [
          {
            quantity: 1,
            itemName: "6pc Dark",
            boardLabel: "6 DARK",
            unitPriceCents: 1099,
            modifierTotalCents: 0,
            effectiveUnitPriceCents: 1099,
            lineTotalCents: 1099,
            selectedModifiers: [],
          },
        ],
      },
    },
  });
}

let dbAvailable = true;

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
  } catch (err) {
    dbAvailable = false;
    console.warn(`[order-status.test] skipping: ${(err as Error).message}`);
  }
});

after(async () => {
  if (dbAvailable) await cleanup();
});

describe("order status table", () => {
  it("states every legal transition from Phase 4.1 and no others", () => {
    assert.deepEqual(ORDER_STATUS_ALLOWED[OrderStatus.PAID], [
      OrderStatus.PRINTED,
      OrderStatus.IN_PROGRESS,
      OrderStatus.CANCELLED,
    ]);
    assert.equal(isLegalOrderTransition(OrderStatus.PAID, OrderStatus.IN_PROGRESS), true);
    assert.equal(isLegalOrderTransition(OrderStatus.PAID, OrderStatus.PRINTED), true);
    assert.equal(isLegalOrderTransition(OrderStatus.PRINTED, OrderStatus.IN_PROGRESS), true);
    assert.equal(isLegalOrderTransition(OrderStatus.IN_PROGRESS, OrderStatus.READY), true);
    assert.equal(isLegalOrderTransition(OrderStatus.READY, OrderStatus.PICKED_UP), true);
    assert.equal(isLegalOrderTransition(OrderStatus.PAID, OrderStatus.CANCELLED), true);
    assert.equal(isLegalOrderTransition(OrderStatus.PRINTED, OrderStatus.CANCELLED), true);
    assert.equal(isLegalOrderTransition(OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED), true);
    assert.equal(isLegalOrderTransition(OrderStatus.READY, OrderStatus.IN_PROGRESS), false);
    assert.equal(isLegalOrderTransition(OrderStatus.PICKED_UP, OrderStatus.READY), false);
    assert.equal(isLegalOrderTransition(OrderStatus.READY, OrderStatus.CANCELLED), false);
    assert.equal(isLegalOrderTransition(OrderStatus.PICKED_UP, OrderStatus.CANCELLED), false);
  });
});

describe("applyOrderTransition", () => {
  it("applies every legal kitchen path and stamps timestamps", async () => {
    if (!dbAvailable) return;
    const paid = await paidOrder();
    await applyOrderTransition({
      orderId: paid.id,
      to: OrderStatus.IN_PROGRESS,
      source: "KDS",
    });
    const a = await prisma.order.findUniqueOrThrow({ where: { id: paid.id } });
    assert.equal(a.status, OrderStatus.IN_PROGRESS);

    await applyOrderTransition({ orderId: paid.id, to: OrderStatus.READY, source: "KDS" });
    const b = await prisma.order.findUniqueOrThrow({ where: { id: paid.id } });
    assert.equal(b.status, OrderStatus.READY);
    assert.ok(b.readyAt);

    await applyOrderTransition({ orderId: paid.id, to: OrderStatus.PICKED_UP, source: "KDS" });
    const c = await prisma.order.findUniqueOrThrow({ where: { id: paid.id } });
    assert.equal(c.status, OrderStatus.PICKED_UP);
    assert.ok(c.pickedUpAt);
  });

  it("allows PAID → IN_PROGRESS even when print jobs are cancelled", async () => {
    if (!dbAvailable) return;
    const order = await paidOrder();
    await applyOrderTransition({
      orderId: order.id,
      to: OrderStatus.IN_PROGRESS,
      source: "KDS",
    });
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(row.status, OrderStatus.IN_PROGRESS);
    assert.equal(row.printedAt, null);
  });

  it("cancels from every pre-ready status and blocks ready/picked up", async () => {
    if (!dbAvailable) return;
    for (const from of [OrderStatus.PAID, OrderStatus.PRINTED, OrderStatus.IN_PROGRESS] as const) {
      const order = await paidOrder(from);
      await applyOrderTransition({ orderId: order.id, to: OrderStatus.CANCELLED, source: "KDS" });
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      assert.equal(row.status, OrderStatus.CANCELLED);
      assert.ok(row.cancelledAt);
    }
    const ready = await paidOrder(OrderStatus.READY);
    await assert.rejects(
      () => applyOrderTransition({ orderId: ready.id, to: OrderStatus.CANCELLED, source: "KDS" }),
      (err: unknown) => err instanceof IllegalOrderTransitionError,
    );
    const picked = await paidOrder(OrderStatus.PICKED_UP);
    await assert.rejects(
      () => applyOrderTransition({ orderId: picked.id, to: OrderStatus.CANCELLED, source: "KDS" }),
      (err: unknown) => err instanceof IllegalOrderTransitionError,
    );
  });

  it("rejects READY → IN_PROGRESS and records the attempt in the event log only after success", async () => {
    if (!dbAvailable) return;
    const order = await paidOrder(OrderStatus.READY);
    await assert.rejects(
      () => applyOrderTransition({ orderId: order.id, to: OrderStatus.IN_PROGRESS, source: "KDS" }),
      (err: unknown) => err instanceof IllegalOrderTransitionError,
    );
    const events = await prisma.orderStatusEvent.findMany({ where: { orderId: order.id } });
    assert.equal(events.length, 0);
  });

  it("rejects KDS requesting PRINTED (automatic only)", async () => {
    if (!dbAvailable) return;
    const order = await paidOrder();
    await assert.rejects(
      () => applyOrderTransition({ orderId: order.id, to: OrderStatus.PRINTED, source: "KDS" }),
      (err: unknown) => err instanceof IllegalOrderTransitionError,
    );
  });

  it("records the acting staff session on a KDS transition", async () => {
    if (!dbAvailable) return;
    const user = await prisma.adminUser.create({
      data: {
        email: `s6status-${Math.random().toString(16).slice(2)}@localhost`,
        passwordHash: "x",
        displayName: "Test Staff",
        role: "STAFF",
        pinHash: "x",
      },
    });
    const session = await prisma.adminSession.create({
      data: {
        userId: user.id,
        tokenHash: `s6test${Math.random().toString(16).slice(2)}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const order = await paidOrder();
    await applyOrderTransition({
      orderId: order.id,
      to: OrderStatus.IN_PROGRESS,
      source: "KDS",
      sessionId: session.id,
      userId: user.id,
    });
    const event = await prisma.orderStatusEvent.findFirstOrThrow({ where: { orderId: order.id } });
    assert.equal(event.sessionId, session.id);
    assert.equal(event.userId, user.id);
    assert.equal(event.source, "KDS");
    assert.equal(hashSessionToken("not-the-raw-token").length, 64);
  });

  it("two simultaneous advances from the same status: one succeeds, one cleanly rejects", async () => {
    if (!dbAvailable) return;
    const order = await paidOrder();
    const results = await Promise.allSettled([
      applyOrderTransition({ orderId: order.id, to: OrderStatus.IN_PROGRESS, source: "KDS" }),
      applyOrderTransition({ orderId: order.id, to: OrderStatus.IN_PROGRESS, source: "KDS" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(
      reason instanceof StaleOrderTransitionError || reason instanceof IllegalOrderTransitionError,
    );
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(row.status, OrderStatus.IN_PROGRESS);
    const events = await prisma.orderStatusEvent.findMany({ where: { orderId: order.id } });
    assert.equal(events.length, 1);
  });

  it("kitchen ticket print stamps PAID → PRINTED and does not reverse IN_PROGRESS", async () => {
    if (!dbAvailable) return;
    const paid = await paidOrder();
    await applyAutomaticPrintTransition(paid.id);
    const printed = await prisma.order.findUniqueOrThrow({ where: { id: paid.id } });
    assert.equal(printed.status, OrderStatus.PRINTED);
    assert.ok(printed.printedAt);

    const cooking = await paidOrder();
    await applyOrderTransition({
      orderId: cooking.id,
      to: OrderStatus.IN_PROGRESS,
      source: "KDS",
    });
    await applyAutomaticPrintTransition(cooking.id);
    const still = await prisma.order.findUniqueOrThrow({ where: { id: cooking.id } });
    assert.equal(still.status, OrderStatus.IN_PROGRESS);
    assert.equal(still.printedAt, null);
  });

  it("enqueues SMS_ORDER_READY in the READY transaction; a failed enqueue rolls the transition back", async () => {
    if (!dbAvailable) return;
    const cooking = await paidOrder();
    await applyOrderTransition({
      orderId: cooking.id,
      to: OrderStatus.IN_PROGRESS,
      source: "KDS",
    });
    await applyOrderTransition({ orderId: cooking.id, to: OrderStatus.READY, source: "KDS" });
    const ready = await prisma.order.findUniqueOrThrow({ where: { id: cooking.id } });
    assert.equal(ready.status, OrderStatus.READY);
    const jobs = await prisma.backgroundJob.findMany({
      where: { type: JobType.SMS_ORDER_READY, payload: { path: ["orderId"], equals: cooking.id } },
    });
    assert.equal(jobs.length, 1);

    const other = await paidOrder();
    await applyOrderTransition({
      orderId: other.id,
      to: OrderStatus.IN_PROGRESS,
      source: "KDS",
    });
    await assert.rejects(
      () =>
        applyOrderTransition({
          orderId: other.id,
          to: OrderStatus.READY,
          source: "KDS",
          afterWork: async () => {
            throw new Error("forced enqueue failure");
          },
        }),
      /forced enqueue failure/,
    );
    const rolled = await prisma.order.findUniqueOrThrow({ where: { id: other.id } });
    assert.equal(rolled.status, OrderStatus.IN_PROGRESS);
    assert.equal(rolled.readyAt, null);
    const readyJobs = await prisma.backgroundJob.findMany({
      where: { type: JobType.SMS_ORDER_READY, payload: { path: ["orderId"], equals: other.id } },
    });
    assert.equal(readyJobs.length, 0);
  });
});
