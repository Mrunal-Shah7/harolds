// SPRINT-11: scheduled reconciliation knobs — daily at a store-local hour.
import { env } from "./env";

export type ReconcileSchedulerConfig = {
  hourLocal: number;
  checkIntervalMs: number;
  lookbackHours: number;
};

export const RECONCILE_SCHEDULER_DEFAULTS: ReconcileSchedulerConfig = {
  hourLocal: 4,
  checkIntervalMs: 15 * 60 * 1000,
  lookbackHours: 48,
};

export function getReconcileSchedulerConfig(): ReconcileSchedulerConfig {
  return {
    hourLocal: env.RECONCILE_HOUR_LOCAL ?? RECONCILE_SCHEDULER_DEFAULTS.hourLocal,
    checkIntervalMs: env.RECONCILE_CHECK_INTERVAL_MS ?? RECONCILE_SCHEDULER_DEFAULTS.checkIntervalMs,
    lookbackHours: env.RECONCILE_LOOKBACK_HOURS ?? RECONCILE_SCHEDULER_DEFAULTS.lookbackHours,
  };
}
