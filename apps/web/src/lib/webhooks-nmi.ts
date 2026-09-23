// SPRINT-4 / SPRINT-17 / SPRINT-18.2: NMI webhook reconciliation — signature verify over raw
// bytes, exactly-once, converge payment state.
//
// With NMI the sale's outcome is already known synchronously at checkout, so this path is a
// BACKSTOP rather than the primary route to PAID: it catches the orders whose HTTP response
// never made it back, and it is the only route for reversals issued from the NMI portal.
import { getPayment, verifyWebhookSignature } from "@harolds/payments";
import { JobType, JobStatus, OrderStatus, PaymentStatus } from "@harolds/types";
import { emitLog, getPrinterConfig } from "@harolds/config";
import {
  prisma,
  findOrderByProcessorPaymentId,
  markOrderPaidAndAllocate,
  markOrderPaymentFailed,
} from "@harolds/db";

export type WebhookProcessResult =
  | { ok: true; outcome: string }
  | { ok: false; status: 401 | 400; message: string };

/**
 * NMI's webhook envelope. Every field is optional because this is attacker-reachable input —
 * the signature proves the body came from NMI, not that it has the shape we expect.
 */
type NmiWebhookPayload = {
  event_id?: string;
  event_type?: string;
  event_body?: {
    transaction_id?: string;
    order_id?: string;
    amount?: string | number;
    condition?: string;
    action?: { action_type?: string; amount?: string | number };
  };
};

/**
 * Verify the signature over the raw body BYTES, then process transaction events exactly once.
 *
 * The bytes are verified first and only then decoded and parsed: re-serialising the parsed
 * object, or HMAC'ing a decoded string, would change what the digest covers.
 */
