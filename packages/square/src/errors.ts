// SPRINT-4: translates Square SDK errors into this package's taxonomy.
// No Square field names, error codes, or category strings may leak past this
// module — every outward-facing shape is defined in `types.ts`.
import { ErrorCode, SquareError, SquareTimeoutError } from "square";

import { PaymentDeclineCode, RefundDeclineCode } from "./types";

/** Thrown for problems that are our/caller's fault (bad request, auth, config) — not a customer decline. */
export class SquareClientError extends Error {
  /** Never Square's raw error code — a short internal identifier for logs/tests. */
  readonly kind: "invalid_request" | "auth" | "unexpected";

  constructor(message: string, kind: "invalid_request" | "auth" | "unexpected" = "unexpected") {
    super(message);
    this.name = "SquareClientError";
    this.kind = kind;
  }
}

const PAYMENT_DECLINE_CODE_MAP: Partial<Record<ErrorCode, PaymentDeclineCode>> = {
  [ErrorCode.GenericDecline]: PaymentDeclineCode.GENERIC_DECLINE,
  [ErrorCode.CardDeclined]: PaymentDeclineCode.CARD_DECLINED,
  [ErrorCode.CardDeclinedCallIssuer]: PaymentDeclineCode.CALL_ISSUER,
  [ErrorCode.CardDeclinedVerificationRequired]: PaymentDeclineCode.VERIFICATION_REQUIRED,
  [ErrorCode.InsufficientFunds]: PaymentDeclineCode.INSUFFICIENT_FUNDS,
  [ErrorCode.GiftCardAvailableAmount]: PaymentDeclineCode.INSUFFICIENT_FUNDS,
  [ErrorCode.CardExpired]: PaymentDeclineCode.CARD_EXPIRED,
  [ErrorCode.InvalidExpiration]: PaymentDeclineCode.CARD_EXPIRED,
  [ErrorCode.InvalidExpirationYear]: PaymentDeclineCode.CARD_EXPIRED,
  [ErrorCode.InvalidExpirationDate]: PaymentDeclineCode.CARD_EXPIRED,
  [ErrorCode.BadExpiration]: PaymentDeclineCode.CARD_EXPIRED,
  [ErrorCode.InvalidCard]: PaymentDeclineCode.INVALID_CARD,
  [ErrorCode.InvalidCardData]: PaymentDeclineCode.INVALID_CARD,
  [ErrorCode.InvalidEncryptedCard]: PaymentDeclineCode.INVALID_CARD,
  [ErrorCode.UnsupportedCardBrand]: PaymentDeclineCode.INVALID_CARD,
  [ErrorCode.CardNotSupported]: PaymentDeclineCode.INVALID_CARD,
  [ErrorCode.PanFailure]: PaymentDeclineCode.INVALID_CARD,
  [ErrorCode.CvvFailure]: PaymentDeclineCode.CVV_FAILURE,
  [ErrorCode.VerifyCvvFailure]: PaymentDeclineCode.CVV_FAILURE,
  [ErrorCode.AddressVerificationFailure]: PaymentDeclineCode.CVV_FAILURE,
  [ErrorCode.VerifyAvsFailure]: PaymentDeclineCode.CVV_FAILURE,
  [ErrorCode.InvalidPostalCode]: PaymentDeclineCode.CVV_FAILURE,
  [ErrorCode.TransactionLimit]: PaymentDeclineCode.TRANSACTION_LIMIT_EXCEEDED,
  [ErrorCode.PaymentLimitExceeded]: PaymentDeclineCode.TRANSACTION_LIMIT_EXCEEDED,
  [ErrorCode.AmountTooHigh]: PaymentDeclineCode.TRANSACTION_LIMIT_EXCEEDED,
  [ErrorCode.CardTokenUsed]: PaymentDeclineCode.ALREADY_USED,
  [ErrorCode.SourceUsed]: PaymentDeclineCode.ALREADY_USED,
  [ErrorCode.CardTokenExpired]: PaymentDeclineCode.ALREADY_USED,
  [ErrorCode.SourceExpired]: PaymentDeclineCode.ALREADY_USED,
  [ErrorCode.AccountUnusable]: PaymentDeclineCode.CARD_DECLINED,
  [ErrorCode.BuyerRefusedPayment]: PaymentDeclineCode.CARD_DECLINED,
  [ErrorCode.InvalidAccount]: PaymentDeclineCode.CARD_DECLINED,
  [ErrorCode.InvalidPin]: PaymentDeclineCode.CARD_DECLINED,
  [ErrorCode.MissingPin]: PaymentDeclineCode.CARD_DECLINED,
  [ErrorCode.AllowablePinTriesExceeded]: PaymentDeclineCode.CARD_DECLINED,
  [ErrorCode.ReaderDeclined]: PaymentDeclineCode.CARD_DECLINED,
  [ErrorCode.VoiceFailure]: PaymentDeclineCode.CARD_DECLINED,
  [ErrorCode.ExpirationFailure]: PaymentDeclineCode.CARD_EXPIRED,
  [ErrorCode.ChipInsertionRequired]: PaymentDeclineCode.CARD_DECLINED,
  [ErrorCode.ReservationDeclined]: PaymentDeclineCode.CARD_DECLINED,
};

