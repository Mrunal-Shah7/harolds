// SPRINT-6: in-process sweeper — unacknowledged kitchen orders enqueue a manager alert once.
import { emitLog, getKitchenConfig } from "@harolds/config";
import { enqueueUnacknowledgedKitchenAlerts } from "@harolds/db";

const INTERVAL_MS = 15_000;

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const cfg = getKitchenConfig();
    const inserted = await enqueueUnacknowledgedKitchenAlerts({ thresholdMs: cfg.unackAlertMs });
    if (inserted > 0) {
      emitLog("info", "kitchen.unacked_enqueued", { inserted }, { scope: "kitchen" });
    }
  } catch (err) {
    emitLog("error", "kitchen.unacked_failed", { name: err instanceof Error ? err.name : "Error" }, { scope: "kitchen" });
  } finally {
    inFlight = false;
  }
}

export function startKitchenAlertSweeper(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, INTERVAL_MS);
  timer.unref?.();
  const g = globalThis as unknown as { __haroldsKitchenAlertHooks?: boolean };
  if (!g.__haroldsKitchenAlertHooks) {
    g.__haroldsKitchenAlertHooks = true;
    process.once("SIGTERM", () => stopKitchenAlertSweeper());
    process.once("SIGINT", () => stopKitchenAlertSweeper());
  }
  emitLog("info", "kitchen.alerts_started", {}, { scope: "kitchen" });
}

export function stopKitchenAlertSweeper(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  emitLog("info", "kitchen.alerts_stopped", {}, { scope: "kitchen" });
}
