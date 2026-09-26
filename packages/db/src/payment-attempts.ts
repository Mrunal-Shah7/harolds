// SPRINT-18.3 / SPRINT-19: the per-attempt gateway record, and the payment-gateway incident alert.
//
// No gateway import: the record arrives as plain data from the checkout, shaped by
// @harolds/payments. NOTHING here may take a PAN, expiry, security code, payment token, or the
// billing ZIP — the input type has no field that could carry one, on purpose. SPRINT-19: nor any
// wallet contact data (name, address, postal code, email, phone) — only the method and the brand.
import { emitLog } from "@harolds/config";
import { JobStatus, JobType } from "@harolds/types";
import { prisma } from "./client";

export type PaymentAttemptClassificationValue =
  | "APPROVED"
  | "DECLINED"
  | "GATEWAY_FAILURE"
  | "CONFIGURATION_FAILURE"
  | "COMMUNICATION_FAILURE";

export type PaymentAttemptInput = {
  orderId: string;
  amountCents: number;
  gatewayEnvironment: string;
  gatewayOrigin: string;
  classification: PaymentAttemptClassificationValue;
  internalReason: string;
  gatewayResponse: string | null;
  gatewayResponseCode: string | null;
  gatewayResponseText: string | null;
  avsResponse: string | null;
  cvvResponse: string | null;
  authCode: string | null;
  gatewayTransactionId: string | null;
  httpStatus: number | null;
  /** SPRINT-19: card | apple_pay | google_pay. Omitted means card. */
  paymentMethod?: "card" | "apple_pay" | "google_pay";
  /** SPRINT-19: brand as Collect.js reported it, already normalised. Never a card number. */
  cardBrand?: string | null;
};

/**
 * Persist one attempt. Never throws: the charge has already happened (or not) by the time this
 * runs, and a failure to write the diagnostic record must not change what the customer is told
 * or what happens to the order. A failed write is logged at error level instead.
 */
export async function recordPaymentAttempt(input: PaymentAttemptInput): Promise<string | null> {
  try {
    const row = await prisma.paymentAttempt.create({
      data: {
        orderId: input.orderId,
        amountCents: input.amountCents,
        gatewayEnvironment: input.gatewayEnvironment,
        gatewayOrigin: input.gatewayOrigin,
        classification: input.classification,
        internalReason: input.internalReason,
        gatewayResponse: input.gatewayResponse,
        gatewayResponseCode: input.gatewayResponseCode,
        gatewayResponseText: input.gatewayResponseText,
        avsResponse: input.avsResponse,
        cvvResponse: input.cvvResponse,
        authCode: input.authCode,
        gatewayTransactionId: input.gatewayTransactionId,
        httpStatus: input.httpStatus,
        paymentMethod: input.paymentMethod ?? "card",
        cardBrand: input.cardBrand ?? null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    emitLog(
      "error",
      "payment.attempt_record_failed",
      { orderId: input.orderId, classification: input.classification, error: err instanceof Error ? err.name : "Error" },
      { scope: "payments" },
    );
    return null;
  }
}

/** One gateway incident alert per window. An outage is one incident, not one per order. */
export const PAYMENT_GATEWAY_ALERT_WINDOW_MS = 15 * 60_000;

/**
 * Raise the manager alert for a gateway incident, at most once per window. Serialised with a
 * transaction-scoped advisory lock so two orders failing at the same instant still raise one.
 * Returns whether a new alert job was created. Never throws.
 */
export async function raisePaymentGatewayIncident(input: {
  orderId: string;
  classification: PaymentAttemptClassificationValue;
  internalReason: string;
  gatewayResponseCode: string | null;
  gatewayOrigin: string;
  gatewayEnvironment: string;
  now?: Date;
  windowMs?: number;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const windowMs = input.windowMs ?? PAYMENT_GATEWAY_ALERT_WINDOW_MS;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('harolds:payment_gateway_incident'))");
      const recent = await tx.backgroundJob.count({
        where: {
          type: JobType.ALERT_MANAGER_PAYMENT_GATEWAY_FAILURE,
          createdAt: { gt: new Date(now.getTime() - windowMs) },
        },
      });
      if (recent > 0) return false;
      await tx.backgroundJob.create({
        data: {
          type: JobType.ALERT_MANAGER_PAYMENT_GATEWAY_FAILURE,
          status: JobStatus.PENDING,
          payload: {
            orderId: input.orderId,
            classification: input.classification,
            internalReason: input.internalReason,
            gatewayResponseCode: input.gatewayResponseCode,
            gatewayOrigin: input.gatewayOrigin,
            gatewayEnvironment: input.gatewayEnvironment,
            firstSeenAt: now.toISOString(),
            windowMinutes: Math.round(windowMs / 60_000),
          },
        },
      });
      return true;
    });
  } catch (err) {
    emitLog(
      "error",
      "payment.incident_alert_failed",
      { orderId: input.orderId, error: err instanceof Error ? err.name : "Error" },
      { scope: "payments" },
    );
    return false;
  }
}

/** Attempts for the admin order detail, oldest first. */
export async function listPaymentAttempts(orderId: string) {
  return prisma.paymentAttempt.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
  });
}
