// SPRINT-11: one structured startup line — what this instance can actually do.
import {
  emitLog,
  env,
  getPrinterConfig,
  managerDestinationProblems,
} from "@harolds/config";
import { getStoreConfig } from "@harolds/db";
import { getSquareEnvironment } from "@harolds/square";

function configured(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

export async function runStartupChecks(): Promise<void> {
  let alertingConfigured = false;
  let alertingDetail = "store-config-unavailable";
  try {
    const store = await getStoreConfig();
    const problems = managerDestinationProblems(store.managerAlertPhone, store.managerAlertEmail);
    if (env.NODE_ENV === "production" && problems.length > 0) {
      throw new Error(
        [
          "Production start refused: manager alert destinations are missing or unsendable.",
          ...problems.map((p) => `  - ${p}`),
        ].join("\n"),
      );
    }
    alertingConfigured = problems.length === 0;
    alertingDetail = alertingConfigured ? "set" : "placeholder-or-absent";
  } catch (err) {
    if (env.NODE_ENV === "production") throw err;
    alertingDetail = err instanceof Error ? err.message.slice(0, 80) : "unknown";
  }

  const printers = getPrinterConfig();
  emitLog(
    "info",
    "app.startup_summary",
    {
      nodeEnv: env.NODE_ENV,
      squareEnvironment: getSquareEnvironment(),
      smsConfigured: configured(env.TWILIO_ACCOUNT_SID) && configured(env.TWILIO_AUTH_TOKEN) && configured(env.TWILIO_FROM_NUMBER),
      emailConfigured: configured(env.EMAIL_API_KEY) && configured(env.EMAIL_FROM_ADDRESS),
      alertingConfigured,
      alertingDetail,
      errorTrackerConfigured: configured(env.SENTRY_DSN),
      printerSerial: printers.serials[0] ?? null,
    },
    { scope: "app" },
  );
}
