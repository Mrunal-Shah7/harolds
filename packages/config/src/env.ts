// SPRINT-1: environment schema — validates required vars at module load and fails loudly
import { z } from "zod";

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

  // Optional — become required in Sprint 4 (Square payments)
  SQUARE_APPLICATION_ID: z.string().optional(),
  SQUARE_ACCESS_TOKEN: z.string().optional(),
  SQUARE_LOCATION_ID: z.string().optional(),
  SQUARE_ENVIRONMENT: z.enum(["sandbox", "production"]).optional(),
  SQUARE_WEBHOOK_SIGNATURE_KEY: z.string().optional(),

  // Optional — become required in Sprint 5 (Epson Server Direct Print)
  PRINTER_SERIAL_NUMBER: z.string().optional(),
  PRINTER_SDP_SHARED_SECRET: z.string().optional(),

  // Optional — become required in Sprint 7 (Twilio SMS)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  // Optional — become required in Sprint 7 (transactional email)
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().email().optional().or(z.literal("")),

  // Optional — become required in Sprint 9 (error tracking)
  SENTRY_DSN: z.string().optional(),
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

function loadEnv(): Env {
  // Bootstrap only — this is the single allowed process.env read site.
  // eslint-disable-next-line no-restricted-properties -- env bootstrap
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data;
}

/** Validated, typed environment. Throws at import time if required vars are missing/malformed. */
export const env: Env = loadEnv();
