// SPRINT-4: Square API client — the ONLY module in this repo permitted to
// import the `square` SDK. All callers go through the functions exported here.
import { env } from "@harolds/config";
import { SquareClient, SquareEnvironment, SquareError, WebhooksHelper } from "square";

import { classifySquareError, SquareClientError } from "./errors";
import {
  logPaymentAttempt,
  logPaymentOutcome,
  logRefundAttempt,
  logRefundOutcome,
  logTransportFailure,
  logWebhookVerification,
} from "./logger";
import { fromSquareMoney, toSquareMoney } from "./money";
import type {
  CreatePaymentInput,
  NormalizedPayment,
  NormalizedRefund,
  PaymentOutcome,
  RefundOutcome,
  RefundPaymentInput,
  SquareEnvironmentName,
  VerifyWebhookSignatureInput,
} from "./types";

function extractCardLast4(payment: { cardDetails?: { card?: { last4?: string | null } } } | undefined): string | null {
  const last4 = payment?.cardDetails?.card?.last4 ?? null;
  return last4 && /^\d{4}$/.test(last4) ? last4 : null;
}

let cachedClient: SquareClient | undefined;

function getClient(): SquareClient {
  if (!cachedClient) {
    cachedClient = new SquareClient({
      token: env.SQUARE_ACCESS_TOKEN,
      environment:
        env.SQUARE_ENVIRONMENT === "production" ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
    });
  }
  return cachedClient;
}

/** The active Square environment, for startup logging / health checks. Never throws. */
export function getSquareEnvironment(): SquareEnvironmentName {
  return env.SQUARE_ENVIRONMENT;
}

export async function createPayment(input: CreatePaymentInput): Promise<PaymentOutcome> {
  const client = getClient();
  const locationId = input.locationId ?? env.SQUARE_LOCATION_ID;

  logPaymentAttempt({
    orderId: input.orderId,
    idempotencyKey: input.idempotencyKey,
    amountCents: input.amountCents,
    sourceIdProvided: Boolean(input.sourceId),
  });

  try {
    const response = await client.payments.create({
      sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey,
      amountMoney: toSquareMoney(input.amountCents),
      autocomplete: true,
      locationId,
      referenceId: input.orderId,
      note: `Order ${input.orderReference}`,
    });

    const payment = response.payment;
    if (!payment?.id || !payment.status) {
      throw new SquareClientError("Square create-payment response is missing required fields.");
    }

    const outcome: PaymentOutcome = {
      kind: "succeeded",
      paymentId: payment.id,
      amountCents: fromSquareMoney(payment.amountMoney),
      status: normalisePaymentStatus(payment.status),
      rawStatus: payment.status,
      cardLast4: extractCardLast4(payment),
    };
    logPaymentOutcome({
      orderId: input.orderId,
      idempotencyKey: input.idempotencyKey,
      amountCents: input.amountCents,
      outcomeKind: outcome.kind,
      paymentId: outcome.paymentId,
    });
    return outcome;
  } catch (err) {
    if (err instanceof SquareClientError) throw err;

    const classification = classifySquareError(err, "payment");
    if (classification.outcome === "client_error") {
      throw classification.error;
    }

    const outcome: PaymentOutcome =
      classification.outcome === "declined_payment"
        ? { kind: "declined", paymentId: null, reason: classification.reason, code: classification.code }
        : { kind: "transport_failure", message: classification.message, paymentId: null };

    if (outcome.kind === "transport_failure") {
      logTransportFailure({ operation: "createPayment", message: outcome.message, paymentId: outcome.paymentId });
    }
    logPaymentOutcome({
      orderId: input.orderId,
      idempotencyKey: input.idempotencyKey,
      amountCents: input.amountCents,
      outcomeKind: outcome.kind,
      paymentId: outcome.paymentId,
    });
    return outcome;
  }
}

