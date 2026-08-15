// SPRINT-1 / SPRINT-4 / SPRINT-5: environment schema — validates required vars at module load and fails loudly
import { z } from "zod";
import { missingProductionVariables } from "./production-guards";

export {
  PRINT_SECRET_MIN_PRODUCTION,
  PLACEHOLDER_MANAGER_ALERT_PHONE,
  PLACEHOLDER_MANAGER_ALERT_EMAIL,
  missingProductionVariables,
  managerDestinationProblems,
  isPlaceholderManagerPhone,
  isPlaceholderManagerEmail,
} from "./production-guards";

/**
 * Variables declared optional now will become required in the named sprint.
 * Declaring them early keeps the .env.example surface stable.
 */
const envSchema = z.object({
  // Required — Sprint 1
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required (PostgreSQL connection string)" })
    .min(1, "DATABASE_URL must not be empty"),
  NODE_ENV: z.enum(["development", "test", "production"], {
    required_error: "NODE_ENV is required (development | test | production)",
    invalid_type_error: "NODE_ENV must be development, test, or production",
  }),
  NEXT_PUBLIC_APP_URL: z
    .string({ required_error: "NEXT_PUBLIC_APP_URL is required (public base URL)" })
    .url("NEXT_PUBLIC_APP_URL must be a valid URL"),

  // Required — Sprint 4 (Square payments). Empty strings fail so partial .env copy fails loudly.
  SQUARE_APPLICATION_ID: z
    .string({ required_error: "SQUARE_APPLICATION_ID is required (Square application ID)" })
    .min(1, "SQUARE_APPLICATION_ID is required and must not be empty"),
  SQUARE_ACCESS_TOKEN: z
    .string({ required_error: "SQUARE_ACCESS_TOKEN is required (Square access token)" })
    .min(1, "SQUARE_ACCESS_TOKEN is required and must not be empty"),
  SQUARE_LOCATION_ID: z
    .string({ required_error: "SQUARE_LOCATION_ID is required (Square location ID)" })
    .min(1, "SQUARE_LOCATION_ID is required and must not be empty"),
  SQUARE_ENVIRONMENT: z.enum(["sandbox", "production"], {
    required_error: "SQUARE_ENVIRONMENT is required (sandbox | production)",
    invalid_type_error: "SQUARE_ENVIRONMENT must be sandbox or production",
  }),
  SQUARE_WEBHOOK_SIGNATURE_KEY: z
    .string({
      required_error: "SQUARE_WEBHOOK_SIGNATURE_KEY is required (Square webhook signature key)",
    })
    .min(1, "SQUARE_WEBHOOK_SIGNATURE_KEY is required and must not be empty"),

  // Required — Sprint 5 (Epson Server Direct Print). Comma-separated serials supported.
  PRINTER_SERIAL_NUMBER: z
    .string({ required_error: "PRINTER_SERIAL_NUMBER is required (Epson TM serial, comma-separated if several)" })
    .min(1, "PRINTER_SERIAL_NUMBER is required and must not be empty"),
  PRINTER_SDP_SHARED_SECRET: z
    .string({
      required_error: "PRINTER_SDP_SHARED_SECRET is required (Server Direct Print shared secret)",
    })
    .min(1, "PRINTER_SDP_SHARED_SECRET is required and must not be empty"),
  /** Optional override: kitchen-ticket printer serial. Defaults to the first PRINTER_SERIAL_NUMBER. */
  PRINTER_KITCHEN_SERIAL: z.string().optional(),
  /** Optional override: counter-receipt printer serial. Defaults to the first PRINTER_SERIAL_NUMBER. */
  PRINTER_COUNTER_SERIAL: z.string().optional(),
  /** Sent-but-unacked jobs return to the queue after this many ms (default 90000). */
  PRINT_SENT_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  /** Attempt ceiling before a job is cancelled and a manager alert is raised (default 5). */
  PRINT_MAX_ATTEMPTS: z.coerce.number().int().positive().optional(),
  /** Base backoff between retries in ms (default 30000); doubles per attempt, capped. */
  PRINT_RETRY_BACKOFF_MS: z.coerce.number().int().positive().optional(),
  /** Paid order with any job not PRINTED within this window raises an unacknowledged-order alert (default 120000). */
  PRINT_UNACKNOWLEDGED_ORDER_MS: z.coerce.number().int().positive().optional(),

  // Optional — Sprint 6 kitchen display knobs
  /** Staff session lifetime in ms (default 43200000 = 12 hours). */
  KITCHEN_SESSION_TTL_MS: z.coerce.number().int().positive().optional(),
  /** Consecutive failed PIN attempts before lockout (default 5). */
  KITCHEN_PIN_MAX_FAILURES: z.coerce.number().int().positive().optional(),
  /** PIN lockout duration in ms (default 300000 = 5 minutes). */
  KITCHEN_PIN_LOCKOUT_MS: z.coerce.number().int().positive().optional(),
  /** Kitchen display poll interval in ms (default 3000). */
  KITCHEN_POLL_INTERVAL_MS: z.coerce.number().int().positive().optional(),
  /** On-screen unacknowledged escalation in ms (default 60000). */
  KITCHEN_UNACK_SCREEN_MS: z.coerce.number().int().positive().optional(),
  /** Audible unacknowledged alert in ms (default 120000). */
  KITCHEN_UNACK_SOUND_MS: z.coerce.number().int().positive().optional(),
  /** Manager-alert job enqueue threshold in ms (default 180000). */
  KITCHEN_UNACK_ALERT_MS: z.coerce.number().int().positive().optional(),

  // Optional — Sprint 8 admin back-office knobs
  /** Admin session lifetime in ms (default 14400000 = 4 hours). */
  ADMIN_SESSION_TTL_MS: z.coerce.number().int().positive().optional(),
  /** Consecutive failed password attempts before lockout (default 5). */
  ADMIN_PASSWORD_MAX_FAILURES: z.coerce.number().int().positive().optional(),
  /** Password lockout duration in ms (default 900000 = 15 minutes). */
  ADMIN_PASSWORD_LOCKOUT_MS: z.coerce.number().int().positive().optional(),

  // Optional — Sprint 7 background worker knobs
  /** Worker drain interval in ms (default 5000). */
  JOB_WORKER_INTERVAL_MS: z.coerce.number().int().positive().optional(),
  /** Max jobs claimed per pass (default 10). */
  JOB_WORKER_CLAIM_LIMIT: z.coerce.number().int().positive().optional(),
  /** RUNNING jobs older than this return to the queue (default 90000). */
  JOB_WORKER_STRANDED_MS: z.coerce.number().int().positive().optional(),
  /** Base retry backoff in ms (default 30000); doubles per attempt. */
  JOB_WORKER_BACKOFF_MS: z.coerce.number().int().positive().optional(),
  /** Dead-job count that is logged and flagged on the queue report (default 5). */
  JOB_DEAD_ALERT_THRESHOLD: z.coerce.number().int().positive().optional(),
  /** Manager-alert send cap per type per window (default 1). */
  JOB_ALERT_MAX_PER_WINDOW: z.coerce.number().int().positive().optional(),
  /** Window for manager-alert volume cap in ms (default 900000 = 15 minutes). */
  JOB_ALERT_WINDOW_MS: z.coerce.number().int().positive().optional(),

  // Optional in development/test — required at production start (Sprint 11)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  /** Optional public Twilio inbound URL. When unset, derived from NEXT_PUBLIC_APP_URL. */
  TWILIO_WEBHOOK_URL: z.string().optional(),

  // Optional in development/test — required at production start (Sprint 11)
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().email().optional().or(z.literal("")),

  // Optional — Sprint 9 error tracking. Empty in tests/dev; set in production runtime.
  SENTRY_DSN: z.string().optional(),

  // Optional — Sprint 9: trust X-Forwarded-For from the reverse proxy (1/true).
  TRUST_PROXY: z.string().optional(),
  /** Minimum log level: debug | info | warn | error */
  LOG_LEVEL: z.string().optional(),
  /** Health check: worker last-pass older than this is unhealthy (default 30000). */
  WORKER_STALE_MS: z.coerce.number().int().positive().optional(),

  // Optional — Sprint 11 scheduled reconciliation
  /** Store-local hour (0–23) at which the daily reconciliation pass becomes due (default 4). */
  RECONCILE_HOUR_LOCAL: z.coerce.number().int().min(0).max(23).optional(),
  /** How often the scheduler wakes to check whether today's pass is due, in ms (default 900000). */
  RECONCILE_CHECK_INTERVAL_MS: z.coerce.number().int().positive().optional(),
  /** Lookback window for the scheduled pass, in hours (default 48). */
  RECONCILE_LOOKBACK_HOURS: z.coerce.number().int().positive().optional(),

  // Optional — Sprint 4 orphan sweeper (minutes awaiting payment before abandon)
  ORDER_ABANDON_AFTER_MINUTES: z.coerce.number().int().positive().optional(),
});

