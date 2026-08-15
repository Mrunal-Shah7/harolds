// SPRINT-9: apply in-process rate limits and attach Retry-After. Exempt paths skip this.
import { RATE_LIMITS, isRateLimitExemptPath, type RateBucketName } from "@harolds/config";
import { NextResponse } from "next/server";
import { clientAddress } from "@/lib/client-ip";
import { takeRateLimit } from "@/lib/rate-limit";
import { bindRequestId, getRequestId } from "@/lib/request-context";

function pathnameOf(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "";
  }
}

export function rateLimitedResponse(retryAfterSeconds: number, bucket: RateBucketName): NextResponse {
  const requestId = getRequestId();
  return NextResponse.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Try again shortly.",
        details: { retryAfterSeconds, bucket },
      },
      meta: {
        serverTime: new Date().toISOString(),
        requestId: requestId ?? null,
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "Cache-Control": "no-store",
        "X-RateLimit-Limit": String(RATE_LIMITS[bucket].limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

export class RateLimitedError extends Error {
  constructor(
    public retryAfterSeconds: number,
    public bucket: RateBucketName,
  ) {
    super("Too many requests. Try again shortly.");
    this.name = "RateLimitedError";
  }
}

export function enforceRateLimit(request: Request, bucket: RateBucketName): NextResponse | null {
  bindRequestId(request);
  if (isRateLimitExemptPath(pathnameOf(request))) return null;
  const decision = takeRateLimit({
    bucket,
    clientId: clientAddress(request),
  });
  if (decision.limited) {
    return rateLimitedResponse(decision.retryAfterSeconds, bucket);
  }
  return null;
}

export function assertNotRateLimited(request: Request, bucket: RateBucketName): void {
  bindRequestId(request);
  if (isRateLimitExemptPath(pathnameOf(request))) return;
  const decision = takeRateLimit({
    bucket,
    clientId: clientAddress(request),
  });
  if (decision.limited) {
    throw new RateLimitedError(decision.retryAfterSeconds, bucket);
  }
}
