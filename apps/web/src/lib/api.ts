// SPRINT-2: public API response helpers — success/error envelopes and status mapping
import {
  API_CONTRACT_VERSION,
  API_ERROR_STATUS,
  ApiErrorCode,
  type ApiErrorResponse,
  type ApiSuccess,
  type ResponseMeta,
} from "@harolds/types";
import { NextResponse } from "next/server";
import { emitLog } from "@harolds/config";
import { captureException } from "@/lib/errors";

export function buildMeta(): ResponseMeta {
  return {
    serverTime: new Date().toISOString(),
    version: API_CONTRACT_VERSION,
  };
}

export function ok<T>(data: T, init?: { status?: number; headers?: HeadersInit }): NextResponse {
  const body: ApiSuccess<T> = { data, meta: buildMeta() };
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: init?.headers,
  });
}

export function fail(
  code: ApiErrorCode,
  message: string,
  details: Record<string, unknown> | null = null,
): NextResponse {
  const body: ApiErrorResponse = {
    error: { code, message, details },
    meta: buildMeta(),
  };
  return NextResponse.json(body, { status: API_ERROR_STATUS[code] });
}

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function handleRouteError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return fail(err.code, err.message, err.details);
  }
  if (err instanceof SyntaxError) {
    return fail(ApiErrorCode.VALIDATION_ERROR, "Request body must be JSON.", {
      reasons: [{ code: "MALFORMED_BODY", message: "Request body must be valid JSON." }],
    });
  }
  emitLog("error", "api.unhandled", { name: err instanceof Error ? err.name : "Error" }, { scope: "api" });
  void captureException(err, { surface: "api" });
  return fail(ApiErrorCode.INTERNAL_ERROR, "An unexpected error occurred.");
}
