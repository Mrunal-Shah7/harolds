// SPRINT-4 / SPRINT-17: translates NMI gateway results into this package's taxonomy.
// No gateway field names, numeric codes, or raw `responsetext` may leak past this
// module — every outward-facing shape is defined in `types.ts`.
import { PaymentDeclineCode, RefundDeclineCode } from "./types";

/** Thrown for problems that are our/caller's fault (bad request, auth, config) — not a customer decline. */
export class PaymentClientError extends Error {
  /** Never the gateway's raw code — a short internal identifier for logs/tests. */
  readonly kind: "invalid_request" | "auth" | "unexpected";

  constructor(message: string, kind: "invalid_request" | "auth" | "unexpected" = "unexpected") {
    super(message);
    this.name = "PaymentClientError";
    this.kind = kind;
  }
}

/**
 * NMI's top-level `response` field. Unlike Square, NMI answers every outcome with HTTP 200
 * and a form-encoded body — a decline is a successful HTTP call, so nothing here is thrown.
 */
export const NmiResponse = {
  APPROVED: "1",
  DECLINED: "2",
  ERROR: "3",
} as const;

/**
 * NMI `response_code` → our decline vocabulary.
 * Source: NMI gateway response codes reference (100 approved, 2xx declines, 3xx/4xx errors).
 */
const PAYMENT_DECLINE_CODE_MAP: Record<string, PaymentDeclineCode> = {
  "200": PaymentDeclineCode.CARD_DECLINED, // Declined by processor
  "201": PaymentDeclineCode.CALL_ISSUER, // Do not honor
  "202": PaymentDeclineCode.INSUFFICIENT_FUNDS, // Insufficient funds
  "203": PaymentDeclineCode.TRANSACTION_LIMIT_EXCEEDED, // Over limit
  "204": PaymentDeclineCode.CARD_DECLINED, // Transaction not allowed
  "220": PaymentDeclineCode.INVALID_CARD, // Incorrect payment information
  "221": PaymentDeclineCode.INVALID_CARD, // No such card issuer
  "222": PaymentDeclineCode.CARD_DECLINED, // No card number on file with issuer
  "223": PaymentDeclineCode.CARD_EXPIRED, // Expired card
  "224": PaymentDeclineCode.CARD_EXPIRED, // Invalid expiration date
  "225": PaymentDeclineCode.CVV_FAILURE, // Invalid card security code
  "226": PaymentDeclineCode.CARD_DECLINED, // Invalid PIN
  "240": PaymentDeclineCode.CALL_ISSUER, // Call issuer for further information
  "250": PaymentDeclineCode.CALL_ISSUER, // Pick up card
  "251": PaymentDeclineCode.CALL_ISSUER, // Lost card
  "252": PaymentDeclineCode.CALL_ISSUER, // Stolen card
  "253": PaymentDeclineCode.CALL_ISSUER, // Fraudulent card
  "260": PaymentDeclineCode.CALL_ISSUER, // Declined with further instructions available
  "261": PaymentDeclineCode.CARD_DECLINED, // Declined - stop all recurring
  "262": PaymentDeclineCode.CARD_DECLINED, // Declined - stop this recurring program
  "263": PaymentDeclineCode.VERIFICATION_REQUIRED, // Declined - update cardholder data available
  "264": PaymentDeclineCode.CARD_DECLINED, // Declined - retry in a few days
  "461": PaymentDeclineCode.INVALID_CARD, // Unsupported card type
};

const PAYMENT_DECLINE_MESSAGES: Record<PaymentDeclineCode, string> = {
  [PaymentDeclineCode.CARD_DECLINED]: "Your card was declined. Please try a different payment method.",
  [PaymentDeclineCode.INSUFFICIENT_FUNDS]: "Your card has insufficient funds for this purchase.",
  [PaymentDeclineCode.CARD_EXPIRED]: "Your card has expired. Please use a different card.",
  [PaymentDeclineCode.INVALID_CARD]: "We couldn't process that card. Please check the details or try another card.",
  [PaymentDeclineCode.CVV_FAILURE]: "The security code or billing details didn't match. Please check and try again.",
  [PaymentDeclineCode.VERIFICATION_REQUIRED]: "Your bank requires additional verification for this payment.",
  [PaymentDeclineCode.CALL_ISSUER]: "Your card was declined. Please contact your bank or use a different card.",
  [PaymentDeclineCode.TRANSACTION_LIMIT_EXCEEDED]:
    "This payment exceeds a limit on your card. Please try a smaller amount or a different card.",
  [PaymentDeclineCode.ALREADY_USED]: "This payment method has already been used. Please try again.",
  [PaymentDeclineCode.GENERIC_DECLINE]: "Your card was declined. Please try a different payment method.",
};

const REFUND_DECLINE_CODE_MAP: Record<string, RefundDeclineCode> = {
  "200": RefundDeclineCode.GENERIC_DECLINE,
  "300": RefundDeclineCode.NOT_REFUNDABLE, // Rejected by gateway (e.g. already refunded / not settled)
  "400": RefundDeclineCode.NOT_REFUNDABLE, // Transaction error returned by processor
  "441": RefundDeclineCode.AMOUNT_INVALID, // Invalid transaction information from merchant
};

