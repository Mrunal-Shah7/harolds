// SPRINT-4: refund persistence helpers — no Square imports (caller uses @harolds/square)
import { prisma } from "./client";
import type { OrderWithLines } from "./repositories/orders";
import { OrderStatus, PaymentStatus } from "@harolds/types";

export async function findRefundByIdempotencyKey(clientIdempotencyKey: string) {
  return prisma.processorRefund.findUnique({ where: { clientIdempotencyKey } });
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

export async function completeRefundRow(args: {
  refundRowId: string;
  processorRefundId: string | null;
  status: string;
}) {
  return prisma.processorRefund.update({
    where: { id: args.refundRowId },
    data: {
      status: args.status,
      processorRefundId: args.processorRefundId ?? undefined,
    },
  });
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
