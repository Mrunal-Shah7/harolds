// SPRINT-4 / SPRINT-18.3: refund persistence helpers — no gateway imports (caller uses @harolds/payments)
import { prisma, Prisma } from "./client";
import type { OrderWithLines } from "./repositories/orders";
import { OrderStatus, PaymentStatus } from "@harolds/types";

/** Rows that have reserved money on the order but have not yet booked it onto refundedCents. */
export const OPEN_REFUND_STATUSES = ["PENDING", "UNKNOWN"] as const;

export async function findRefundByIdempotencyKey(clientIdempotencyKey: string) {
  return prisma.processorRefund.findUnique({ where: { clientIdempotencyKey } });
}

export async function reservedRefundCents(orderId: string): Promise<number> {
  const agg = await prisma.processorRefund.aggregate({
    where: { orderId, status: { in: [...OPEN_REFUND_STATUSES] } },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents ?? 0;
}

export async function reservedRefundCentsByOrderIds(
  orderIds: string[],
): Promise<Map<string, number>> {
  if (orderIds.length === 0) return new Map();
  const groups = await prisma.processorRefund.groupBy({
    by: ["orderId"],
    where: { orderId: { in: orderIds }, status: { in: [...OPEN_REFUND_STATUSES] } },
    _sum: { amountCents: true },
  });
  return new Map(groups.map((g) => [g.orderId, g._sum.amountCents ?? 0]));
}

export function remainingAfterReservation(
  totalCents: number,
  refundedCents: number,
  reservedCents: number,
): number {
  return Math.max(0, totalCents - refundedCents - reservedCents);
}

export async function createPendingRefundRow(args: {
  orderId: string;
  amountCents: number;
  clientIdempotencyKey: string;
  actedByUserId?: string | null;
}) {
  return prisma.processorRefund.create({
    data: {
      orderId: args.orderId,
      amountCents: args.amountCents,
      clientIdempotencyKey: args.clientIdempotencyKey,
      status: "PENDING",
      actedByUserId: args.actedByUserId ?? null,
    },
  });
}

/**
 * Lock the order, refuse if the amount no longer fits under confirmed + reserved refunds,
 * then insert the PENDING row. Two concurrent refunds cannot both pass the ceiling.
 */
export async function reserveRefundRow(args: {
  orderId: string;
  amountCents: number;
  clientIdempotencyKey: string;
  actedByUserId?: string | null;
}): Promise<
  | { ok: true; row: Awaited<ReturnType<typeof createPendingRefundRow>> }
  | { ok: false; reason: "EXCEEDS_REMAINING"; remainingCents: number }
  | { ok: false; reason: "DUPLICATE"; existing: Awaited<ReturnType<typeof createPendingRefundRow>> }
> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${args.orderId} FOR UPDATE`;
      const order = await tx.order.findUniqueOrThrow({
        where: { id: args.orderId },
        select: { totalCents: true, refundedCents: true },
      });
      const reserved = await tx.processorRefund.aggregate({
        where: { orderId: args.orderId, status: { in: [...OPEN_REFUND_STATUSES] } },
        _sum: { amountCents: true },
      });
      const remaining = remainingAfterReservation(
        order.totalCents,
        order.refundedCents,
        reserved._sum.amountCents ?? 0,
      );
      if (args.amountCents > remaining) {
        return {
          ok: false as const,
          reason: "EXCEEDS_REMAINING" as const,
          remainingCents: remaining,
        };
      }
      const row = await tx.processorRefund.create({
        data: {
          orderId: args.orderId,
          amountCents: args.amountCents,
          clientIdempotencyKey: args.clientIdempotencyKey,
          status: "PENDING",
          actedByUserId: args.actedByUserId ?? null,
        },
      });
      return { ok: true as const, row };
    });
  } catch (err) {
    // A concurrent request with the same key won the insert. It owns the gateway call; this one
    // must replay that row's outcome, not send a second refund.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await findRefundByIdempotencyKey(args.clientIdempotencyKey);
      if (existing) return { ok: false, reason: "DUPLICATE", existing };
    }
    throw err;
  }
}

/**
 * Settle a PENDING row. Only PENDING rows move: a webhook can complete the row while the
 * gateway call is still waiting to time out, and an UNKNOWN written over that COMPLETED row
 * would reserve money that refundedCents already counts. Returns whether the row moved.
 */
export async function completeRefundRow(args: {
  refundRowId: string;
  processorRefundId: string | null;
  status: string;
}): Promise<boolean> {
  const { count } = await prisma.processorRefund.updateMany({
    where: { id: args.refundRowId, status: "PENDING" },
    data: {
      status: args.status,
      processorRefundId: args.processorRefundId ?? undefined,
    },
  });
  return count > 0;
}

export async function applyRefundToOrder(args: {
  orderId: string;
  addRefundedCents: number;
}): Promise<OrderWithLines> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: args.orderId },
    include: { lines: true },
  });
  const nextRefunded = order.refundedCents + args.addRefundedCents;
  const fully = nextRefunded >= order.totalCents;
  return prisma.order.update({
    where: { id: args.orderId },
    data: {
      refundedCents: nextRefunded,
      paymentStatus: fully ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
      status: fully ? OrderStatus.REFUNDED : order.status,
    },
    include: { lines: true },
  });
}

export type BookRefundResult = {
  applied: boolean;
  fully: boolean;
  refundedCents: number;
  reason: "ALREADY_APPLIED" | "CONFIRMED" | "PORTAL";
};

/**
 * Book a gateway refund onto the order exactly once, keyed by the processor refund id.
 * Admin success and the webhook both call this, so a confirmed admin refund is not added
 * again when the webhook arrives, and a portal-issued refund still books.
 */
export async function bookRefundFromProcessor(args: {
  orderId: string;
  amountCents: number;
  processorRefundId: string;
  refundRowId?: string;
}): Promise<BookRefundResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${args.orderId} FOR UPDATE`;

    const snapshot = async (): Promise<BookRefundResult> => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: args.orderId },
        select: { totalCents: true, refundedCents: true },
      });
      return {
        applied: false,
        fully: order.refundedCents >= order.totalCents,
        refundedCents: order.refundedCents,
        reason: "ALREADY_APPLIED",
      };
    };

    const byProcessor = await tx.processorRefund.findUnique({
      where: { processorRefundId: args.processorRefundId },
    });
    if (byProcessor?.status === "COMPLETED") {
      if (args.refundRowId && args.refundRowId !== byProcessor.id) {
        const leftover = await tx.processorRefund.findUnique({ where: { id: args.refundRowId } });
        if (leftover && leftover.status !== "COMPLETED") {
          await tx.processorRefund.delete({ where: { id: leftover.id } });
        }
      }
      return snapshot();
    }

    let row = args.refundRowId
      ? await tx.processorRefund.findUnique({ where: { id: args.refundRowId } })
      : byProcessor;

    if (!row) {
      row = await tx.processorRefund.findFirst({
        where: {
          orderId: args.orderId,
          processorRefundId: null,
          amountCents: args.amountCents,
          status: { in: [...OPEN_REFUND_STATUSES] },
        },
        orderBy: { createdAt: "asc" },
      });
    }

    if (!row) {
      try {
        row = await tx.processorRefund.create({
          data: {
            orderId: args.orderId,
            amountCents: args.amountCents,
            clientIdempotencyKey: `webhook-${args.processorRefundId}`,
            processorRefundId: args.processorRefundId,
            status: "PENDING",
          },
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002")
          throw err;
        const existing = await tx.processorRefund.findUnique({
          where: { processorRefundId: args.processorRefundId },
        });
        if (!existing || existing.status === "COMPLETED") return snapshot();
        row = existing;
      }
    }

    if (!row || row.status === "COMPLETED") return snapshot();

    const order = await tx.order.findUniqueOrThrow({ where: { id: args.orderId } });
    const add = Math.min(args.amountCents, Math.max(0, order.totalCents - order.refundedCents));
    const nextRefunded = order.refundedCents + add;
    const fully = nextRefunded >= order.totalCents;

    if (add > 0) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          refundedCents: nextRefunded,
          paymentStatus: fully ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
          status: fully ? OrderStatus.REFUNDED : order.status,
        },
      });
    }

    await tx.processorRefund.update({
      where: { id: row.id },
      data: {
        status: "COMPLETED",
        processorRefundId: args.processorRefundId,
      },
    });

    return {
      applied: add > 0,
      fully,
      refundedCents: nextRefunded,
      reason: args.refundRowId || byProcessor ? "CONFIRMED" : "PORTAL",
    };
  });
}

export async function cancelUnpaidOrder(orderId: string): Promise<OrderWithLines> {
  return prisma.order.update({
    where: { id: orderId },
    data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
    include: { lines: true },
  });
}

export async function markOrderCancelledAfterRefund(orderId: string): Promise<OrderWithLines> {
  return prisma.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.CANCELLED,
      cancelledAt: new Date(),
      paymentStatus: PaymentStatus.REFUNDED,
    },
    include: { lines: true },
  });
}

export async function getOrderWithLines(orderId: string): Promise<OrderWithLines | null> {
  return prisma.order.findUnique({ where: { id: orderId }, include: { lines: true } });
}