const PAYMENT_DECLINE_MESSAGES: Record<PaymentDeclineCode, string> = {
  [PaymentDeclineCode.CARD_DECLINED]: "Your card was declined. Please try a different payment method.",
  [PaymentDeclineCode.INSUFFICIENT_FUNDS]: "Your card has insufficient funds for this purchase.",
  [PaymentDeclineCode.CARD_EXPIRED]: "Your card has expired. Please use a different card.",
  [PaymentDeclineCode.INVALID_CARD]: "We couldn't process that card. Please check the details or try another card.",
  [PaymentDeclineCode.CVV_FAILURE]: "The security code or billing details didn't match. Please check and try again.",
  [PaymentDeclineCode.VERIFICATION_REQUIRED]: "Your bank requires additional verification for this payment.",
  [PaymentDeclineCode.CALL_ISSUER]: "Your card was declined. Please contact your bank or use a different card.",
  [PaymentDeclineCode.TRANSACTION_LIMIT_EXCEEDED]: "This payment exceeds a limit on your card. Please try a smaller amount or a different card.",
  [PaymentDeclineCode.ALREADY_USED]: "This payment method has already been used. Please try again.",
  [PaymentDeclineCode.GENERIC_DECLINE]: "Your card was declined. Please try a different payment method.",
};

const REFUND_DECLINE_CODE_MAP: Partial<Record<ErrorCode, RefundDeclineCode>> = {
  [ErrorCode.RefundAmountInvalid]: RefundDeclineCode.AMOUNT_INVALID,
  [ErrorCode.RefundAlreadyPending]: RefundDeclineCode.ALREADY_REFUNDED,
  [ErrorCode.PaymentNotRefundable]: RefundDeclineCode.NOT_REFUNDABLE,
  [ErrorCode.PaymentNotRefundableDueToDispute]: RefundDeclineCode.NOT_REFUNDABLE,
  [ErrorCode.RefundErrorPaymentNeedsCompletion]: RefundDeclineCode.NOT_REFUNDABLE,
  [ErrorCode.RefundDeclined]: RefundDeclineCode.GENERIC_DECLINE,
  [ErrorCode.InsufficientPermissionsForRefund]: RefundDeclineCode.NOT_REFUNDABLE,
};

