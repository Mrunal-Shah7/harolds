// SPRINT-12 / SPRINT-17: public payment identifiers for Collect.js — build-time and start-time checks.
/**
 * The tokenization key is not a secret (the security key is). Collect.js runs in the browser
 * and needs the key inlined at build time via NEXT_PUBLIC_. A runtime-only server env
 * produces a bundle that renders "Payments are not configured yet" forever.
 */

export type PublicPaymentsEnv = {
  NEXT_PUBLIC_NMI_TOKENIZATION_KEY?: string;
  NEXT_PUBLIC_NMI_ENVIRONMENT?: string;
  [key: string]: string | undefined;
};

function present(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

/** Names every missing public payment identifier. Empty when both are set and valid. */
export function missingPublicPaymentIdentifiers(env: PublicPaymentsEnv): string[] {
  const missing: string[] = [];
  if (!present(env.NEXT_PUBLIC_NMI_TOKENIZATION_KEY)) {
    missing.push("NEXT_PUBLIC_NMI_TOKENIZATION_KEY: required at build time for Collect.js tokenization");
  }
  if (!present(env.NEXT_PUBLIC_NMI_ENVIRONMENT)) {
    missing.push("NEXT_PUBLIC_NMI_ENVIRONMENT: required at build time (sandbox | production)");
  } else {
    const envName = env.NEXT_PUBLIC_NMI_ENVIRONMENT!.trim();
    if (envName !== "sandbox" && envName !== "production") {
      missing.push(`NEXT_PUBLIC_NMI_ENVIRONMENT: must be sandbox or production (got "${envName}")`);
    }
  }
  return missing;
}

/** Throws with a build-failing message that names every absent public payment variable. */
export function assertPublicPaymentIdentifiersForBuild(env: PublicPaymentsEnv): void {
  const missing = missingPublicPaymentIdentifiers(env);
  if (missing.length === 0) return;
  throw new Error(
    [
      "Build refused: Collect.js public identifiers are missing or invalid.",
      "Set these in the root .env (or CI env) before building — they are inlined into the client bundle.",
      ...missing.map((line) => `  - ${line}`),
      "",
      "See .env.example (NEXT_PUBLIC_NMI_*). Keep NEXT_PUBLIC_NMI_TOKENIZATION_KEY equal to the",
      "NMI_TOKENIZATION_KEY_* value for the active NMI_ENVIRONMENT.",
    ].join("\n"),
  );
}

export function publicPaymentIdsPresentAtBuild(env: PublicPaymentsEnv = process.env): boolean {
  return missingPublicPaymentIdentifiers(env).length === 0;
}
