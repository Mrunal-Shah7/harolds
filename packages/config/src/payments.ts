// SPRINT-17: NMI gateway credentials and endpoint selection.
//
// The sandbox and live key triples live side by side in .env so switching environments is one
// variable, not a credential swap. Only the ACTIVE environment's keys are ever read or
// validated — the inactive triple may legitimately be blank.
import { env } from "./env";

/**
 * Gateway base URLs.
 *
 * These are NOT interchangeable: a sandbox account posting to secure.nmi.com is rejected with
 * "Sandbox accounts must use a sandbox domain", and a live account has no presence on the
 * sandbox host. Verified against the gateway, not inferred from the docs.
 */
export const NMI_SANDBOX_BASE_URL = "https://sandbox.nmi.com/api";
export const NMI_PRODUCTION_BASE_URL = "https://secure.nmi.com/api";

export type NmiConfig = {
  environment: "sandbox" | "production";
  baseUrl: string;
  /** Server-side only. Never sent to the browser, never logged. */
  securityKey: string;
  /** Public — safe to inline in the client bundle for Collect.js. */
  tokenizationKey: string;
  /** Server-side only. Verifies inbound webhook signatures. */
  webhookSigningKey: string;
};

/**
 * Credentials are pasted from the NMI portal, and a trailing newline or a stray space after
 * the `=` in .env is easy to miss and produces an opaque "Specified API key not found" from
 * the gateway rather than a config error. Trim every credential at the boundary.
 */
function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

/** Names every missing credential for `environment`. Empty when the triple is complete. */
export function missingNmiCredentials(
  environment: "sandbox" | "production",
  source: Record<string, string | undefined>,
): string[] {
  const suffix = environment === "production" ? "LIVE" : "SANDBOX";
  const missing: string[] = [];
  for (const name of ["NMI_SECURITY_KEY", "NMI_TOKENIZATION_KEY", "NMI_WEBHOOK_SIGNING_KEY"]) {
    const key = `${name}_${suffix}`;
    if (clean(source[key]).length === 0) {
      missing.push(`${key}: required when NMI_ENVIRONMENT is ${environment}`);
    }
  }
  return missing;
}

/**
 * Resolved credentials for the active environment. Throws if the active triple is incomplete —
 * a gateway call with a blank security key fails as an unhelpful "API key not found", so it is
 * better to fail here, naming the variable.
 */
export function getNmiConfig(): NmiConfig {
  const environment = env.NMI_ENVIRONMENT;
  const isProduction = environment === "production";

  const securityKey = clean(isProduction ? env.NMI_SECURITY_KEY_LIVE : env.NMI_SECURITY_KEY_SANDBOX);
  const tokenizationKey = clean(
    isProduction ? env.NMI_TOKENIZATION_KEY_LIVE : env.NMI_TOKENIZATION_KEY_SANDBOX,
  );
  const webhookSigningKey = clean(
    isProduction ? env.NMI_WEBHOOK_SIGNING_KEY_LIVE : env.NMI_WEBHOOK_SIGNING_KEY_SANDBOX,
  );

  if (securityKey.length === 0 || tokenizationKey.length === 0 || webhookSigningKey.length === 0) {
    const suffix = isProduction ? "LIVE" : "SANDBOX";
    throw new Error(
      [
        `NMI credentials for the active environment (NMI_ENVIRONMENT=${environment}) are incomplete.`,
        `Set NMI_SECURITY_KEY_${suffix}, NMI_TOKENIZATION_KEY_${suffix} and NMI_WEBHOOK_SIGNING_KEY_${suffix}.`,
        "See .env.example for documentation of every variable.",
      ].join("\n"),
    );
  }

  return {
    environment,
    baseUrl: isProduction ? NMI_PRODUCTION_BASE_URL : NMI_SANDBOX_BASE_URL,
    securityKey,
    tokenizationKey,
    webhookSigningKey,
  };
}
