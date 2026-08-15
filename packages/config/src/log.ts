// SPRINT-9: structured JSON logs with field-name redaction so secrets never reach disk.
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Exact keys (case-insensitive) that are always redacted. */
const SENSITIVE_EXACT = new Set([
  "password",
  "passwordhash",
  "pin",
  "pinhash",
  "token",
  "tokencookie",
  "sessiontoken",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "cookie",
  "secret",
  "sharedsecret",
  "webhooksignaturekey",
  "signaturekey",
  "apikey",
  "auth token",
  "authtoken",
  "cardnumber",
  "cvv",
  "cvc",
  "pan",
  "sourceid",
  "paymenttoken",
  "nonce",
  "dsn",
  "customerphone",
  "customeremail",
  "email",
  "phone",
  "fromnumber",
  "lookuptoken",
  "processorpaymentid",
  "square_access_token",
  "square_webhook_signature_key",
  "printer_sdp_shared_secret",
  "twilio_auth_token",
  "email_api_key",
  "sentry_dsn",
  "database_url",
  "key",
]);

const SENSITIVE_PATTERN =
  /(password|secret|token|pin|authorization|cookie|email|phone|card|cvv|pan|dsn|apikey|access_token)/i;

export const REDACTED = "[redacted]";

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function isSensitiveLogKey(key: string): boolean {
  const compact = normalizeKey(key);
  if (SENSITIVE_EXACT.has(compact)) return true;
  if (compact === "id" || compact === "orderid" || compact === "jobid" || compact === "userid") {
    return false;
  }
  // Capability flags (smsConfigured, emailConfigured) are booleans, not addresses.
  if (compact.endsWith("configured")) return false;
  return SENSITIVE_PATTERN.test(key);
}

function redactUrlLike(value: string): string {
  if (!value.includes("?") && !value.includes("://")) return value;
  try {
    const url = new URL(value, "http://local.invalid");
    const parts: string[] = [];
    let changed = false;
    for (const [name, paramValue] of url.searchParams.entries()) {
      if (isSensitiveLogKey(name)) {
        parts.push(`${encodeURIComponent(name)}=${REDACTED}`);
        changed = true;
      } else {
        parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(paramValue)}`);
      }
    }
    if (!changed) return value;
    const search = parts.length ? `?${parts.join("&")}` : "";
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return `${url.origin}${url.pathname}${search}${url.hash}`;
    }
    return `${url.pathname}${search}`;
  } catch {
    return value;
  }
}

export function redactValue(key: string, value: unknown): unknown {
  if (isSensitiveLogKey(key)) return REDACTED;
  if (typeof value === "string") return redactUrlLike(value);
  if (Array.isArray(value)) return value.map((item, i) => redactValue(String(i), item));
  if (value && typeof value === "object") return redactFields(value as Record<string, unknown>);
  return value;
}

export function redactFields(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input !== "object") return input;
  if (input instanceof Error) {
    return {
      name: input.name,
      message: redactUrlLike(input.message),
    };
  }
  if (Array.isArray(input)) return input.map((item) => redactFields(item));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

let minLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export function getLogLevel(): LogLevel {
  return minLevel;
}

export type LogContext = {
  requestId?: string;
  orderId?: string;
  jobId?: string;
  scope?: string;
};

export function emitLog(level: LogLevel, event: string, fields: Record<string, unknown> = {}, ctx: LogContext = {}): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const payload = redactFields({
    ts: new Date().toISOString(),
    level,
    event,
    ...ctx,
    ...fields,
  });
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") console.debug(line);
  else console.info(line);
}
