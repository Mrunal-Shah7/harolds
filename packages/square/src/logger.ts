// SPRINT-4: structured logging for Square operations — field-name redaction is applied centrally.
import { emitLog } from "@harolds/config";

type LogFields = Record<string, string | number | boolean | null | undefined>;

function emit(level: "info" | "warn" | "error", event: string, fields: LogFields): void {
  emitLog(level, event, fields, { scope: "@harolds/square" });
}

export function logPaymentAttempt(fields: {
  orderId: string;
  idempotencyKey: string;
  amountCents: number;
  sourceIdProvided: boolean;
}): void {
  emit("info", "payment.attempt", fields);
}

export function logPaymentOutcome(fields: {
  orderId: string;
  idempotencyKey: string;
  amountCents: number;
  outcomeKind: string;
  paymentId?: string | null;
}): void {
  const level = fields.outcomeKind === "succeeded" ? "info" : "warn";
  emit(level, "payment.outcome", fields);
}

export function logRefundAttempt(fields: {
  paymentId: string;
  idempotencyKey: string;
  amountCents: number;
}): void {
  emit("info", "refund.attempt", fields);
}

export function logRefundOutcome(fields: {
  paymentId: string;
  idempotencyKey: string;
  amountCents: number;
  outcomeKind: string;
  refundId?: string | null;
}): void {
  const level = fields.outcomeKind === "succeeded" ? "info" : "warn";
  emit(level, "refund.outcome", fields);
}

export function logWebhookVerification(fields: { valid: boolean }): void {
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
