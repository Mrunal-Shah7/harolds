// SPRINT-6: kitchen-internal HTTP helpers — distinct session errors, not the public contract.
import {
  KitchenErrorCode,
  KITCHEN_ERROR_STATUS,
  type KitchenErrorCode as KitchenErrorCodeT,
} from "@harolds/types";
import { NextResponse } from "next/server";
import {
  AccountDisabledError,
  PinInvalidError,
  PinLockedError,
  SessionExpiredError,
  SessionRequiredError,
  SessionRevokedError,
} from "@harolds/db";

export function kitchenOk<T>(data: T, init?: { status?: number }): NextResponse {
  return NextResponse.json(
    { data, meta: { serverTime: new Date().toISOString() } },
    {
      status: init?.status ?? 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export function kitchenFail(
  code: KitchenErrorCodeT,
  message: string,
  details: Record<string, unknown> | null = null,
): NextResponse {
  return NextResponse.json(
    {
      error: { code, message, details },
      meta: { serverTime: new Date().toISOString() },
    },
    {
      status: KITCHEN_ERROR_STATUS[code],
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export function kitchenAuthError(err: unknown): NextResponse {
  if (err instanceof SessionRequiredError) {
    return kitchenFail(KitchenErrorCode.SESSION_REQUIRED, err.message);
  }
  if (err instanceof SessionExpiredError) {
    return kitchenFail(KitchenErrorCode.SESSION_EXPIRED, err.message);
  }
  if (err instanceof SessionRevokedError) {
    return kitchenFail(KitchenErrorCode.SESSION_REVOKED, err.message);
  }
  if (err instanceof AccountDisabledError) {
    return kitchenFail(KitchenErrorCode.ACCOUNT_DISABLED, err.message);
  }
  if (err instanceof PinLockedError) {
    return kitchenFail(KitchenErrorCode.PIN_LOCKED, err.message, {
      lockedUntil: err.lockedUntil.toISOString(),
      retryAfterSeconds: err.retryAfterSeconds,
    });
  }
  if (err instanceof PinInvalidError) {
    return kitchenFail(KitchenErrorCode.PIN_INVALID, err.message);
  }
  if (err instanceof SyntaxError) {
    return kitchenFail(KitchenErrorCode.VALIDATION_ERROR, "Request body must be JSON.");
  }
  throw err;
}
