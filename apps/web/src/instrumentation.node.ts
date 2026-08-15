// SPRINT-9 / SPRINT-11: Node-only process boot — log level, sweepers, worker, reconcile, startup summary.
import { getLogLevelFromEnv, setLogLevel, emitLog } from "@harolds/config";
import { startPrintSweeper } from "./lib/print-sweeper";
import { startKitchenAlertSweeper } from "./lib/kitchen-alert-sweeper";
import { startJobWorker } from "./lib/job-worker";
import { startReconcileScheduler } from "./lib/reconcile-scheduler";
import { runStartupChecks } from "./lib/startup";

export async function registerNode(): Promise<void> {
  setLogLevel(getLogLevelFromEnv());
  emitLog("info", "app.start", { nodeEnv: process.env.NODE_ENV ?? "unknown" }, { scope: "app" });
  await runStartupChecks();
  startPrintSweeper();
  startKitchenAlertSweeper();
  startJobWorker();
  startReconcileScheduler();
}
