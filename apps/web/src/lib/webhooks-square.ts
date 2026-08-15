// SPRINT-4: Square webhook reconciliation — signature verify, exactly-once, converge payment state
import { getPayment, verifyWebhookSignature } from "@harolds/square";
import { JobType, JobStatus, OrderStatus, PaymentStatus } from "@harolds/types";
import { env, getPrinterConfig } from "@harolds/config";
import {
  prisma,
  findOrderByProcessorPaymentId,
  markOrderPaidAndAllocate,
  markOrderPaymentFailed,
} from "@harolds/db";

function notificationUrl(): string {
  // Optional public webhook URL (ngrok). When unset, derive from NEXT_PUBLIC_APP_URL.
  const override = (process.env.SQUARE_WEBHOOK_NOTIFICATION_URL ?? "").trim();
  if (override) return override.replace(/\/$/, "");
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/v1/webhooks/square`;
}

export type WebhookProcessResult =
  | { ok: true; outcome: string }
  | { ok: false; status: 401 | 400; message: string };

/**
 * Verify signature over raw body bytes, then process payment/refund update events exactly once.
 */
export async function processSquareWebhook(
  rawBody: string,
  signatureHeader: string | null,
): Promise<WebhookProcessResult> {
  if (!signatureHeader) {
    return { ok: false, status: 401, message: "Missing signature." };
  }

  const valid = await verifyWebhookSignature({
    body: rawBody,
    signatureHeader,
    notificationUrl: notificationUrl(),
  });
  if (!valid) {
    return { ok: false, status: 401, message: "Invalid webhook signature." };
  }

  let payload: {
    event_id?: string;
    type?: string;
    data?: { id?: string; object?: { payment?: { id?: string }; refund?: { id?: string; payment_id?: string; amount_money?: { amount?: bigint | number } } } };
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return { ok: false, status: 400, message: "Invalid JSON." };
  }

  const eventId = payload.event_id;
  const eventType = payload.type ?? "unknown";
  if (!eventId) {
    return { ok: false, status: 400, message: "Missing event_id." };
  }

  const existing = await prisma.processorWebhookEvent.findUnique({ where: { eventId } });
  if (existing) {
    return { ok: true, outcome: "DUPLICATE" };
  }

  const eventRow = await prisma.processorWebhookEvent.create({
    data: {
      eventId,
      eventType,
      outcome: "RECEIVED",
      rawPayload: JSON.parse(rawBody) as object,
    },
  });

  try {
    let outcome = "IGNORED";
    let orderId: string | null = null;

    if (eventType.startsWith("payment.")) {
      const paymentId =
        payload.data?.object?.payment?.id ??
        payload.data?.id ??
        null;
      if (paymentId) {
        const result = await reconcilePaymentEvent(paymentId, eventType);
        outcome = result.outcome;
        orderId = result.orderId;
      }
    } else if (eventType.startsWith("refund.")) {
      const refund = payload.data?.object?.refund;
      if (refund?.payment_id) {
        const result = await reconcileRefundEvent(refund.payment_id, {
          refundId: refund.id ?? null,
          amountCents: Number(refund.amount_money?.amount ?? 0),
        });
        outcome = result.outcome;
        orderId = result.orderId;
      }
    }

    await prisma.processorWebhookEvent.update({
      where: { id: eventRow.id },
      data: {
        outcome,
        orderId,
        processedAt: new Date(),
      },
    });

    return { ok: true, outcome };
  } catch (err) {
    await prisma.processorWebhookEvent.update({
      where: { id: eventRow.id },
      data: {
        outcome: "ERROR",
        lastError: err instanceof Error ? err.message : String(err),
        processedAt: new Date(),
      },
    });
    throw err;
  }
}

async function reconcilePaymentEvent(
  paymentId: string,
  eventType: string,
): Promise<{ outcome: string; orderId: string | null }> {
  const order = await findOrderByProcessorPaymentId(paymentId);
  if (!order) {
    return { outcome: "NO_ORDER", orderId: null };
  }

  const payment = await getPayment(paymentId);
  if (!payment) {
    return { outcome: "PAYMENT_MISSING", orderId: order.id };
  }

  const printers = getPrinterConfig();
  const completed =
    payment.status === "completed" ||
    payment.status === "approved" ||
    eventType === "payment.updated" && payment.status === "completed";

  if (completed || payment.status === "completed") {
    if (payment.amountCents !== order.totalCents) {
      await prisma.backgroundJob.create({
        data: {
          type: JobType.ALERT_MANAGER_PAYMENT_DISCREPANCY,
          status: JobStatus.PENDING,
          payload: {
            orderId: order.id,
            paymentId,
            orderTotalCents: order.totalCents,
            squareAmountCents: payment.amountCents,
            reason: "Webhook payment amount does not match order total",
          },
        },
      });
      return { outcome: "AMOUNT_MISMATCH", orderId: order.id };
    }

    if (order.status === OrderStatus.PAID && order.paymentStatus === PaymentStatus.CAPTURED) {
      return { outcome: "ALREADY_PAID", orderId: order.id };
    }

    await markOrderPaidAndAllocate(order.id, {
      paymentId,
      paidAt: new Date(),
      kitchenSerial: printers.kitchenSerial,
      counterSerial: printers.counterSerial,
      printMaxAttempts: printers.maxAttempts,
      cardLast4: payment.cardLast4,
    });
    return { outcome: "MARKED_PAID", orderId: order.id };
  }

  if (payment.status === "failed" || payment.status === "canceled" || payment.status === "cancelled") {
    if (order.status === OrderStatus.PAID) {
      return { outcome: "FAILED_AFTER_PAID", orderId: order.id };
    }
    await markOrderPaymentFailed(order.id, {
      processorPaymentId: paymentId,
      reason: `Square payment ${payment.status}`,
    });
    return { outcome: "MARKED_FAILED", orderId: order.id };
  }

  return { outcome: "NOOP", orderId: order.id };
}

async function reconcileRefundEvent(
  paymentId: string,
  refund: { refundId: string | null; amountCents: number },
): Promise<{ outcome: string; orderId: string | null }> {
  const order = await findOrderByProcessorPaymentId(paymentId);
  if (!order) return { outcome: "NO_ORDER", orderId: null };

  const nextRefunded = Math.min(order.totalCents, order.refundedCents + refund.amountCents);
  const fully = nextRefunded >= order.totalCents;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      refundedCents: nextRefunded,
      paymentStatus: fully ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
      status: fully ? OrderStatus.REFUNDED : order.status,
    },
  });

  if (refund.refundId) {
    await prisma.processorRefund.updateMany({
      where: { processorRefundId: refund.refundId },
      data: { status: "COMPLETED" },
    });
  }

  return { outcome: fully ? "FULLY_REFUNDED" : "PARTIAL_REFUND", orderId: order.id };
}
