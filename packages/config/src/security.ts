// SPRINT-9: rate-limit knobs, body caps, trusted-proxy, and CSP for Square Web Payments.
import { env } from "./env";

export type RateBucketName =
  | "quote"
  | "orders"
  | "menu"
  | "storeStatus"
  | "orderStatus"
  | "kitchenSignin"
  | "adminSignin"
  | "adminApi"
  | "kitchenOther"
  | "clientError";

export type RateLimitRule = { limit: number; windowMs: number };

export const RATE_LIMITS: Record<RateBucketName, RateLimitRule> = {
  // Reprices a whole cart; unauthenticated POST.
  quote: { limit: 20, windowMs: 60_000 },
  // Touches money and Square. Idempotency covers duplicates; this covers volume.
  orders: { limit: 8, windowMs: 60_000 },
  // Cheap and cached; scrapers still get a ceiling.
  menu: { limit: 120, windowMs: 60_000 },
  storeStatus: { limit: 120, windowMs: 60_000 },
  // Unguessable token, but brute-force at volume is still abuse.
  orderStatus: { limit: 30, windowMs: 60_000 },
  kitchenSignin: { limit: 20, windowMs: 60_000 },
  adminSignin: { limit: 20, windowMs: 60_000 },
  adminApi: { limit: 120, windowMs: 60_000 },
  kitchenOther: { limit: 60, windowMs: 60_000 },
  clientError: { limit: 20, windowMs: 60_000 },
};

export const BODY_LIMITS = {
  jsonPublicBytes: 32 * 1024,
  jsonAdminBytes: 64 * 1024,
  webhookBytes: 1024 * 1024,
  printBytes: 256 * 1024,
} as const;

export const WORKER_STALE_DEFAULT_MS = 30_000;

/** Paths that must never be rate limited. Reasons live in docs/SPRINT-9-NOTES.md. */
export const RATE_LIMIT_EXEMPT_PATHS = [
  "/api/v1/print/poll",
  "/api/v1/print/complete",
  "/api/v1/webhooks/square",
  "/api/v1/webhooks/twilio",
  "/api/internal/kitchen/queue",
  "/api/v1/health",
] as const;

export function isRateLimitExemptPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  return (RATE_LIMIT_EXEMPT_PATHS as readonly string[]).includes(path);
}

export function trustProxyEnabled(): boolean {
  const raw = env.TRUST_PROXY?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function getLogLevelFromEnv(): "debug" | "info" | "warn" | "error" {
  const raw = env.LOG_LEVEL?.trim().toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return env.NODE_ENV === "production" ? "info" : "debug";
}

export function getWorkerStaleMs(): number {
  return env.WORKER_STALE_MS ?? WORKER_STALE_DEFAULT_MS;
}

/**
 * Square Web Payments SDK plus Next.js hydration.
 * `unsafe-inline` / `unsafe-eval` are required for the App Router without per-request nonces.
 */
export function contentSecurityPolicy(): string {
  const square = [
    "https://*.squarecdn.com",
    "https://*.squareup.com",
    "https://*.squareupsandbox.com",
    "https://web.squarecdn.com",
    "https://sandbox.web.squarecdn.com",
    "https://pci-connect.squareup.com",
    "https://pci-connect.squareupsandbox.com",
  ].join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${square}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `frame-src 'self' ${square}`,
    `connect-src 'self' ${square}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function browserSecurityHeaders(args: { isHttps: boolean; isProduction: boolean }): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": contentSecurityPolicy(),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-DNS-Prefetch-Control": "off",
  };
  if (args.isProduction && args.isHttps) {
    headers["Strict-Transport-Security"] = "max-age=15552000; includeSubDomains";
  }
  return headers;
}

export { PRINT_SECRET_MIN_PRODUCTION } from "./production-guards";
