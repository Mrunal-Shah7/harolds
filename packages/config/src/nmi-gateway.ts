// SPRINT-18.2: the payment gateway's address — the ONLY place in the repository that states it.
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
