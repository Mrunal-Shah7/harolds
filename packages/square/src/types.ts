// SPRINT-4: public result/error taxonomy for Square payment operations.
// These types intentionally do not mirror Square's SDK shapes field-for-field —
// callers outside this package must never need to know Square's vocabulary.

/**
 * Our own decline vocabulary. Square's `ErrorCode` values are translated into
 * one of these before leaving the module (see `errors.ts`).
 */
export const PaymentDeclineCode = {
  CARD_DECLINED: "CARD_DECLINED",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  CARD_EXPIRED: "CARD_EXPIRED",
  INVALID_CARD: "INVALID_CARD",
  CVV_FAILURE: "CVV_FAILURE",
  VERIFICATION_REQUIRED: "VERIFICATION_REQUIRED",
  CALL_ISSUER: "CALL_ISSUER",
  TRANSACTION_LIMIT_EXCEEDED: "TRANSACTION_LIMIT_EXCEEDED",
  ALREADY_USED: "ALREADY_USED",
  GENERIC_DECLINE: "GENERIC_DECLINE",
} as const;
export type PaymentDeclineCode = (typeof PaymentDeclineCode)[keyof typeof PaymentDeclineCode];

export const RefundDeclineCode = {
  ALREADY_REFUNDED: "ALREADY_REFUNDED",
  NOT_REFUNDABLE: "NOT_REFUNDABLE",
  AMOUNT_INVALID: "AMOUNT_INVALID",
  GENERIC_DECLINE: "GENERIC_DECLINE",
} as const;
export type RefundDeclineCode = (typeof RefundDeclineCode)[keyof typeof RefundDeclineCode];

export type PaymentOutcome =
  | {
      kind: "succeeded";
      paymentId: string;
      amountCents: number;
      status: string;
      rawStatus: string;
      cardLast4: string | null;
    }
  | {
      kind: "declined";
      paymentId: string | null;
      /** Customer-safe message — never Square field names or raw error text. */
      reason: string;
      code: PaymentDeclineCode;
    }
  | {
      kind: "transport_failure";
      /** May have charged — do not assume otherwise. Caller must reconcile via getPayment(). */
      message: string;
      paymentId: string | null;
    };

export type RefundOutcome =
  | { kind: "succeeded"; refundId: string; amountCents: number; status: string }
  | { kind: "declined"; reason: string; code: RefundDeclineCode }
  | {
      kind: "transport_failure";
      /** May have refunded — do not assume otherwise. Caller must reconcile via getRefund(). */
      message: string;
      refundId: string | null;
    };

/** Normalised payment shape returned by getPayment(). No Square field names leak past this type. */
export type NormalizedPayment = {
  paymentId: string;
  status: string;
  amountCents: number;
  orderId: string | null;
  referenceId: string | null;
  createdAt: string | null;
  cardLast4: string | null;
};

/** Normalised refund shape returned by getRefund(). */
export type NormalizedRefund = {
  refundId: string;
  paymentId: string | null;
  status: string;
  amountCents: number;
  createdAt: string | null;
};

export type CreatePaymentInput = {
  sourceId: string;
  amountCents: number;
  idempotencyKey: string;
  /** Our internal order id — stored as Square's referenceId, never as a price or secret. */
  orderId: string;
  /** Human-facing order number/reference — stored in Square's note field. */
  orderReference: string;
  locationId?: string;
};

export type RefundPaymentInput = {
  paymentId: string;
  amountCents: number;
  idempotencyKey: string;
};

export type VerifyWebhookSignatureInput = {
  body: string | Buffer;
  signatureHeader: string;
  notificationUrl: string;
};

export type SquareEnvironmentName = "sandbox" | "production";
