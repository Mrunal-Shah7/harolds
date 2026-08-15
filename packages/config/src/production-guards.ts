// SPRINT-11: production-only requirements — missing providers and placeholder manager destinations.
export const PRINT_SECRET_MIN_PRODUCTION = 32;

export const PLACEHOLDER_MANAGER_ALERT_PHONE = "TODO: SET MANAGER ALERT PHONE";
export const PLACEHOLDER_MANAGER_ALERT_EMAIL = "todo-manager-alerts@localhost";

export type ProductionEnvSlice = {
  NODE_ENV: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM_ADDRESS?: string;
  PRINTER_SDP_SHARED_SECRET?: string;
};

function present(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

/** Names every missing production requirement at once. Empty when NODE_ENV is not production. */
export function missingProductionVariables(env: ProductionEnvSlice): string[] {
  if (env.NODE_ENV !== "production") return [];
  const missing: string[] = [];
  if (!present(env.TWILIO_ACCOUNT_SID)) missing.push("TWILIO_ACCOUNT_SID: required in production (SMS confirmations and alerts)");
  if (!present(env.TWILIO_AUTH_TOKEN)) missing.push("TWILIO_AUTH_TOKEN: required in production");
  if (!present(env.TWILIO_FROM_NUMBER)) missing.push("TWILIO_FROM_NUMBER: required in production");
  if (!present(env.EMAIL_API_KEY)) missing.push("EMAIL_API_KEY: required in production (receipts and alerts)");
  if (!present(env.EMAIL_FROM_ADDRESS)) missing.push("EMAIL_FROM_ADDRESS: required in production and must be a verified sending address");
  const secret = env.PRINTER_SDP_SHARED_SECRET ?? "";
  if (secret.length > 0 && secret.length < PRINT_SECRET_MIN_PRODUCTION) {
    missing.push(
      `PRINTER_SDP_SHARED_SECRET: must be at least ${PRINT_SECRET_MIN_PRODUCTION} characters in production (query-string secret on the printer)`,
    );
  }
  return missing;
}

export function isPlaceholderManagerPhone(value: string | null | undefined): boolean {
  return (value ?? "").trim() === PLACEHOLDER_MANAGER_ALERT_PHONE;
}

export function isPlaceholderManagerEmail(value: string | null | undefined): boolean {
  return (value ?? "").trim() === PLACEHOLDER_MANAGER_ALERT_EMAIL;
}

function usable(value: string | null | undefined, placeholder: (v: string | null | undefined) => boolean): boolean {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 && !placeholder(trimmed);
}

/** Production must have at least one sendable manager destination and no seeded placeholders. */
export function managerDestinationProblems(
  phone: string | null | undefined,
  email: string | null | undefined,
): string[] {
  const problems: string[] = [];
  if (isPlaceholderManagerPhone(phone)) {
    problems.push(
      `managerAlertPhone is the seeded placeholder "${PLACEHOLDER_MANAGER_ALERT_PHONE}" and is not sendable`,
    );
  }
  if (isPlaceholderManagerEmail(email)) {
    problems.push(
      `managerAlertEmail is the seeded placeholder "${PLACEHOLDER_MANAGER_ALERT_EMAIL}" and is not sendable`,
    );
  }
  if (!usable(phone, isPlaceholderManagerPhone) && !usable(email, isPlaceholderManagerEmail)) {
    problems.push("manager alert phone and email are both absent or unsendable; production needs at least one real destination");
  }
  return problems;
}
