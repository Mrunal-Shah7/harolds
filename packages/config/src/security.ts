// SPRINT-9 / SPRINT-17: rate-limit knobs, body caps, trusted-proxy, and CSP for NMI Collect.js.
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
  // Touches money and the payment gateway. The pre-charge guard covers duplicates; this covers volume.
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
  /** SPRINT-12: menu image upload (checked before the body is fully read). */
  imageUploadBytes: 8 * 1024 * 1024,
} as const;

export const WORKER_STALE_DEFAULT_MS = 30_000;

/** Paths that must never be rate limited. Reasons live in docs/SPRINT-9-NOTES.md. */
export const RATE_LIMIT_EXEMPT_PATHS = [
  "/api/v1/print/poll",
  "/api/v1/print/complete",
  "/api/v1/webhooks/nmi",
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
 * NMI Collect.js plus Next.js hydration.
 * `unsafe-inline` / `unsafe-eval` are required for the App Router without per-request nonces.
 *
 * Collect.js is served from the gateway host and mounts its card fields as iframes from that
 * same host, so the gateway origins must appear in script-src, style-src AND frame-src. Both
 * the sandbox and production hosts are listed: the CSP is a static header, and a build that
 * shipped only one would break the moment NMI_ENVIRONMENT flipped.
 */
export function contentSecurityPolicy(): string {
  const gateway = [
    "https://secure.nmi.com",
    "https://sandbox.nmi.com",
    "https://secure.networkmerchants.com",
  ].join(" ");
  /**
   * Apple's Pay JS SDK, which Collect.js injects ITSELF.
   *
   * Do not remove this on the reasoning that this checkout has no wallets — it does not, and
   * this is still required. Collect.js appends the script tag in its own constructor, at load
   * time, before `CollectJS.configure()` is ever called, with no flag to suppress it. Blocking
   * it does not prevent any feature we use; it only produces an unfixable CSP violation on
   * every single checkout page load, which is how a violation report stops being worth reading.
   * The host is `cdn-apple.com` (hyphen) — `cdn.apple.com` is a different name and will not match.
   */
  const collectJsApplePay = "https://applepay.cdn-apple.com";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${gateway} ${collectJsApplePay}`,
    `style-src 'self' 'unsafe-inline' ${gateway}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `frame-src 'self' ${gateway}`,
    `connect-src 'self' ${gateway}`,
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
