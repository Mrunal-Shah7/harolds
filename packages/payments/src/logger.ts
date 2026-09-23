// SPRINT-4 / SPRINT-17 / SPRINT-18.2 / SPRINT-18.3: structured logging for payment operations — field-name redaction is applied centrally.
import { emitLog } from "@harolds/config";

type LogFields = Record<string, string | number | boolean | null | undefined>;

function emit(level: "info" | "warn" | "error", event: string, fields: LogFields): void {
  emitLog(level, event, fields, { scope: "@harolds/payments" });
}

export function logPaymentAttempt(fields: {
  orderId: string;
  correlationId: string;
  amountCents: number;
  tokenProvided: boolean;
  /** SPRINT-18.3: whether a billing ZIP was sent — never the ZIP itself. */
  billingZipProvided: boolean;
}): void {
  emit("info", "payment.attempt", fields);
}

/**
 * SPRINT-18.3: the ONE line per sale attempt that answers "what happened", carrying the same
 * facts as the PaymentAttempt row. Field names avoid the redaction vocabulary on purpose
 * (`securityCodeResult`, not `cvv...`), because these are result codes, not card data — and
 * this line must never carry the token, the PAN, the ZIP, or the security key.
 */
export function logPaymentOutcome(fields: {
  orderId: string;
  orderReference: string;
  correlationId: string;
  amountCents: number;
  outcomeKind: string;
  paymentId: string | null;
  gatewayEnvironment: string;
  gatewayOrigin: string;
  classification: string;
  internalReason: string;
  gatewayResponse: string | null;
  gatewayResponseCode: string | null;
  gatewayResponseText: string | null;
  avsResult: string | null;
  securityCodeResult: string | null;
  httpStatus: number | null;
}): void {
  const level =
    fields.outcomeKind === "succeeded" ? "info" : fields.outcomeKind === "declined" ? "warn" : "error";
  emit(level, "payment.outcome", fields);
}

/** SPRINT-18.3: a result code this system has no mapping for. Surfaces, never hides. */
export function logUnmappedResultCode(fields: {
  orderId: string;
  gatewayResponse: string | null;
  gatewayResponseCode: string | null;
  fallbackReason: string;
}): void {
  emit("warn", "payment.unmapped_result_code", fields);
}

export function logRefundAttempt(fields: {
  paymentId: string;
  correlationId: string;
  amountCents: number;
}): void {
  emit("info", "refund.attempt", fields);
}

export function logRefundOutcome(fields: {
  paymentId: string;
  correlationId: string;
  amountCents: number;
  outcomeKind: string;
  refundId?: string | null;
}): void {
  const level = fields.outcomeKind === "succeeded" ? "info" : "warn";
  emit(level, "refund.outcome", fields);
}

export function logWebhookVerification(fields: {
  valid: boolean;
  reason: string;
  gatewayEnvironment: string;
  bodyBytes: number;
  headerSegments: number;
  nonceChars: number;
  digestChars: number;
  digestIsHex: boolean;
}): void {
  emit(fields.valid ? "info" : "warn", "webhook.signature_verification", fields);
}

export function logTransportFailure(fields: {
  operation: string;
  message: string;
  paymentId?: string | null;
  refundId?: string | null;
}): void {
  emit("error", "transport_failure", fields);
}
