// SPRINT-9 / SPRINT-17 / SPRINT-18.2 / SPRINT-19: rate-limit knobs, body caps, trusted-proxy, and CSP for NMI Collect.js and the wallets.
import { env } from "./env";
import { nmiGatewayUrls, WALLET_ORIGINS, type NmiEnvironment } from "./nmi-gateway";
import { getWalletFlags, type WalletFlags } from "./payments";
import { GOOGLE_TAG_CSP } from "./google-tag";

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
 * same host, so the gateway origin must appear in script-src, style-src, frame-src AND
 * connect-src. Only the ACTIVE environment's gateway is allowed, taken from `nmi-gateway.ts`:
 * the header is built from the same `NMI_ENVIRONMENT` as the checkout page's Collect.js URL,
 * so the two cannot disagree, and a list of every gateway ever used is looser than it needs to
 * be and a place for a stale entry to hide.
 */
export function contentSecurityPolicy(
  environment: NmiEnvironment = env.NMI_ENVIRONMENT,
  wallets: WalletFlags = getWalletFlags(),
): string {
  const gateway = nmiGatewayUrls(environment).origin;
  /**
   * Apple's Pay JS SDK, which Collect.js injects ITSELF.
   *
   * Do not remove this on the reasoning that a wallet is switched off — it is still required.
   * Collect.js appends the script tag in its own constructor, at load time, before
   * `CollectJS.configure()` is ever called, with no flag to suppress it. Blocking it does not
   * prevent any feature we use; it only produces an unfixable CSP violation on every single
   * checkout page load, which is how a violation report stops being worth reading.
   * The host is `cdn-apple.com` (hyphen) — `cdn.apple.com` is a different name and will not match.
   *
   * SPRINT-19: Safari needs nothing more for Apple Pay — its button renders in the page and
   * Collect.js validates the merchant session through the gateway. Every OTHER browser gets
   * Apple's "scan with your iPhone" sheet, which the same SDK shows as an iframe from its own host
   * after checking the merchant's registration with Apple. Blocking either leaves the customer a
   * blank sheet (found in production on Chrome), so both are allowed while Apple Pay is on.
   */
  const collectJsApplePay = WALLET_ORIGINS.applePaySdk;
  const appleFrames = wallets.applePay ? ` ${WALLET_ORIGINS.applePaySdk}` : "";
  const appleConnect = wallets.applePay ? ` ${WALLET_ORIGINS.applePayMerchantCheck}` : "";
  /**
   * SPRINT-19: Google Pay, ONLY while PAYMENTS_GOOGLE_PAY_ENABLED is on, in exactly the directives
   * it uses: Google's Pay API script and its calls and frames (NMI's Collect.js CSP list), and the
   * host Collect.js mounts the Google Pay button iframe from. With the flag off every directive is
   * byte-identical to the pre-wallet header (proven in security.test.ts).
   */
  const google = wallets.googlePay ? ` ${WALLET_ORIGINS.googlePay}` : "";
  const googleFrames = wallets.googlePay ? ` ${WALLET_ORIGINS.collectWalletFrames} ${WALLET_ORIGINS.googlePay}` : "";
  /** The Google Ads tag the storefront loads (google-tag.ts), appended last in each directive. */
  const tag = (directive: keyof typeof GOOGLE_TAG_CSP) => ` ${GOOGLE_TAG_CSP[directive].join(" ")}`;
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${gateway} ${collectJsApplePay}${google}${tag("script-src")}`,
    `style-src 'self' 'unsafe-inline' ${gateway}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `frame-src 'self' ${gateway}${appleFrames}${googleFrames}${tag("frame-src")}`,
    `connect-src 'self' ${gateway}${appleConnect}${google}${tag("connect-src")}`,
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