export async function processNmiWebhook(
  rawBody: Buffer,
  signatureHeader: string | null,
): Promise<WebhookProcessResult> {
  if (!signatureHeader) {
    emitLog(
      "warn",
      "webhook.signature_verification",
      { valid: false, reason: "missing_header", bodyBytes: rawBody.byteLength },
      { scope: "webhooks" },
    );
    return { ok: false, status: 401, message: "Missing signature." };
  }

  const valid = await verifyWebhookSignature({ body: rawBody, signatureHeader });
  if (!valid) {
    return { ok: false, status: 401, message: "Invalid webhook signature." };
  }

  // Decoded only after verification. TextDecoder drops a leading BOM, as request.text() did.
  const bodyText = new TextDecoder("utf-8").decode(rawBody);
  let payload: NmiWebhookPayload;
  try {
    payload = JSON.parse(bodyText) as NmiWebhookPayload;
  } catch {
    return { ok: false, status: 400, message: "Invalid JSON." };
  }

  const eventId = payload.event_id;
  const eventType = payload.event_type ?? "unknown";
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
      rawPayload: JSON.parse(bodyText) as object,
    },
  });

  try {
    let outcome = "IGNORED";
    let orderId: string | null = null;

    // NMI event types are dotted: `transaction.<action>.<result>`, e.g. `transaction.sale.success`
    // or `transaction.refund.success`. Branch on the ACTION segment.
    const [domain, action] = eventType.split(".");
    const transactionId = payload.event_body?.transaction_id ?? null;

    if (domain === "transaction" && transactionId) {
      if (action === "sale" || action === "auth" || action === "capture") {
        const result = await reconcilePaymentEvent(transactionId, eventType);
        outcome = result.outcome;
        orderId = result.orderId;
      } else if (action === "refund" || action === "void") {
        const result = await reconcileRefundEvent(payload, transactionId);
        outcome = result.outcome;
        orderId = result.orderId;
      }
    }

    await prisma.processorWebhookEvent.update({
      where: { id: eventRow.id },
      data: { outcome, orderId, processedAt: new Date() },
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

  // The event says something happened; the gateway is asked what is actually true. The webhook
  // body is never trusted for the amount — that is the value the capture guard below compares.
  const payment = await getPayment(paymentId);
  if (!payment) {
    return { outcome: "PAYMENT_MISSING", orderId: order.id };
  }

  const printers = getPrinterConfig();

  if (payment.status === "completed") {
    if (payment.amountCents !== order.totalCents) {
      await prisma.backgroundJob.create({
        data: {
          type: JobType.ALERT_MANAGER_PAYMENT_DISCREPANCY,
          status: JobStatus.PENDING,
          payload: {
            orderId: order.id,
            paymentId,
            orderTotalCents: order.totalCents,
            gatewayAmountCents: payment.amountCents,
            reason: "Webhook payment amount does not match order total",
          },
        },
      });
      return { outcome: "AMOUNT_MISMATCH", orderId: order.id };
    }

    // Keyed on the PAYMENT, not the order status. The gateway redelivers events, and by the
    // time a retry lands the kitchen may have moved the order to PRINTED/IN_PROGRESS/READY.
    // Testing `status === PAID` here let those retries through to re-allocate the order number.
    if (order.paymentStatus === PaymentStatus.CAPTURED && order.orderNumber) {
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

  if (payment.status === "failed" || payment.status === "canceled") {
    // Same reasoning as the capture guard above: key on the payment, not the order status.
    // A captured order that the kitchen has already moved to PRINTED/IN_PROGRESS/READY must not
    // be flipped to payment-failed by a redelivered failure for a superseded attempt.
    if (order.paymentStatus === PaymentStatus.CAPTURED || order.status === OrderStatus.PAID) {
      return { outcome: "FAILED_AFTER_PAID", orderId: order.id };
    }
    await markOrderPaymentFailed(order.id, {
      processorPaymentId: paymentId,
      reason: `Gateway payment ${payment.status}`,
    });
    return { outcome: "MARKED_FAILED", orderId: order.id };
  }

  // `pending` — nothing to converge yet. Deliberately NOT treated as failed: an event we do not
  // understand must leave the order alone rather than guess at its state.
  return { outcome: "NOOP", orderId: order.id };
}

/**
 * A reversal is booked as its OWN transaction that names the sale it reverses. The webhook
 * therefore carries the refund's id, and the order is found via the original sale's id.
 */
async function reconcileRefundEvent(
  payload: NmiWebhookPayload,
  refundTransactionId: string,
): Promise<{ outcome: string; orderId: string | null }> {
  // Our own order id travels on the gateway's `order_id`, which reversals inherit from the sale.
  const orderIdFromGateway = payload.event_body?.order_id ?? null;

  const order = orderIdFromGateway
    ? await prisma.order.findUnique({ where: { id: orderIdFromGateway } })
    : null;

  if (!order) return { outcome: "NO_ORDER", orderId: null };

  // Amounts arrive negative on a reversal and as strings; take the magnitude in whole cents.
  const amountCents = parseAmountCents(
    payload.event_body?.action?.amount ?? payload.event_body?.amount,
  );
  if (amountCents === null) {
    return { outcome: "AMOUNT_UNREADABLE", orderId: order.id };
  }

  const nextRefunded = Math.min(order.totalCents, order.refundedCents + amountCents);
  const fully = nextRefunded >= order.totalCents;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      refundedCents: nextRefunded,
      paymentStatus: fully ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
      status: fully ? OrderStatus.REFUNDED : order.status,
    },
  });

  await prisma.processorRefund.updateMany({
    where: { processorRefundId: refundTransactionId },
    data: { status: "COMPLETED" },
  });

  return { outcome: fully ? "FULLY_REFUNDED" : "PARTIAL_REFUND", orderId: order.id };
}

/** Parse a gateway decimal-dollar amount ("-12.34", "12.34", 12.34) into whole cents. */
function parseAmountCents(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const match = /^-?(\d+)(?:\.(\d{1,2}))?$/.exec(String(raw).trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