export type Env = z.infer<typeof envSchema>;

function formatZodError(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.join(".") || "(root)";
    return `  - ${path}: ${issue.message}`;
  });
  return [
    "Environment validation failed. Fix the following variable(s):",
    ...lines,
    "",
    "See .env.example for documentation of every variable.",
  ].join("\n");
}

function formatProductionErrors(lines: string[]): string {
  return [
    "Environment validation failed. Fix the following variable(s):",
    ...lines.map((line) => `  - ${line}`),
    "",
    "See .env.example for documentation of every variable.",
  ].join("\n");
}

/** Parse an env-like record. Exported so tests can prove missing printer config fails loudly. */
export function parseEnv(input: unknown, opts?: { skipProductionGuards?: boolean }): Env {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  // next build sets NODE_ENV=production while collecting page data. Provider
  // credentials are a start-time requirement, not a compile-time one.
  if (!opts?.skipProductionGuards) {
    const extra = missingProductionVariables(result.data);
    if (extra.length > 0) {
      throw new Error(formatProductionErrors(extra));
    }
  }
  return result.data;
}

function loadEnv(): Env {
  // Bootstrap only — this is the single allowed process.env read site.
  // eslint-disable-next-line no-restricted-properties -- env bootstrap
  const phase = process.env.NEXT_PHASE;
  // eslint-disable-next-line no-restricted-properties -- env bootstrap
  return parseEnv(process.env, { skipProductionGuards: Boolean(phase) });
}

/** Validated, typed environment. Throws at import time if required vars are missing/malformed. */
export const env: Env = loadEnv();
