// SPRINT-4 / SPRINT-17: public API of @harolds/payments. This is the ONLY module in the
// repo permitted to talk to the payment gateway — everything callers need is re-exported
// from here, in vocabulary that names no provider.
export {
  createPayment,
  getPayment,
  findPaymentByOrderId,
  refundPayment,
  getRefund,
  verifyWebhookSignature,
  getPaymentEnvironment,
  GATEWAY_REQUEST_TIMEOUT_MS,
} from "./client";
export { PaymentClientError } from "./errors";

export type {
  PaymentOutcome,
  RefundOutcome,
  NormalizedPayment,
  NormalizedRefund,
  CreatePaymentInput,
  RefundPaymentInput,
  VerifyWebhookSignatureInput,
  PaymentEnvironmentName,
} from "./types";
export { PaymentDeclineCode, RefundDeclineCode } from "./types";

export * from "./test-cards";