const REFUND_DECLINE_MESSAGES: Record<RefundDeclineCode, string> = {
  [RefundDeclineCode.ALREADY_REFUNDED]: "This payment already has a refund pending or completed.",
  [RefundDeclineCode.NOT_REFUNDABLE]: "This payment can no longer be refunded.",
  [RefundDeclineCode.AMOUNT_INVALID]: "The refund amount is invalid for this payment.",
  [RefundDeclineCode.GENERIC_DECLINE]: "The refund could not be processed.",
};

/** Error codes/categories that mean the request may not have completed — safe to treat as transport_failure. */
const TRANSPORT_CODES = new Set<ErrorCode>([
  ErrorCode.InternalServerError,
  ErrorCode.ServiceUnavailable,
  ErrorCode.BadGateway,
  ErrorCode.GatewayTimeout,
  ErrorCode.RequestTimeout,
  ErrorCode.TemporaryError,
  ErrorCode.RateLimited,
  // The idempotency key was already used for a request — outcome of that prior
  // request is unknown to us here, so treat conservatively as indeterminate.
  ErrorCode.IdempotencyKeyReused,
]);

function firstBodyError(err: SquareError): SquareError.BodyError | undefined {
  return err.errors[0];
}

export type PaymentErrorClassification =
  | { outcome: "declined_payment"; code: PaymentDeclineCode; reason: string }
  | { outcome: "transport_failure"; message: string }
  | { outcome: "client_error"; error: SquareClientError };

export type RefundErrorClassification =
  | { outcome: "declined_refund"; code: RefundDeclineCode; reason: string }
  | { outcome: "transport_failure"; message: string }
  | { outcome: "client_error"; error: SquareClientError };

export type ErrorClassification = PaymentErrorClassification | RefundErrorClassification;

/**
 * Classify a caught error from a Square SDK call. `mode` selects whether decline
 * codes should be interpreted using the payment or refund vocabulary — the
 * overloads narrow the return type so callers never see the other mode's shape.
 */
export function classifySquareError(err: unknown, mode: "payment"): PaymentErrorClassification;
export function classifySquareError(err: unknown, mode: "refund"): RefundErrorClassification;
export function classifySquareError(err: unknown, mode: "payment" | "refund"): ErrorClassification {
  if (err instanceof SquareTimeoutError) {
    return { outcome: "transport_failure", message: "Request to the payment processor timed out." };
  }

  if (err instanceof SquareError) {
    const statusCode = err.statusCode;
    const bodyError = firstBodyError(err);
    const code = bodyError?.code as ErrorCode | undefined;

    if (statusCode !== undefined && statusCode >= 500) {
      return { outcome: "transport_failure", message: "The payment processor returned a server error." };
    }
    if (statusCode === undefined) {
      return { outcome: "transport_failure", message: "The payment processor did not return a usable response." };
    }
    if (code && TRANSPORT_CODES.has(code)) {
      return { outcome: "transport_failure", message: "The payment processor request could not be confirmed." };
    }

    if (mode === "payment" && code) {
      const declineCode = PAYMENT_DECLINE_CODE_MAP[code];
      if (declineCode) {
        return { outcome: "declined_payment", code: declineCode, reason: PAYMENT_DECLINE_MESSAGES[declineCode] };
      }
    }
    if (mode === "refund" && code) {
      const declineCode = REFUND_DECLINE_CODE_MAP[code];
      if (declineCode) {
        return { outcome: "declined_refund", code: declineCode, reason: REFUND_DECLINE_MESSAGES[declineCode] };
      }
    }

    if (statusCode === 401 || statusCode === 403) {
      return {
        outcome: "client_error",
        error: new SquareClientError("Payment processor rejected the request credentials.", "auth"),
      };
    }

    return {
      outcome: "client_error",
      error: new SquareClientError(
        `Payment processor rejected the request as invalid (status ${statusCode}).`,
        "invalid_request",
      ),
    };
  }

  // Network-level failure (DNS, connection reset, fetch throwing a plain Error/TypeError, etc.)
  return { outcome: "transport_failure", message: "Could not reach the payment processor." };
}
