// SPRINT-1 / SPRINT-4 / SPRINT-5 / SPRINT-18.2 / SPRINT-19: environment schema — validates required vars at module load and fails loudly
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

  // Required — Sprint 17 (NMI payments). Selects which credential triple below is live.
  NMI_ENVIRONMENT: z.enum(["sandbox", "production"], {
    required_error: "NMI_ENVIRONMENT is required (sandbox | production)",
    invalid_type_error: "NMI_ENVIRONMENT must be sandbox or production",
  }),

  /**
   * Both credential triples are declared optional HERE on purpose. Only the triple matching
   * NMI_ENVIRONMENT is actually required, and that is enforced per-environment in
   * `payments.ts` / `production-guards.ts`. A blanket `.min(1)` would force operators to
   * invent a live security key just to boot the sandbox.
   */
  NMI_SECURITY_KEY_SANDBOX: z.string().optional(),
  NMI_TOKENIZATION_KEY_SANDBOX: z.string().optional(),
  NMI_WEBHOOK_SIGNING_KEY_SANDBOX: z.string().optional(),
  NMI_SECURITY_KEY_LIVE: z.string().optional(),
  NMI_TOKENIZATION_KEY_LIVE: z.string().optional(),
  NMI_WEBHOOK_SIGNING_KEY_LIVE: z.string().optional(),
  // SPRINT-18.2: there are no NEXT_PUBLIC_NMI_* variables. The checkout layout resolves the
  // Collect.js URL and the active tokenization key on the server, per request, from the two
  // values above — so the browser cannot disagree with the server about which gateway is live.

  /**
   * SPRINT-19: digital wallets. Server-side only (no NEXT_PUBLIC_), read per request by the
   * checkout layout and the CSP, so a change needs a RESTART, not a rebuild. Off unless set to
   * exactly "true". Turn one on only after Merchant Pay Connect confirms it for this MID.
   */
  PAYMENTS_APPLE_PAY_ENABLED: z
    .enum(["true", "false"], {
      errorMap: () => ({ message: 'PAYMENTS_APPLE_PAY_ENABLED must be "true" or "false"' }),
    })
    .default("false"),
  PAYMENTS_GOOGLE_PAY_ENABLED: z
    .enum(["true", "false"], {
      errorMap: () => ({ message: 'PAYMENTS_GOOGLE_PAY_ENABLED must be "true" or "false"' }),
    })
    .default("false"),

  // Required — Sprint 5 (Epson Server Direct Print). Comma-separated serials supported.
  PRINTER_SERIAL_NUMBER: z
    .string({ required_error: "PRINTER_SERIAL_NUMBER is required (Epson TM serial, comma-separated if several)" })
    .min(1, "PRINTER_SERIAL_NUMBER is required and must not be empty"),
  PRINTER_SDP_SHARED_SECRET: z
    .string({
      required_error: "PRINTER_SDP_SHARED_SECRET is required (Server Direct Print shared secret)",
    })
    .min(1, "PRINTER_SDP_SHARED_SECRET is required and must not be empty"),
  /**
   * SPRINT-16: how far back the duplicate-order guard looks for an equivalent order from the same
   * phone. Optional; defaults to 180s. Shorten it if the guard's log shows legitimate repeat
   * orders being collapsed.
   */
  ORDER_DUPLICATE_GUARD_WINDOW_SECONDS: z.coerce.number().int().positive().max(3600).optional(),
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

  // SPRINT-17: TWILIO_* removed with the SMS subsystem. Email is the only notification channel.

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