export async function getPayment(paymentId: string): Promise<NormalizedPayment | null> {
  const client = getClient();
  try {
    const response = await client.payments.get({ paymentId });
    const payment = response.payment;
    if (!payment?.id || !payment.status) return null;
    return {
      paymentId: payment.id,
      status: normalisePaymentStatus(payment.status),
      amountCents: fromSquareMoney(payment.amountMoney),
      orderId: payment.orderId ?? null,
      referenceId: payment.referenceId ?? null,
      createdAt: payment.createdAt ?? null,
      cardLast4: extractCardLast4(payment),
    };
  } catch (err) {
    if (err instanceof SquareError && err.statusCode === 404) return null;

    const classification = classifySquareError(err, "payment");
    if (classification.outcome === "client_error") {
      throw classification.error;
    }
    if (classification.outcome === "transport_failure") {
      logTransportFailure({ operation: "getPayment", message: classification.message, paymentId });
      throw new SquareClientError(classification.message, "unexpected");
    }
    // A "declined_*" classification cannot occur for a plain GET — treat conservatively.
    throw new SquareClientError("Unexpected error retrieving payment.", "unexpected");
  }
}

export async function refundPayment(input: RefundPaymentInput): Promise<RefundOutcome> {
  const client = getClient();

  logRefundAttempt({
    paymentId: input.paymentId,
    idempotencyKey: input.idempotencyKey,
    amountCents: input.amountCents,
  });

  try {
    const response = await client.refunds.refundPayment({
      idempotencyKey: input.idempotencyKey,
      amountMoney: toSquareMoney(input.amountCents),
      paymentId: input.paymentId,
    });

    const refund = response.refund;
    if (!refund?.id || !refund.status) {
      throw new SquareClientError("Square refund-payment response is missing required fields.");
    }

    const outcome: RefundOutcome = {
      kind: "succeeded",
      refundId: refund.id,
      amountCents: fromSquareMoney(refund.amountMoney),
      status: normaliseRefundStatus(refund.status),
    };
    logRefundOutcome({
      paymentId: input.paymentId,
      idempotencyKey: input.idempotencyKey,
      amountCents: input.amountCents,
      outcomeKind: outcome.kind,
      refundId: outcome.refundId,
    });
    return outcome;
  } catch (err) {
    if (err instanceof SquareClientError) throw err;

    const classification = classifySquareError(err, "refund");
    if (classification.outcome === "client_error") {
      throw classification.error;
    }

    const outcome: RefundOutcome =
      classification.outcome === "declined_refund"
        ? { kind: "declined", reason: classification.reason, code: classification.code }
        : { kind: "transport_failure", message: classification.message, refundId: null };

    if (outcome.kind === "transport_failure") {
      logTransportFailure({ operation: "refundPayment", message: outcome.message, refundId: outcome.refundId });
    }
    logRefundOutcome({
      paymentId: input.paymentId,
      idempotencyKey: input.idempotencyKey,
      amountCents: input.amountCents,
      outcomeKind: outcome.kind,
      refundId: null,
    });
    return outcome;
  }
}

export async function getRefund(refundId: string): Promise<NormalizedRefund | null> {
  const client = getClient();
  try {
    const response = await client.refunds.get({ refundId });
    const refund = response.refund;
    if (!refund?.id || !refund.status) return null;
    return {
      refundId: refund.id,
      paymentId: refund.paymentId ?? null,
      status: normaliseRefundStatus(refund.status),
      amountCents: fromSquareMoney(refund.amountMoney),
      createdAt: refund.createdAt ?? null,
    };
  } catch (err) {
    if (err instanceof SquareError && err.statusCode === 404) return null;

    const classification = classifySquareError(err, "refund");
    if (classification.outcome === "client_error") {
      throw classification.error;
    }
    if (classification.outcome === "transport_failure") {
      logTransportFailure({ operation: "getRefund", message: classification.message, refundId });
      throw new SquareClientError(classification.message, "unexpected");
    }
    throw new SquareClientError("Unexpected error retrieving refund.", "unexpected");
  }
}

export async function verifyWebhookSignature(input: VerifyWebhookSignatureInput): Promise<boolean> {
  const requestBody = typeof input.body === "string" ? input.body : input.body.toString("utf8");
  const isValid = await WebhooksHelper.verifySignature({
    requestBody,
    signatureHeader: input.signatureHeader,
    signatureKey: env.SQUARE_WEBHOOK_SIGNATURE_KEY,
    notificationUrl: input.notificationUrl,
  });
  logWebhookVerification({ valid: isValid });
  return isValid;
}

/** Collapse Square's payment status vocabulary into lowercase for consistent logging/comparisons. */
function normalisePaymentStatus(status: string): string {
  return status.toLowerCase();
}

function normaliseRefundStatus(status: string): string {
  return status.toLowerCase();
}
