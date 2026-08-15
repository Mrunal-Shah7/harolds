// SPRINT-5: printer identity and print-sweeper knobs — never hardcode serials or secrets
import { env } from "./env";

export type PrinterConfig = {
  /** Every serial this instance will accept polls from. */
  serials: string[];
  kitchenSerial: string;
  counterSerial: string;
  sharedSecret: string;
  sentTimeoutMs: number;
  maxAttempts: number;
  retryBackoffMs: number;
  unacknowledgedOrderMs: number;
};

function splitSerials(raw: string): string[] {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return [...new Set(parts)];
}

/**
 * Resolve configured printers. One serial may serve both targets today; two serials
 * are first-class so a second device can be added without a schema change.
 */
export function getPrinterConfig(): PrinterConfig {
  const listed = splitSerials(env.PRINTER_SERIAL_NUMBER);
  if (listed.length === 0) {
    throw new Error("PRINTER_SERIAL_NUMBER must contain at least one serial number.");
  }
  const fallback = listed[0]!;
  const kitchenSerial = env.PRINTER_KITCHEN_SERIAL?.trim() || fallback;
  const counterSerial = env.PRINTER_COUNTER_SERIAL?.trim() || fallback;
  const serials = [...new Set([...listed, kitchenSerial, counterSerial])];

  return {
    serials,
    kitchenSerial,
    counterSerial,
    sharedSecret: env.PRINTER_SDP_SHARED_SECRET,
    sentTimeoutMs: env.PRINT_SENT_TIMEOUT_MS ?? 90_000,
    maxAttempts: env.PRINT_MAX_ATTEMPTS ?? 5,
    retryBackoffMs: env.PRINT_RETRY_BACKOFF_MS ?? 30_000,
    unacknowledgedOrderMs: env.PRINT_UNACKNOWLEDGED_ORDER_MS ?? 120_000,
  };
}

export function isKnownPrinterSerial(serial: string): boolean {
  return getPrinterConfig().serials.includes(serial.trim());
}