const REFUND_DECLINE_MESSAGES: Record<RefundDeclineCode, string> = {
  [RefundDeclineCode.ALREADY_REFUNDED]: "This payment already has a refund pending or completed.",
  [RefundDeclineCode.NOT_REFUNDABLE]: "This payment can no longer be refunded.",
  [RefundDeclineCode.AMOUNT_INVALID]: "The refund amount is invalid for this payment.",
  [RefundDeclineCode.GENERIC_DECLINE]: "The refund could not be processed.",
};

/**
 * Codes that mean the request may not have completed. These MUST NOT be reported to the
 * customer as a clean decline: the charge may exist at the processor, so the caller has to
 * reconcile rather than let the customer retry into a double charge.
 */
const TRANSPORT_CODES = new Set(["420", "421", "430", "460"]);

/**
 * Codes that mean our request or credentials are wrong — an operator problem, not the
 * customer's. These surface as PaymentClientError so they page us instead of blaming the card.
 */
const CONFIG_ERROR_CODES = new Set(["410", "411"]);

/** Gateway `responsetext` values that signal a spent or stale Collect.js token. */
const TOKEN_REUSE_PATTERN = /invalid token|token (?:has )?(?:expired|already been used)|payment token/i;

export type NmiResult = {
  response: string;
  responseCode: string;
  responseText: string;
};

export type PaymentErrorClassification =
  | { outcome: "declined_payment"; code: PaymentDeclineCode; reason: string }
  | { outcome: "transport_failure"; message: string }
  | { outcome: "client_error"; error: PaymentClientError };

export type RefundErrorClassification =
  | { outcome: "declined_refund"; code: RefundDeclineCode; reason: string }
  | { outcome: "transport_failure"; message: string }
  | { outcome: "client_error"; error: PaymentClientError };

export type ErrorClassification = PaymentErrorClassification | RefundErrorClassification;

/**
 * Classify a non-approved NMI result. `mode` selects whether decline codes should be
 * interpreted using the payment or refund vocabulary — the overloads narrow the return
 * type so callers never see the other mode's shape.
 */
export function classifyNmiResult(result: NmiResult, mode: "payment"): PaymentErrorClassification;
export function classifyNmiResult(result: NmiResult, mode: "refund"): RefundErrorClassification;
export function classifyNmiResult(result: NmiResult, mode: "payment" | "refund"): ErrorClassification {
  const { responseCode, responseText } = result;

  if (TRANSPORT_CODES.has(responseCode)) {
    return {
      outcome: "transport_failure",
      message: "The payment processor request could not be confirmed.",
    };
  }

  if (CONFIG_ERROR_CODES.has(responseCode)) {
    return {
      outcome: "client_error",
      error: new PaymentClientError("Payment processor rejected the request credentials.", "auth"),
    };
  }

  if (mode === "payment") {
    // A spent/expired Collect.js token is a rejection (code 300), not a card decline. Say so
    // plainly: the customer's card is fine and re-entering it will work.
    if (responseCode === "300" && TOKEN_REUSE_PATTERN.test(responseText)) {
      return {
        outcome: "declined_payment",
        code: PaymentDeclineCode.ALREADY_USED,
        reason: PAYMENT_DECLINE_MESSAGES[PaymentDeclineCode.ALREADY_USED],
      };
    }
    const declineCode = PAYMENT_DECLINE_CODE_MAP[responseCode];
    if (declineCode) {
      return { outcome: "declined_payment", code: declineCode, reason: PAYMENT_DECLINE_MESSAGES[declineCode] };
    }
    if (result.response === NmiResponse.DECLINED) {
      return {
        outcome: "declined_payment",
        code: PaymentDeclineCode.GENERIC_DECLINE,
        reason: PAYMENT_DECLINE_MESSAGES[PaymentDeclineCode.GENERIC_DECLINE],
      };
    }
  }

  if (mode === "refund") {
    const declineCode = REFUND_DECLINE_CODE_MAP[responseCode];
    if (declineCode) {
      return { outcome: "declined_refund", code: declineCode, reason: REFUND_DECLINE_MESSAGES[declineCode] };
    }
    if (result.response === NmiResponse.DECLINED) {
      return {
        outcome: "declined_refund",
        code: RefundDeclineCode.GENERIC_DECLINE,
        reason: REFUND_DECLINE_MESSAGES[RefundDeclineCode.GENERIC_DECLINE],
      };
    }
  }

  // `response=3` with an unmapped code is a gateway-side rejection of OUR request.
  return {
    outcome: "client_error",
    error: new PaymentClientError(
      `Payment processor rejected the request as invalid (code ${responseCode || "unknown"}).`,
      "invalid_request",
    ),
  };
}

/** Classify a thrown transport-level failure (DNS, reset, timeout, unreadable body). */
export function classifyTransportError(err: unknown): { outcome: "transport_failure"; message: string } {
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return { outcome: "transport_failure", message: "Request to the payment processor timed out." };
  }
  return { outcome: "transport_failure", message: "Could not reach the payment processor." };
}
