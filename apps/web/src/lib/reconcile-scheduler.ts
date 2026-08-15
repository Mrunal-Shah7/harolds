// SPRINT-11: in-process daily reconciliation — same start/stop discipline as the print sweeper.
import { emitLog, getReconcileSchedulerConfig } from "@harolds/config";
import { maybeRunScheduledReconciliation } from "@harolds/db";
import { getPayment } from "@harolds/square";

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const cfg = getReconcileSchedulerConfig();
    const result = await maybeRunScheduledReconciliation({
      hourLocal: cfg.hourLocal,
      lookbackHours: cfg.lookbackHours,
      enqueueAlerts: true,
      probePayment: async (paymentId) => {
        const payment = await getPayment(paymentId);
        return payment ? { status: payment.status, amountCents: payment.amountCents } : null;
      },
    });
    if (result.skipped) {
      emitLog(
        "debug",
        "reconcile.skipped",
        { reason: result.skipped, businessDate: result.businessDate },
        { scope: "reconcile" },
      );
    } else {
      emitLog(
        "info",
        "reconcile.ran",
        { businessDate: result.businessDate, findingCount: result.findingCount },
        { scope: "reconcile" },
      );
    }
  } catch (err) {
    emitLog(
      "error",
      "reconcile.failed",
      { name: err instanceof Error ? err.name : "Error" },
      { scope: "reconcile" },
    );
  } finally {
    inFlight = false;
  }
}

export function startReconcileScheduler(): void {
  if (timer) return;
  const cfg = getReconcileSchedulerConfig();
  timer = setInterval(() => {
    void tick();
  }, cfg.checkIntervalMs);
  timer.unref?.();
  void tick();
  const g = globalThis as unknown as { __haroldsReconcileHooks?: boolean };
  if (!g.__haroldsReconcileHooks) {
    g.__haroldsReconcileHooks = true;
    process.once("SIGTERM", () => stopReconcileScheduler());
    process.once("SIGINT", () => stopReconcileScheduler());
  }
  emitLog(
    "info",
    "reconcile.scheduler_started",
    { hourLocal: cfg.hourLocal, checkIntervalMs: cfg.checkIntervalMs, lookbackHours: cfg.lookbackHours },
    { scope: "reconcile" },
  );
}

export function stopReconcileScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  emitLog("info", "reconcile.scheduler_stopped", {}, { scope: "reconcile" });
}

export function isReconcileSchedulerRunning(): boolean {
  return timer !== null;
}
