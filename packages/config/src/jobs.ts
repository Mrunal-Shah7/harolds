// SPRINT-7: background-job worker knobs — interval, claim bound, stranded timeout, backoff.
import { env } from "./env";

export type JobWorkerConfig = {
  intervalMs: number;
  claimLimit: number;
  strandedMs: number;
  backoffMs: number;
  deadAlertThreshold: number;
  alertMaxPerWindow: number;
  alertWindowMs: number;
};

export const JOB_WORKER_DEFAULTS: JobWorkerConfig = {
  // Faster than the print sweeper (10s): confirmation should leave shortly after payment.
  intervalMs: 5_000,
  // Bound so a crash cannot strand a thousand RUNNING rows.
  claimLimit: 10,
  // Same order of magnitude as print sent-timeout; a send should finish in seconds.
  strandedMs: 90_000,
  backoffMs: 30_000,
  deadAlertThreshold: 5,
  alertMaxPerWindow: 1,
  alertWindowMs: 15 * 60 * 1000,
};

export function getJobWorkerConfig(): JobWorkerConfig {
  return {
    intervalMs: env.JOB_WORKER_INTERVAL_MS ?? JOB_WORKER_DEFAULTS.intervalMs,
    claimLimit: env.JOB_WORKER_CLAIM_LIMIT ?? JOB_WORKER_DEFAULTS.claimLimit,
    strandedMs: env.JOB_WORKER_STRANDED_MS ?? JOB_WORKER_DEFAULTS.strandedMs,
    backoffMs: env.JOB_WORKER_BACKOFF_MS ?? JOB_WORKER_DEFAULTS.backoffMs,
    deadAlertThreshold: env.JOB_DEAD_ALERT_THRESHOLD ?? JOB_WORKER_DEFAULTS.deadAlertThreshold,
    alertMaxPerWindow: env.JOB_ALERT_MAX_PER_WINDOW ?? JOB_WORKER_DEFAULTS.alertMaxPerWindow,
    alertWindowMs: env.JOB_ALERT_WINDOW_MS ?? JOB_WORKER_DEFAULTS.alertWindowMs,
  };
}

export function jobRetryBackoffMs(baseMs: number, attemptCount: number): number {
  const exp = Math.min(Math.max(attemptCount, 1) - 1, 4);
  return baseMs * 2 ** exp;
}
