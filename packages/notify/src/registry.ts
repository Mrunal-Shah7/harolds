// SPRINT-7: job-type registry — missing handlers fail at start-up, not silently at runtime.
import { ALL_JOB_TYPES, type JobType } from "@harolds/types";
import { JOB_HANDLERS, type JobHandler } from "./handlers";

export type JobRegistry = Record<JobType, JobHandler>;

export function createJobRegistry(handlers: Partial<Record<JobType, JobHandler>>): JobRegistry {
  const missing = ALL_JOB_TYPES.filter((type) => !handlers[type]);
  if (missing.length > 0) {
    throw new Error(`Job registry missing handlers for: ${missing.join(", ")}`);
  }
  return handlers as JobRegistry;
}

export function createDefaultJobRegistry(): JobRegistry {
  return createJobRegistry(JOB_HANDLERS);
}
