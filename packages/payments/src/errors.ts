// SPRINT-4 / SPRINT-17 / SPRINT-18.3: translates NMI gateway results into this package's taxonomy.
// No gateway field names, numeric codes, or raw `responsetext` may leak past this
// module — every outward-facing shape is defined in `types.ts`.
//
// SPRINT-18.3: SALE results are read by `result-codes.ts`, built from the Merchant Pay Connect
// Result Code Table. What remains here is refund classification (unchanged in behaviour) and
// transport-error classification.
import { RefundDeclineCode } from "./types";

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
 * Codes that mean a reversal request may not have completed. They MUST NOT be reported as a
 * clean refusal: the reversal may exist at the processor, so the caller reconciles.
 */
const TRANSPORT_CODES = new Set(["420", "421", "430", "460"]);

/** Codes that mean our request or credentials are wrong — an operator problem. */
const CONFIG_ERROR_CODES = new Set(["410", "411"]);

export type NmiResult = {
  response: string;
  responseCode: string;
  responseText: string;
};

export type RefundErrorClassification =
  | { outcome: "declined_refund"; code: RefundDeclineCode; reason: string }
  | { outcome: "transport_failure"; message: string }
  | { outcome: "client_error"; error: PaymentClientError };

/** Classify a non-approved NMI result for a refund or void. */
export function classifyRefundResult(result: NmiResult): RefundErrorClassification {
  const { responseCode } = result;

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
