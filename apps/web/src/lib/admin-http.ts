// SPRINT-8: admin-internal HTTP helpers — not the public storefront contract.
import {
  AdminErrorCode,
  ADMIN_ERROR_STATUS,
  type AdminErrorCode as AdminErrorCodeT,
} from "@harolds/types";
import { NextResponse } from "next/server";
import {
  AccountDisabledError,
  AdminForbiddenError,
  AdminValidationError,
  PasswordInvalidError,
  PasswordLockedError,
  PasswordTooWeakError,
  PinConflictError,
  SessionExpiredError,
  SessionRequiredError,
  SessionRevokedError,
} from "@harolds/db";
import { RateLimitedError, rateLimitedResponse } from "@/lib/enforce-rate-limit";

export const ADMIN_COOKIE = "harolds_admin";

export function adminOk<T>(data: T, init?: { status?: number }): NextResponse {
  return NextResponse.json(
    { data, meta: { serverTime: new Date().toISOString() } },
    {
      status: init?.status ?? 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export function adminFail(
  code: AdminErrorCodeT,
  message: string,
  details: Record<string, unknown> | null = null,
): NextResponse {
  return NextResponse.json(
    {
      error: { code, message, details },
      meta: { serverTime: new Date().toISOString() },
    },
    {
      status: ADMIN_ERROR_STATUS[code],
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export function adminAuthError(err: unknown): NextResponse {
  if (err instanceof RateLimitedError) {
    return rateLimitedResponse(err.retryAfterSeconds, err.bucket);
  }
  if (err instanceof SessionRequiredError) {
    return adminFail(AdminErrorCode.SESSION_REQUIRED, err.message);
  }
  if (err instanceof SessionExpiredError) {
    return adminFail(AdminErrorCode.SESSION_EXPIRED, err.message);
  }
  if (err instanceof SessionRevokedError) {
    return adminFail(AdminErrorCode.SESSION_REVOKED, err.message);
  }
  if (err instanceof AccountDisabledError) {
    return adminFail(AdminErrorCode.ACCOUNT_DISABLED, err.message);
  }
  if (err instanceof PasswordLockedError) {
    return adminFail(AdminErrorCode.PASSWORD_LOCKED, err.message, {
      lockedUntil: err.lockedUntil.toISOString(),
      retryAfterSeconds: err.retryAfterSeconds,
    });
  }
  if (err instanceof PasswordInvalidError) {
    return adminFail(AdminErrorCode.PASSWORD_INVALID, err.message);
  }
  if (err instanceof AdminForbiddenError) {
    return adminFail(AdminErrorCode.FORBIDDEN, err.message);
  }
  if (err instanceof PasswordTooWeakError || err instanceof AdminValidationError) {
    return adminFail(AdminErrorCode.VALIDATION_ERROR, err.message);
  }
  if (err instanceof PinConflictError) {
    return adminFail(AdminErrorCode.CONFLICT, err.message);
  }
  if (err instanceof SyntaxError) {
    return adminFail(AdminErrorCode.VALIDATION_ERROR, "Request body must be JSON.");
  }
  throw err;
}

export function readAdminToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const parts = cookie.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(`${ADMIN_COOKIE}=`)) {
      return decodeURIComponent(part.slice(ADMIN_COOKIE.length + 1));
    }
  }
  return null;
}

export function attachAdminCookie(response: NextResponse, token: string, maxAgeSec: number): void {
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSec,
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearAdminCookie(response: NextResponse): void {
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
