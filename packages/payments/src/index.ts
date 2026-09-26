// SPRINT-4 / SPRINT-17 / SPRINT-18.3 / SPRINT-19: public API of @harolds/payments. This is the ONLY module in the
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
// SPRINT-19: the one cents → "x.xx" formatter. The quote uses it for the wallet sheet's amount and
// the sale uses it for `amount`, so the two strings are comparable byte for byte.
export { toGatewayAmount } from "./money";

export type {
  PaymentOutcome,
  RefundOutcome,
  NormalizedPayment,
  NormalizedRefund,
  CreatePaymentInput,
  RefundPaymentInput,
  VerifyWebhookSignatureInput,
  PaymentEnvironmentName,
  PaymentAttemptRecord,
  PaymentAttemptClassification,
} from "./types";
export { PaymentDeclineCode, RefundDeclineCode } from "./types";
export {
  RESULT_CODE_TABLE,
  CustomerMessage,
  classifySaleResult,
  isGatewayIncident,
  type ResultCodeEntry,
  type SaleHandling,
} from "./result-codes";

export * from "./test-cards";
