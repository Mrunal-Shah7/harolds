// SPRINT-11: production-only requirements — missing providers and placeholder manager destinations.
export const PRINT_SECRET_MIN_PRODUCTION = 32;

export const PLACEHOLDER_MANAGER_ALERT_PHONE = "TODO: SET MANAGER ALERT PHONE";
export const PLACEHOLDER_MANAGER_ALERT_EMAIL = "todo-manager-alerts@localhost";

export type ProductionEnvSlice = {
  NODE_ENV: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM_ADDRESS?: string;
  PRINTER_SDP_SHARED_SECRET?: string;
  // SPRINT-17: public Collect.js key must be present in a production start (build embeds it).
  NEXT_PUBLIC_NMI_TOKENIZATION_KEY?: string;
  NEXT_PUBLIC_NMI_ENVIRONMENT?: string;
  NMI_ENVIRONMENT?: string;
  NMI_SECURITY_KEY_SANDBOX?: string;
  NMI_TOKENIZATION_KEY_SANDBOX?: string;
  NMI_WEBHOOK_SIGNING_KEY_SANDBOX?: string;
  NMI_SECURITY_KEY_LIVE?: string;
  NMI_TOKENIZATION_KEY_LIVE?: string;
  NMI_WEBHOOK_SIGNING_KEY_LIVE?: string;
};

function present(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

/** Names every missing production requirement at once. Empty when NODE_ENV is not production. */
export function missingProductionVariables(env: ProductionEnvSlice): string[] {
  if (env.NODE_ENV !== "production") return [];
  const missing: string[] = [];
  // SPRINT-17: with SMS gone, email is the ONLY notification channel — for customer receipts
  // and for every manager alert. A production start without it is silent on both.
  if (!present(env.EMAIL_API_KEY)) missing.push("EMAIL_API_KEY: required in production (receipts and all manager alerts)");
  if (!present(env.EMAIL_FROM_ADDRESS)) missing.push("EMAIL_FROM_ADDRESS: required in production and must be a verified sending address");
  const secret = env.PRINTER_SDP_SHARED_SECRET ?? "";
  if (secret.length > 0 && secret.length < PRINT_SECRET_MIN_PRODUCTION) {
    missing.push(
      `PRINTER_SDP_SHARED_SECRET: must be at least ${PRINT_SECRET_MIN_PRODUCTION} characters in production (query-string secret on the printer)`,
    );
  }
  // SPRINT-17: NMI must be complete in production — the ACTIVE credential triple plus the
  // client-build tokenization key. Only the active triple is checked: a production deployment
  // legitimately leaves the sandbox keys blank, and vice versa.
  if (!present(env.NMI_ENVIRONMENT)) {
    missing.push("NMI_ENVIRONMENT: required in production (sandbox | production)");
  } else {
    const environment = env.NMI_ENVIRONMENT!.trim();
    if (environment !== "sandbox" && environment !== "production") {
      missing.push(`NMI_ENVIRONMENT: must be sandbox or production (got "${environment}")`);
    } else {
      // Naming the live keys as "required in production" would be wrong when a production
      // deployment is deliberately pointed at the sandbox gateway (a staging box, say).
      const suffix = environment === "production" ? "LIVE" : "SANDBOX";
      for (const name of ["NMI_SECURITY_KEY", "NMI_TOKENIZATION_KEY", "NMI_WEBHOOK_SIGNING_KEY"]) {
        const key = `${name}_${suffix}` as keyof ProductionEnvSlice;
        if (!present(env[key] as string | undefined)) {
          missing.push(`${key}: required in production when NMI_ENVIRONMENT is ${environment}`);
        }
      }
    }
  }
  if (!present(env.NEXT_PUBLIC_NMI_TOKENIZATION_KEY)) {
    missing.push(
      "NEXT_PUBLIC_NMI_TOKENIZATION_KEY: required in production (must have been present at build time for Collect.js)",
    );
  }
  if (!present(env.NEXT_PUBLIC_NMI_ENVIRONMENT)) {
    missing.push("NEXT_PUBLIC_NMI_ENVIRONMENT: required in production (sandbox | production)");
  }
  return missing;
}

export function isPlaceholderManagerPhone(value: string | null | undefined): boolean {
  return (value ?? "").trim() === PLACEHOLDER_MANAGER_ALERT_PHONE;
}

export function isPlaceholderManagerEmail(value: string | null | undefined): boolean {
  return (value ?? "").trim() === PLACEHOLDER_MANAGER_ALERT_EMAIL;
}

/** Same shape check the notify package applies before it will send. */
const MANAGER_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function usable(value: string | null | undefined, placeholder: (v: string | null | undefined) => boolean): boolean {
  const trimmed = (value ?? "").trim();
  // Non-empty is NOT enough. A phone number left in managerAlertEmail is non-empty and is not
  // the placeholder, so a presence-only check passed it here and then failed at send time —
  // production would start reporting alerting as configured while every alert was dropped.
  return trimmed.length > 0 && !placeholder(trimmed) && MANAGER_EMAIL.test(trimmed);
}

/**
 * Production must have a sendable manager alert EMAIL and no seeded placeholder.
 *
 * SPRINT-17: this used to accept a phone OR an email. With SMS removed there is no way to send
 * to a phone, so email is not one of two options any more — it is the only channel, and its
 * absence means manager alerts go nowhere at all.
 */
export function managerDestinationProblems(email: string | null | undefined): string[] {
  const problems: string[] = [];
  if (isPlaceholderManagerEmail(email)) {
    problems.push(
      `managerAlertEmail is the seeded placeholder "${PLACEHOLDER_MANAGER_ALERT_EMAIL}" and is not sendable`,
    );
  }
  if (!usable(email, isPlaceholderManagerEmail)) {
    problems.push(
      "managerAlertEmail is absent or unsendable; it is the only manager alert channel, so alerts would be silently dropped",
    );
  }
  return problems;
}
