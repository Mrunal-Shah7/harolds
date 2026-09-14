// SPRINT-4 / SPRINT-17: public result/error taxonomy for payment operations.
// These types intentionally do not mirror the gateway's wire shapes field-for-field —
// callers outside this package must never need to know NMI's vocabulary.

/**
 * Our own decline vocabulary. NMI's numeric `response_code` values are translated
 * into one of these before leaving the module (see `errors.ts`).
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
      /** Customer-safe message — never gateway field names or raw error text. */
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

/** Normalised payment shape returned by getPayment(). No gateway field names leak past this type. */
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
  /** Single-use Collect.js token. Never card data — the PAN never reaches our servers. */
  paymentToken: string;
  amountCents: number;
  /**
   * Correlation id for logs only — NOT an idempotency key. NMI has no equivalent of Square's
   * `idempotencyKey`, and nothing about this value makes a repeated call safe. The guard
   * against a double charge is the caller's atomic pre-charge claim; see checkout.ts.
   */
  correlationId: string;
  /** Our internal order id — sent as the gateway's merchant-defined reference, never a price or secret. */
  orderId: string;
  /** Human-facing order number/reference — sent in the gateway's order_description field. */
  orderReference: string;
};

export type RefundPaymentInput = {
  paymentId: string;
  amountCents: number;
  /** Correlation id for logs only — see the note on CreatePaymentInput.correlationId. */
  correlationId: string;
  /**
   * When true, reverse with `type=void` instead of `type=refund`. Callers that do not know
   * should leave this undefined: the client then probes the transaction's settlement state.
   */
  void?: boolean;
};

export type VerifyWebhookSignatureInput = {
  body: string | Buffer;
  signatureHeader: string;
};

export type PaymentEnvironmentName = "sandbox" | "production";
