// SPRINT-4 / SPRINT-17 / SPRINT-18.3: refund + cancellation orchestration (uses @harolds/payments at the app boundary)
import {
  bookRefundFromProcessor,
  cancelUnpaidOrder,
  completeRefundRow,
  findRefundByIdempotencyKey,
  getOrderWithLines,
  markOrderCancelledAfterRefund,
  remainingAfterReservation,
  reservedRefundCents,
  reserveRefundRow,
  type OrderWithLines,
} from "@harolds/db";
import { PaymentClientError, refundPayment } from "@harolds/payments";
import { OrderStatus, PaymentStatus } from "@harolds/types";

const UNCONFIRMED_REFUND_MESSAGE =
  "Refund could not be confirmed. The amount stays reserved until the gateway confirms it. Do not issue another refund for the same amount.";

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
    return replayExistingRefund(order.id, existing);
  }

  const reserved = await reservedRefundCents(order.id);
  const remaining = remainingAfterReservation(order.totalCents, order.refundedCents, reserved);
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

  const reservedRow = await reserveRefundRow({
    orderId: order.id,
    amountCents: amount,
    clientIdempotencyKey: args.clientIdempotencyKey,
    actedByUserId: args.actedByUserId ?? null,
  });
  if (!reservedRow.ok) {
    if (reservedRow.reason === "DUPLICATE") {
      return replayExistingRefund(order.id, reservedRow.existing);
    }
    return {
      ok: false,
      code: "VALIDATION",
      message: `Refund exceeds remaining refundable amount (${reservedRow.remainingCents} cents).`,
    };
  }
  const refundRow = reservedRow.row;

  const chargeRefund = args.refundPaymentFn ?? refundPayment;
  let outcome: Awaited<ReturnType<typeof refundPayment>>;
  try {
    outcome = await chargeRefund({
      paymentId: order.processorPaymentId,
      amountCents: amount,
      correlationId: args.clientIdempotencyKey,
    });
  } catch (err) {
    // `auth` and `invalid_request` mean the gateway never processed the refund (missing
    // credentials, or a request it rejected), so the reservation is released. Anything else,
    // including an approval that came back without a transaction id, may have moved money
    // and stays reserved as UNKNOWN.
    const notProcessed =
      err instanceof PaymentClientError && (err.kind === "auth" || err.kind === "invalid_request");
    await completeRefundRow({
      refundRowId: refundRow.id,
      processorRefundId: null,
      status: notProcessed ? "FAILED" : "UNKNOWN",
    });
    if (notProcessed) {
      return { ok: false, code: "VALIDATION", message: `Refund was not sent: ${err.message}` };
    }
    return { ok: false, code: "TRANSPORT", message: UNCONFIRMED_REFUND_MESSAGE };
  }

  if (outcome.kind === "declined") {
    await completeRefundRow({ refundRowId: refundRow.id, processorRefundId: null, status: "DECLINED" });
    return { ok: false, code: "DECLINED", message: outcome.reason };
  }
  if (outcome.kind === "transport_failure" || !("refundId" in outcome) || !outcome.refundId) {
    const moved = await completeRefundRow({
      refundRowId: refundRow.id,
      processorRefundId: outcome.kind === "transport_failure" ? outcome.refundId : null,
      status: "UNKNOWN",
    });
    if (!moved) {
      // The webhook confirmed this refund while the gateway call was still timing out.
      const settled = await findRefundByIdempotencyKey(args.clientIdempotencyKey);
      if (settled) return replayExistingRefund(order.id, settled);
    }
    return {
      ok: false,
      code: "TRANSPORT",
      message: UNCONFIRMED_REFUND_MESSAGE,
    };
  }

  await bookRefundFromProcessor({
    orderId: order.id,
    amountCents: outcome.amountCents,
    processorRefundId: outcome.refundId,
    refundRowId: refundRow.id,
  });
  const updated = await getOrderWithLines(order.id);
  if (!updated) return { ok: false, code: "NOT_FOUND", message: "Order not found." };

  return {
    ok: true,
    order: updated,
    refundedCents: updated.refundedCents,
    processorRefundId: outcome.refundId,
  };
}

async function replayExistingRefund(
  orderId: string,
  existing: { status: string; processorRefundId: string | null },
): Promise<RefundResult> {
  const refreshed = await getOrderWithLines(orderId);
  if (!refreshed) return { ok: false, code: "NOT_FOUND", message: "Order not found." };
  if (existing.status === "COMPLETED") {
    return {
      ok: true,
      order: refreshed,
      refundedCents: refreshed.refundedCents,
      processorRefundId: existing.processorRefundId,
    };
  }
  if (existing.status === "DECLINED") {
    return { ok: false, code: "DECLINED", message: "That refund was declined. Do not retry the same request." };
  }
  if (existing.status === "FAILED") {
    return { ok: false, code: "VALIDATION", message: "That refund was never sent to the gateway. Start a new refund." };
  }
  return { ok: false, code: "TRANSPORT", message: UNCONFIRMED_REFUND_MESSAGE };
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
