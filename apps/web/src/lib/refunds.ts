// SPRINT-4: refund + cancellation orchestration (uses @harolds/square at the app boundary)
import {
  applyRefundToOrder,
  cancelUnpaidOrder,
  completeRefundRow,
  createPendingRefundRow,
  findRefundByIdempotencyKey,
  getOrderWithLines,
  markOrderCancelledAfterRefund,
  type OrderWithLines,
} from "@harolds/db";
import { refundPayment } from "@harolds/square";
import { OrderStatus, PaymentStatus } from "@harolds/types";

export type RefundResult =
  | { ok: true; order: OrderWithLines; refundedCents: number; processorRefundId: string | null }
  | { ok: false; code: "NOT_FOUND" | "VALIDATION" | "DECLINED" | "TRANSPORT"; message: string };

export async function refundOrder(args: {
  orderId: string;
  amountCents: number | "full";
  clientIdempotencyKey: string;
  actedByUserId?: string | null;
  refundPaymentFn?: typeof refundPayment;
}): Promise<RefundResult> {
  const order = await getOrderWithLines(args.orderId);
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found." };
  if (!order.processorPaymentId) {
    return { ok: false, code: "VALIDATION", message: "Order has no processor payment to refund." };
  }

  const existing = await findRefundByIdempotencyKey(args.clientIdempotencyKey);
  if (existing) {
    const refreshed = await getOrderWithLines(order.id);
    return {
      ok: true,
      order: refreshed!,
      refundedCents: refreshed!.refundedCents,
      processorRefundId: existing.processorRefundId,
    };
  }

  const remaining = order.totalCents - order.refundedCents;
  const amount = args.amountCents === "full" ? remaining : args.amountCents;
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, code: "VALIDATION", message: "Refund amount must be a positive integer." };
  }
  if (amount > remaining) {
    return {
      ok: false,
      code: "VALIDATION",
      message: `Refund exceeds remaining refundable amount (${remaining} cents).`,
    };
  }

  const refundRow = await createPendingRefundRow({
    orderId: order.id,
    amountCents: amount,
    clientIdempotencyKey: args.clientIdempotencyKey,
    actedByUserId: args.actedByUserId ?? null,
  });

  const chargeRefund = args.refundPaymentFn ?? refundPayment;
  const outcome = await chargeRefund({
    paymentId: order.processorPaymentId,
    amountCents: amount,
    idempotencyKey: args.clientIdempotencyKey,
  });

  if (outcome.kind === "declined") {
    await completeRefundRow({ refundRowId: refundRow.id, processorRefundId: null, status: "DECLINED" });
    return { ok: false, code: "DECLINED", message: outcome.reason };
  }
  if (outcome.kind === "transport_failure") {
    await completeRefundRow({
      refundRowId: refundRow.id,
      processorRefundId: outcome.refundId,
      status: "UNKNOWN",
    });
    return {
      ok: false,
      code: "TRANSPORT",
      message: "Refund could not be confirmed. Do not retry blindly.",
    };
  }

  const updated = await applyRefundToOrder({
    orderId: order.id,
    addRefundedCents: outcome.amountCents,
  });
  await completeRefundRow({
    refundRowId: refundRow.id,
    processorRefundId: outcome.refundId,
    status: "COMPLETED",
  });

  return {
    ok: true,
    order: updated,
    refundedCents: updated.refundedCents,
    processorRefundId: outcome.refundId,
  };
}

export async function cancelOrder(
  orderId: string,
  refundIdempotencyKey: string,
  actedByUserId?: string | null,
): Promise<RefundResult> {
  const order = await getOrderWithLines(orderId);
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found." };

  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.ABANDONED) {
    return { ok: true, order, refundedCents: order.refundedCents, processorRefundId: null };
  }

  if (
    order.paymentStatus === PaymentStatus.PENDING ||
    order.paymentStatus === PaymentStatus.FAILED ||
    !order.processorPaymentId
  ) {
    const updated = await cancelUnpaidOrder(orderId);
    return { ok: true, order: updated, refundedCents: updated.refundedCents, processorRefundId: null };
  }

  const refunded = await refundOrder({
    orderId,
    amountCents: "full",
    clientIdempotencyKey: refundIdempotencyKey,
    actedByUserId,
  });
  if (!refunded.ok) return refunded;

  const updated = await markOrderCancelledAfterRefund(orderId);
  return {
    ok: true,
    order: updated,
    refundedCents: updated.refundedCents,
    processorRefundId: refunded.processorRefundId,
  };
}
