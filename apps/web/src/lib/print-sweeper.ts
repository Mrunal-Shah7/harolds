// SPRINT-5: in-process print-job sweeper — timeout, backoff retry, attempt ceiling, unacked-order alert
import { emitLog, getPrinterConfig } from "@harolds/config";
import { sweepPrintJobs } from "@harolds/db";

const INTERVAL_MS = 10_000;

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const cfg = getPrinterConfig();
    const result = await sweepPrintJobs({
      sentTimeoutMs: cfg.sentTimeoutMs,
      maxAttempts: cfg.maxAttempts,
      retryBackoffMs: cfg.retryBackoffMs,
      unacknowledgedOrderMs: cfg.unacknowledgedOrderMs,
    });
    if (result.requeued || result.cancelled || result.unacknowledgedAlerts) {
      emitLog(
        "info",
        "print.sweep",
        { requeued: result.requeued, cancelled: result.cancelled, unackedAlerts: result.unacknowledgedAlerts },
        { scope: "print" },
      );
    }
  } catch (err) {
    emitLog("error", "print.sweep_failed", { name: err instanceof Error ? err.name : "Error" }, { scope: "print" });
  } finally {
    inFlight = false;
  }
}

export function startPrintSweeper(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, INTERVAL_MS);
  timer.unref?.();
  const g = globalThis as unknown as { __haroldsPrintSweeperHooks?: boolean };
  if (!g.__haroldsPrintSweeperHooks) {
    g.__haroldsPrintSweeperHooks = true;
    process.once("SIGTERM", () => stopPrintSweeper());
    process.once("SIGINT", () => stopPrintSweeper());
  }
  emitLog("info", "print.sweeper_started", {}, { scope: "print" });
}

export function stopPrintSweeper(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  emitLog("info", "print.sweeper_stopped", {}, { scope: "print" });
}

export function isPrintSweeperRunning(): boolean {
  return timer !== null;
}
