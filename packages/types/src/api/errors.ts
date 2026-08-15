// SPRINT-4: API error codes — stable machine-readable identifiers; part of the frozen contract.
export const ApiErrorCode = {
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  STORE_CLOSED: "STORE_CLOSED",
  STORE_NOT_ACCEPTING_ORDERS: "STORE_NOT_ACCEPTING_ORDERS",
  ITEM_UNAVAILABLE: "ITEM_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  /** Card / issuer declined the charge. */
  PAYMENT_DECLINED: "PAYMENT_DECLINED",
  /** Payment could not be confirmed (transport / unknown). Customer must not blindly retry. */
  PAYMENT_FAILED: "PAYMENT_FAILED",
  /** Same client idempotency key reused with a different cart. */
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  /** Webhook signature verification failed. */
  UNAUTHORIZED: "UNAUTHORIZED",
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/** HTTP status mapped from each error code. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  STORE_CLOSED: 409,
  STORE_NOT_ACCEPTING_ORDERS: 409,
  ITEM_UNAVAILABLE: 409,
  INTERNAL_ERROR: 500,
  PAYMENT_DECLINED: 402,
  PAYMENT_FAILED: 502,
  IDEMPOTENCY_CONFLICT: 409,
  UNAUTHORIZED: 401,
};

/** Contract version — 1.2.0 adds orders, payment, and webhooks (additive over 1.1.0). */
export const API_CONTRACT_VERSION = "1.2.0" as const;
