// SPRINT-7: background-job claim, stranded recovery, completion, dead-letter, ops, SMS suppression.
import { JobStatus, JobType, isManagerAlertJobType } from "@harolds/types";
import { emitLog } from "@harolds/config";
import { prisma } from "./client";
import type { Prisma, BackgroundJob, JobStatus as DbJobStatus, JobType as DbJobType } from "./generated/prisma";

function retryBackoffMs(baseMs: number, attemptCount: number): number {
  const exp = Math.min(Math.max(attemptCount, 1) - 1, 4);
  return baseMs * 2 ** exp;
}

export type ClaimedBackgroundJob = {
  id: string;
  type: JobType;
  status: JobStatus;
  payload: Prisma.JsonValue;
  attemptCount: number;
  maxAttempts: number;
  runAfter: Date;
  lastAttemptAt: Date | null;
  lastError: string | null;
  providerMessageId: string | null;
  result: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function asClaimed(row: BackgroundJob): ClaimedBackgroundJob {
  return {
    id: row.id,
    type: row.type as JobType,
    status: row.status as JobStatus,
    payload: row.payload,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    runAfter: row.runAfter,
    lastAttemptAt: row.lastAttemptAt,
    lastError: row.lastError,
    providerMessageId: row.providerMessageId,
    result: row.result,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function payloadOrderId(payload: Prisma.JsonValue): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const value = (payload as Record<string, unknown>).orderId;
  return typeof value === "string" ? value : undefined;
}

/**
 * Atomically select due PENDING/FAILED jobs and mark them RUNNING.
 * Attempt count is incremented here — that is when an attempt starts.
 * SKIP LOCKED: overlapping passes cannot execute the same row.
 */
export async function claimDueJobs(args: {
  limit: number;
  now?: Date;
  /** Test isolation: only claim rows whose payload.testPrefix matches. */
  testPrefix?: string;
}): Promise<ClaimedBackgroundJob[]> {
  const now = args.now ?? new Date();
  const limit = Math.max(1, Math.floor(args.limit));
  const prefix = args.testPrefix ?? null;
  const nowUtc = now.toISOString();
  const rows = await prisma.$queryRaw<BackgroundJob[]>`
    UPDATE "BackgroundJob" AS j
    SET
      status = 'RUNNING'::"JobStatus",
      "lastAttemptAt" = (${nowUtc}::timestamptz AT TIME ZONE 'UTC'),
      "attemptCount" = j."attemptCount" + 1,
      "updatedAt" = (${nowUtc}::timestamptz AT TIME ZONE 'UTC')
    WHERE j.id IN (
      SELECT p.id
      FROM "BackgroundJob" p
      WHERE p.status IN ('PENDING'::"JobStatus", 'FAILED'::"JobStatus")
        AND p."runAfter" <= (${nowUtc}::timestamptz AT TIME ZONE 'UTC')
        AND (${prefix}::text IS NULL OR p.payload->>'testPrefix' = ${prefix})
      ORDER BY p."runAfter" ASC, p."createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      j.id, j.type, j.status, j.payload, j."attemptCount", j."maxAttempts",
      j."runAfter", j."lastAttemptAt", j."lastError", j."providerMessageId",
      j.result, j."createdAt", j."updatedAt"
  `;
  return rows.map(asClaimed);
}

/**
 * RUNNING jobs whose attempt started before the timeout are treated as a failed attempt.
 * The claim already incremented attemptCount — recovery does not increment again.
 */
export async function recoverStrandedJobs(args: {
  strandedMs: number;
  backoffMs: number;
  now?: Date;
  testPrefix?: string;
}): Promise<number> {
  const now = args.now ?? new Date();
  const cutoff = new Date(now.getTime() - args.strandedMs);
  const stranded = await prisma.backgroundJob.findMany({
    where: {
      status: JobStatus.RUNNING,
      lastAttemptAt: { lte: cutoff },
      ...(args.testPrefix
        ? { payload: { path: ["testPrefix"], equals: args.testPrefix } }
        : {}),
    },
  });
  for (const job of stranded) {
    await recordAttemptFailure({
      job: asClaimed(job),
      error: "Stranded: worker died before the attempt completed.",
      backoffMs: args.backoffMs,
      now,
      permanent: false,
    });
  }
  return stranded.length;
}

export async function recordJobProviderMessageId(jobId: string, providerMessageId: string): Promise<void> {
  await prisma.backgroundJob.update({
    where: { id: jobId },
    data: { providerMessageId },
  });
}

export async function completeJob(args: {
  jobId: string;
  result: string;
  providerMessageId?: string | null;
  now?: Date;
}): Promise<void> {
  const now = args.now ?? new Date();
  await prisma.backgroundJob.update({
    where: { id: args.jobId },
    data: {
      status: JobStatus.SUCCEEDED,
      result: args.result,
      lastError: null,
      ...(args.providerMessageId ? { providerMessageId: args.providerMessageId } : {}),
      updatedAt: now,
    },
  });
}

export type AttemptFailureResult = { outcome: "failed" | "dead"; alertEnqueued: boolean };

/**
 * Failed attempt: schedule retry with backoff, or move to DEAD at the ceiling / on permanent failure.
 * A dying manager-alert job does not enqueue ALERT_MANAGER_JOB_DEAD (recursion guard).
 */
export async function recordAttemptFailure(args: {
  job: ClaimedBackgroundJob;
  error: string;
  backoffMs: number;
  now?: Date;
  permanent: boolean;
}): Promise<AttemptFailureResult> {
  const now = args.now ?? new Date();
  const atCeiling = args.job.attemptCount >= args.job.maxAttempts;
  if (args.permanent || atCeiling) {
    return deadLetterJob({
      job: args.job,
      error: args.error,
      now,
    });
  }

  const delay = retryBackoffMs(args.backoffMs, args.job.attemptCount);
  await prisma.backgroundJob.update({
    where: { id: args.job.id },
    data: {
      status: JobStatus.FAILED,
      lastError: args.error.slice(0, 2000),
      runAfter: new Date(now.getTime() + delay),
      updatedAt: now,
    },
  });
  return { outcome: "failed", alertEnqueued: false };
}

export async function deadLetterJob(args: {
  job: ClaimedBackgroundJob;
  error: string;
  now?: Date;
}): Promise<AttemptFailureResult> {
  const now = args.now ?? new Date();
  await prisma.backgroundJob.update({
    where: { id: args.job.id },
    data: {
      status: JobStatus.DEAD,
      lastError: args.error.slice(0, 2000),
      updatedAt: now,
    },
  });

  if (isManagerAlertJobType(args.job.type)) {
    emitLog(
      "error",
      "jobs.manager_alert_dead",
      {
        type: args.job.type,
        lastError: args.error.slice(0, 500),
        note: "Recursion guard: not enqueueing ALERT_MANAGER_JOB_DEAD about a manager alert.",
      },
      { scope: "jobs", jobId: args.job.id },
    );
    return { outcome: "dead", alertEnqueued: false };
  }

  const existing = await prisma.backgroundJob.findFirst({
    where: {
      type: JobType.ALERT_MANAGER_JOB_DEAD,
      payload: { path: ["deadJobId"], equals: args.job.id },
    },
    select: { id: true },
  });
  if (existing) {
    return { outcome: "dead", alertEnqueued: false };
  }

  await prisma.backgroundJob.create({
    data: {
      type: JobType.ALERT_MANAGER_JOB_DEAD,
      status: JobStatus.PENDING,
      payload: {
        deadJobId: args.job.id,
        deadJobType: args.job.type,
        orderId: payloadOrderId(args.job.payload) ?? null,
        lastError: args.error.slice(0, 500),
        attemptCount: args.job.attemptCount,
      } as Prisma.InputJsonValue,
      runAfter: now,
    },
  });
  return { outcome: "dead", alertEnqueued: true };
}

export type BackgroundJobCounts = Record<JobStatus, number>;

export type BackgroundQueueReport = {
  counts: BackgroundJobCounts;
  countsByType: Array<{ type: JobType; status: JobStatus; count: number }>;
  oldestPendingAgeMs: number | null;
  deadCount: number;
  deadJobsAboveThreshold: boolean;
  deadAlertThreshold: number;
  recentErrors: Array<{ id: string; type: JobType; status: JobStatus; lastError: string | null; updatedAt: Date }>;
};

export async function reportBackgroundJobs(args?: {
  now?: Date;
  deadAlertThreshold?: number;
}): Promise<BackgroundQueueReport> {
  const now = args?.now ?? new Date();
  const deadAlertThreshold = args?.deadAlertThreshold ?? 5;
  const groups = await prisma.backgroundJob.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const counts: BackgroundJobCounts = {
    PENDING: 0,
    RUNNING: 0,
    SUCCEEDED: 0,
    FAILED: 0,
    DEAD: 0,
    CANCELLED: 0,
  };
  for (const g of groups) {
    counts[g.status as JobStatus] = g._count._all;
  }

  const byType = await prisma.backgroundJob.groupBy({
    by: ["type", "status"],
    _count: { _all: true },
  });
  const countsByType = byType.map((g) => ({
    type: g.type as JobType,
    status: g.status as JobStatus,
    count: g._count._all,
  }));

  const oldest = await prisma.backgroundJob.findFirst({
    where: { status: { in: [JobStatus.PENDING, JobStatus.FAILED] } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const oldestPendingAgeMs = oldest ? Math.max(0, now.getTime() - oldest.createdAt.getTime()) : null;

  const recentErrors = await prisma.backgroundJob.findMany({
    where: {
      status: { in: [JobStatus.FAILED, JobStatus.DEAD] },
      lastError: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { id: true, type: true, status: true, lastError: true, updatedAt: true },
  });

  const deadCount = counts.DEAD;
  const deadJobsAboveThreshold = deadCount >= deadAlertThreshold;
  if (deadJobsAboveThreshold) {
    emitLog(
      "error",
      "jobs.dead_threshold",
      {
        deadCount,
        deadAlertThreshold,
        note: "Dead jobs are messages nobody received. Do not alert through SMS/email — those channels may be the failure. Inspect the queue report.",
      },
      { scope: "jobs" },
    );
  }

  return {
    counts,
    countsByType,
    oldestPendingAgeMs,
    deadCount,
    deadJobsAboveThreshold,
    deadAlertThreshold,
    recentErrors: recentErrors.map((r) => ({
      id: r.id,
      type: r.type as JobType,
      status: r.status as JobStatus,
      lastError: r.lastError,
      updatedAt: r.updatedAt,
    })),
  };
}

export async function inspectBackgroundJob(jobId: string): Promise<ClaimedBackgroundJob | null> {
  const row = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  return row ? asClaimed(row) : null;
}

export async function retryDeadJob(jobId: string, now = new Date()): Promise<ClaimedBackgroundJob> {
  const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Unknown background job ${jobId}`);
  if (job.status !== JobStatus.DEAD) {
    throw new Error(`Cannot retry job ${jobId} in status ${job.status}`);
  }
  const updated = await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: JobStatus.PENDING,
      attemptCount: 0,
      lastError: null,
      result: null,
      runAfter: now,
    },
  });
  return asClaimed(updated);
}

export async function retryDeadJobsByType(
  type: JobType,
  now = new Date(),
  opts?: { testPrefix?: string },
): Promise<number> {
  const where: Prisma.BackgroundJobWhereInput = {
    type: type as DbJobType,
    status: JobStatus.DEAD as DbJobStatus,
  };
  if (opts?.testPrefix) {
    where.payload = { path: ["testPrefix"], equals: opts.testPrefix };
  }
  const result = await prisma.backgroundJob.updateMany({
    where,
    data: {
      status: JobStatus.PENDING,
      attemptCount: 0,
      lastError: null,
      result: null,
      runAfter: now,
    },
  });
  return result.count;
}

export async function cancelBackgroundJob(jobId: string, now = new Date()): Promise<ClaimedBackgroundJob> {
  const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Unknown background job ${jobId}`);
  if (job.status !== JobStatus.PENDING && job.status !== JobStatus.FAILED && job.status !== JobStatus.DEAD) {
    throw new Error(`Cannot cancel job ${jobId} in status ${job.status}`);
  }
  const updated = await prisma.backgroundJob.update({
    where: { id: jobId },
    data: { status: JobStatus.CANCELLED, updatedAt: now },
  });
  return asClaimed(updated);
}

export async function countRecentDeliveredAlerts(args: {
  type: JobType;
  windowMs: number;
  now?: Date;
}): Promise<number> {
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - args.windowMs);
  return prisma.backgroundJob.count({
    where: {
      type: args.type as DbJobType,
      status: JobStatus.SUCCEEDED,
      result: "SENT",
      updatedAt: { gte: since },
    },
  });
}

export async function isPhoneSuppressed(phoneE164: string): Promise<boolean> {
  const row = await prisma.smsSuppression.findUnique({
    where: { phoneE164 },
    select: { suppressed: true },
  });
  return row?.suppressed === true;
}

export async function setSmsSuppression(args: {
  phoneE164: string;
  suppressed: boolean;
  at?: Date;
}): Promise<void> {
  const at = args.at ?? new Date();
  await prisma.smsSuppression.upsert({
    where: { phoneE164: args.phoneE164 },
    create: {
      phoneE164: args.phoneE164,
      suppressed: args.suppressed,
      optedOutAt: args.suppressed ? at : null,
      optedInAt: args.suppressed ? null : at,
    },
    update: {
      suppressed: args.suppressed,
      ...(args.suppressed ? { optedOutAt: at } : { optedInAt: at }),
    },
  });
}

export type SmsInboundKind = "opt_out" | "opt_in" | "ignored";

export type RecordSmsInboundResult =
  | { outcome: "duplicate"; kind: SmsInboundKind }
  | { outcome: "recorded"; kind: SmsInboundKind };

export async function recordSmsInboundEvent(args: {
  providerEventId: string;
  fromPhone: string;
  body: string;
  kind: SmsInboundKind;
}): Promise<RecordSmsInboundResult> {
  const existing = await prisma.smsInboundEvent.findUnique({
    where: { providerEventId: args.providerEventId },
    select: { kind: true },
  });
  if (existing) {
    return { outcome: "duplicate", kind: existing.kind as SmsInboundKind };
  }
  await prisma.smsInboundEvent.create({
    data: {
      providerEventId: args.providerEventId,
      fromPhone: args.fromPhone,
      body: args.body.slice(0, 500),
      kind: args.kind,
    },
  });
  return { outcome: "recorded", kind: args.kind };
}

export function payloadOf<T extends Record<string, unknown>>(payload: Prisma.JsonValue): T {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {} as T;
  }
  return payload as T;
}
