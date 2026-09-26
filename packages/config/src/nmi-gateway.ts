// SPRINT-18.2 / SPRINT-19: the payment gateway's address — the ONLY place in the repository that states it.
// SPRINT-19: and the digital wallets' external origins, for the same reason.
//
// Every consumer derives from here: the Payment API and Query API URLs (payments.ts → the
// payments client), the Collect.js script URL (checkout layout → payment form), the CSP gateway
// origin (security.ts), and the health/startup reports. Sprint 17 wrote the host independently
// in three places and all three pointed at the wrong gateway; do not add a second literal.
//
// The host is code, not an environment variable, on purpose. It changes only when the reseller
// changes, and a mistyped env value would route real card traffic somewhere unintended.
import { env } from "./env";

export type NmiEnvironment = "sandbox" | "production";

/**
 * This MID is a Merchant Pay Connect account — an NMI white-label reseller — so its live gateway
 * is the reseller's host, NOT NMI's generic `secure.nmi.com`. The production origin and the three
 * paths below were confirmed by the operator from Merchant Pay Connect (Sprint 18.2); they match
 * NMI's standard path layout.
 *
 * Merchant Pay Connect offers no test environment for this MID. The sandbox branch therefore
 * points at a generic NMI sandbox account unrelated to it: it exercises this code path, not the
 * real integration.
 */
const GATEWAY_ORIGINS: Record<NmiEnvironment, string> = {
  production: "https://mpc.transactiongateway.com",
  sandbox: "https://sandbox.nmi.com",
};

export type NmiGatewayUrls = {
  environment: NmiEnvironment;
  /** Scheme + host. What the CSP allows. */
  origin: string;
  /** Payment API: sale, auth, capture, void, refund. */
  transactUrl: string;
  /** Query API: transaction lookups for recovery, webhooks and reconciliation. */
  queryUrl: string;
  /** Collect.js. Its card-field iframes are served from the same origin as the script. */
  collectJsUrl: string;
};

export function nmiGatewayUrls(environment: NmiEnvironment): NmiGatewayUrls {
  const origin = GATEWAY_ORIGINS[environment];
  if (!origin) {
    throw new Error(`No payment gateway is defined for NMI_ENVIRONMENT "${String(environment)}".`);
  }
  return {
    environment,
    origin,
    transactUrl: `${origin}/api/transact.php`,
    queryUrl: `${origin}/api/query.php`,
    collectJsUrl: `${origin}/token/Collect.js`,
  };
}

/** The gateway for the running process's `NMI_ENVIRONMENT`. */
export function activeNmiGateway(): NmiGatewayUrls {
  return nmiGatewayUrls(env.NMI_ENVIRONMENT);
}

/**
 * SPRINT-19: the external origins the digital wallets need. They live here, beside the gateway,
 * for the same reason: one literal, derived everywhere else (CSP, checkout props). Sources are in
 * docs/SPRINT-19-NOTES.md §0.9 and §3.
 *
 * - `applePaySdk`: Apple's Pay JS SDK. Collect.js injects it on EVERY checkout load, wallets or
 *   not, so the CSP allows it unconditionally (security.ts). Apple Pay itself adds no other
 *   origin: its button renders in the page and merchant validation goes through the gateway.
 * - `collectWalletFrames`: Collect.js mounts the Google Pay button as an iframe from this host.
 *   It is hard-coded in the Collect.js build (`googlePayIFrameRootUrl`), not in NMI's CSP list.
 * - `googlePay`: Google's Pay API. Loaded by the checkout ONLY to ask `isReadyToPay`, because
 *   Collect.js reports no Google Pay availability of its own.
 */
export const WALLET_ORIGINS = {
  applePaySdk: "https://applepay.cdn-apple.com",
  collectWalletFrames: "https://collectcheckout.com",
  googlePay: "https://pay.google.com",
} as const;

/** Google's Pay API script, used for the availability check only. */
export const GOOGLE_PAY_JS_URL = `${WALLET_ORIGINS.googlePay}/gp/p/js/pay.js`;
