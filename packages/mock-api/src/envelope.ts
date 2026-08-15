// SPRINT-2: mock response envelope helpers — same shapes as apps/web/src/lib/api.ts
import {
  API_CONTRACT_VERSION,
  API_ERROR_STATUS,
  ApiErrorCode,
  type ApiErrorResponse,
  type ApiSuccess,
  type ResponseMeta,
} from "@harolds/types";

export function buildMeta(): ResponseMeta {
  return {
    serverTime: new Date().toISOString(),
    version: API_CONTRACT_VERSION,
  };
}

export function okBody<T>(data: T): ApiSuccess<T> {
  return { data, meta: buildMeta() };
}

export function failBody(
  code: ApiErrorCode,
  message: string,
  details: Record<string, unknown> | null = null,
): ApiErrorResponse {
  return {
    error: { code, message, details },
    meta: buildMeta(),
  };
}

export function statusFor(code: ApiErrorCode): number {
  return API_ERROR_STATUS[code];
}

export const FORCE_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  [ApiErrorCode.NOT_FOUND]: "Resource not found.",
  [ApiErrorCode.VALIDATION_ERROR]: "Request validation failed.",
  [ApiErrorCode.STORE_CLOSED]: "The store is currently closed.",
  [ApiErrorCode.STORE_NOT_ACCEPTING_ORDERS]: "The store is not accepting orders right now.",
  [ApiErrorCode.ITEM_UNAVAILABLE]: "This item is unavailable.",
  [ApiErrorCode.INTERNAL_ERROR]: "An unexpected error occurred.",
  [ApiErrorCode.PAYMENT_DECLINED]: "Card was declined.",
  [ApiErrorCode.PAYMENT_FAILED]: "Payment could not be confirmed.",
  [ApiErrorCode.IDEMPOTENCY_CONFLICT]: "Idempotency key conflict.",
  [ApiErrorCode.UNAUTHORIZED]: "Unauthorized.",
};

export function parseForceError(
  value: string | undefined | null,
): ApiErrorCode | null {
  if (!value) return null;
  const codes = Object.values(ApiErrorCode) as string[];
  return codes.includes(value) ? (value as ApiErrorCode) : null;
}
