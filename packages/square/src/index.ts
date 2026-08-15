// SPRINT-4: public API of @harolds/square. This is the ONLY module in the
// repo permitted to import the `square` npm package — everything callers
// need is re-exported from here.
export {
  createPayment,
  getPayment,
  refundPayment,
  getRefund,
  verifyWebhookSignature,
  getSquareEnvironment,
} from "./client";
export { SquareClientError } from "./errors";

export type {
  PaymentOutcome,
  RefundOutcome,
  NormalizedPayment,
  NormalizedRefund,
  CreatePaymentInput,
  RefundPaymentInput,
  VerifyWebhookSignatureInput,
  SquareEnvironmentName,
} from "./types";
export { PaymentDeclineCode, RefundDeclineCode } from "./types";

export * from "./sandbox-cards";
