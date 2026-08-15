// SPRINT-7: one worker pass — recover stranded, claim atomically, dispatch, retry or dead-letter.
import {
  claimDueJobs,
  completeJob,
  recoverStrandedJobs,
  recordAttemptFailure,
  payloadOf,
  type ClaimedBackgroundJob,
} from "@harolds/db";
import { emitLog } from "@harolds/config";
import { isPermanentJobError } from "./errors";
import type { NotifyPorts } from "./ports";
import type { JobRegistry } from "./registry";

export type WorkerPassResult = {
  recovered: number;
  claimed: number;
  succeeded: number;
  failed: number;
  dead: number;
};

export async function runWorkerPass(args: {
  registry: JobRegistry;
  ports: NotifyPorts;
  claimLimit: number;
  strandedMs: number;
  backoffMs: number;
  now?: Date;
  testPrefix?: string;
}): Promise<WorkerPassResult> {
  const now = args.now ?? new Date();
  const recovered = await recoverStrandedJobs({
    strandedMs: args.strandedMs,
    backoffMs: args.backoffMs,
    now,
    testPrefix: args.testPrefix,
  });

  const claimed = await claimDueJobs({ limit: args.claimLimit, now, testPrefix: args.testPrefix });
  let succeeded = 0;
  let failed = 0;
  let dead = 0;

  for (const job of claimed) {
    const outcome = await executeClaimedJob(job, args);
    if (outcome === "succeeded") succeeded += 1;
    else if (outcome === "failed") failed += 1;
    else dead += 1;
  }

  return { recovered, claimed: claimed.length, succeeded, failed, dead };
}

async function executeClaimedJob(
  job: ClaimedBackgroundJob,
  args: {
    registry: JobRegistry;
    ports: NotifyPorts;
    backoffMs: number;
    now?: Date;
  },
): Promise<"succeeded" | "failed" | "dead"> {
  const handler = args.registry[job.type];
  if (!handler) {
    const result = await recordAttemptFailure({
      job,
      error: `No handler registered for job type ${job.type}`,
      backoffMs: args.backoffMs,
      now: args.now,
      permanent: true,
    });
    return result.outcome === "dead" ? "dead" : "failed";
  }

  try {
    const payload = payloadOf<Record<string, unknown>>(job.payload);
    const correlationId = typeof payload.correlationId === "string" ? payload.correlationId : undefined;
    const orderId = typeof payload.orderId === "string" ? payload.orderId : undefined;
    const success = await handler(job, args.ports);
    await completeJob({
      jobId: job.id,
      result: success.result,
      providerMessageId: success.providerMessageId,
      now: args.now,
    });
    emitLog(
      "info",
      "jobs.executed",
      { type: job.type, result: success.result ?? null },
      { scope: "jobs", requestId: correlationId, orderId, jobId: job.id },
    );
    return "succeeded";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const permanent = isPermanentJobError(err);
    const result = await recordAttemptFailure({
      job,
      error: message,
      backoffMs: args.backoffMs,
      now: args.now,
      permanent,
    });
    return result.outcome === "dead" ? "dead" : "failed";
  }
}
