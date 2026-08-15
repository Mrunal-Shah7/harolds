// SPRINT-7: atomic claim, stranded recovery, retry/dead, ops, suppression — no live providers.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { JobStatus, JobType } from "@harolds/types";
import { prisma } from "./client";
import {
  cancelBackgroundJob,
  claimDueJobs,
  completeJob,
  deadLetterJob,
  inspectBackgroundJob,
  isPhoneSuppressed,
  recordAttemptFailure,
  recordSmsInboundEvent,
  recoverStrandedJobs,
  reportBackgroundJobs,
  retryDeadJob,
  retryDeadJobsByType,
  setSmsSuppression,
} from "./jobs";

const MARKER = "s7jobs";

async function revertUnrelatedClaims(
  claimed: Awaited<ReturnType<typeof claimDueJobs>>,
  keep: Set<string>,
): Promise<void> {
  for (const job of claimed) {
    if (keep.has(job.id)) continue;
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.PENDING,
        attemptCount: Math.max(0, job.attemptCount - 1),
        lastAttemptAt: null,
      },
    });
  }
}

async function cleanup(): Promise<void> {
  const marked = await prisma.backgroundJob.findMany({
    where: { payload: { path: ["testPrefix"], equals: MARKER } },
    select: { id: true },
  });
  const ids = marked.map((m) => m.id);
  if (ids.length > 0) {
    await prisma.backgroundJob.deleteMany({
      where: {
        type: JobType.ALERT_MANAGER_JOB_DEAD,
        OR: ids.map((id) => ({ payload: { path: ["deadJobId"], equals: id } })),
      },
    });
  }
  await prisma.backgroundJob.deleteMany({
    where: { payload: { path: ["testPrefix"], equals: MARKER } },
  });
  await prisma.smsInboundEvent.deleteMany({ where: { providerEventId: { startsWith: "s7in-" } } });
  await prisma.smsSuppression.deleteMany({ where: { phoneE164: { startsWith: "+17085557" } } });
}

async function insertJob(args: {
  type?: JobType;
  status?: JobStatus;
  attemptCount?: number;
  maxAttempts?: number;
  runAfter?: Date;
  lastAttemptAt?: Date | null;
  lastError?: string | null;
  result?: string | null;
}): Promise<string> {
  const row = await prisma.backgroundJob.create({
    data: {
      type: args.type ?? JobType.SMS_ORDER_CONFIRMATION,
      status: args.status ?? JobStatus.PENDING,
      payload: { testPrefix: MARKER, orderId: `ord-${Math.random().toString(16).slice(2)}` },
      attemptCount: args.attemptCount ?? 0,
      maxAttempts: args.maxAttempts ?? 5,
      runAfter: args.runAfter ?? new Date(Date.now() - 1_000),
      lastAttemptAt: args.lastAttemptAt ?? null,
      lastError: args.lastError ?? null,
      result: args.result ?? null,
    },
  });
  return row.id;
}

let dbAvailable = true;

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
  } catch (err) {
    dbAvailable = false;
    console.warn(`[jobs.test] skipping: ${(err as Error).message}`);
  }
});

after(async () => {
  if (dbAvailable) await cleanup();
});

describe("claimDueJobs", () => {
  it("claims at most the configured limit", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const ids: string[] = [];
    for (let i = 0; i < 15; i += 1) {
      ids.push(await insertJob({ runAfter: new Date("2000-01-01T00:00:00.000Z") }));
    }
    const claimed = await claimDueJobs({ limit: 10, testPrefix: MARKER });
    const claimedOurs = claimed.filter((j) => ids.includes(j.id));
    assert.equal(claimedOurs.length, 10);
    assert.ok(claimedOurs.every((j) => j.status === JobStatus.RUNNING));
    assert.ok(claimedOurs.every((j) => j.attemptCount === 1));
    const leftover = await prisma.backgroundJob.count({
      where: {
        id: { in: ids },
        status: JobStatus.PENDING,
      },
    });
    assert.equal(leftover, 5);
    await revertUnrelatedClaims(claimed, new Set(ids));
  });

  it("two overlapping claims never return the same job", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const id = await insertJob({ runAfter: new Date("2000-01-01T00:00:00.000Z") });
    const [a, b] = await Promise.all([
      claimDueJobs({ limit: 10, testPrefix: MARKER }),
      claimDueJobs({ limit: 10, testPrefix: MARKER }),
    ]);
    const ours = [...a, ...b].filter((j) => j.id === id);
    assert.equal(ours.length, 1);
    await revertUnrelatedClaims([...a, ...b], new Set([id]));
  });

  it("does not select jobs whose runAfter is in the future", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const id = await insertJob({ runAfter: new Date("2099-06-01T00:00:00.000Z") });
    const claimed = await claimDueJobs({ limit: 10, testPrefix: MARKER });
    assert.equal(claimed.some((j) => j.id === id), false);
    await revertUnrelatedClaims(claimed, new Set());
  });
});

describe("recoverStrandedJobs", () => {
  it("returns a stranded RUNNING job to FAILED with backoff, without double-incrementing", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const now = new Date();
    const id = await insertJob({
      status: JobStatus.RUNNING,
      attemptCount: 1,
      lastAttemptAt: new Date(now.getTime() - 120_000),
    });
    const n = await recoverStrandedJobs({
      strandedMs: 90_000,
      backoffMs: 1_000,
      now,
      testPrefix: MARKER,
    });
    assert.equal(n, 1);
    const row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id } });
    assert.equal(row.status, JobStatus.FAILED);
    assert.equal(row.attemptCount, 1);
    assert.ok(row.runAfter.getTime() >= now.getTime() + 900);
  });
});

describe("recordAttemptFailure", () => {
  it("schedules backoff that increases with attemptCount", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const now = new Date();
    const id1 = await insertJob({ status: JobStatus.RUNNING, attemptCount: 1, maxAttempts: 5 });
    const id2 = await insertJob({ status: JobStatus.RUNNING, attemptCount: 2, maxAttempts: 5 });
    const job1 = await inspectBackgroundJob(id1);
    const job2 = await inspectBackgroundJob(id2);
    assert.ok(job1 && job2);
    await recordAttemptFailure({ job: job1, error: "boom", backoffMs: 1_000, now, permanent: false });
    await recordAttemptFailure({ job: job2, error: "boom", backoffMs: 1_000, now, permanent: false });
    const a = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: id1 } });
    const b = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: id2 } });
    const delay1 = a.runAfter.getTime() - now.getTime();
    const delay2 = b.runAfter.getTime() - now.getTime();
    assert.equal(delay1, 1_000);
    assert.equal(delay2, 2_000);
    assert.ok(delay2 > delay1);
  });

  it("moves to DEAD at the attempt ceiling and enqueues exactly one job-dead alert", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const id = await insertJob({
      type: JobType.SMS_ORDER_CONFIRMATION,
      status: JobStatus.RUNNING,
      attemptCount: 5,
      maxAttempts: 5,
    });
    const job = await inspectBackgroundJob(id);
    assert.ok(job);
    const first = await recordAttemptFailure({
      job,
      error: "still failing",
      backoffMs: 1_000,
      permanent: false,
    });
    assert.equal(first.outcome, "dead");
    assert.equal(first.alertEnqueued, true);
    const row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id } });
    assert.equal(row.status, JobStatus.DEAD);
    const alerts = await prisma.backgroundJob.findMany({
      where: { type: JobType.ALERT_MANAGER_JOB_DEAD, payload: { path: ["deadJobId"], equals: id } },
    });
    assert.equal(alerts.length, 1);
    const again = await deadLetterJob({ job, error: "still failing" });
    assert.equal(again.alertEnqueued, false);
    const alerts2 = await prisma.backgroundJob.findMany({
      where: { type: JobType.ALERT_MANAGER_JOB_DEAD, payload: { path: ["deadJobId"], equals: id } },
    });
    assert.equal(alerts2.length, 1);
  });

  it("does not enqueue a job-dead alert when a manager alert itself dies", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const id = await insertJob({
      type: JobType.ALERT_MANAGER_PRINT_FAILED,
      status: JobStatus.RUNNING,
      attemptCount: 1,
      maxAttempts: 5,
    });
    const job = await inspectBackgroundJob(id);
    assert.ok(job);
    const result = await recordAttemptFailure({
      job,
      error: "sms down",
      backoffMs: 1_000,
      permanent: true,
    });
    assert.equal(result.outcome, "dead");
    assert.equal(result.alertEnqueued, false);
    const alerts = await prisma.backgroundJob.findMany({
      where: { type: JobType.ALERT_MANAGER_JOB_DEAD, payload: { path: ["deadJobId"], equals: id } },
    });
    assert.equal(alerts.length, 0);
  });

  it("a permanent failure goes DEAD on the first attempt", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const id = await insertJob({ status: JobStatus.RUNNING, attemptCount: 1, maxAttempts: 5 });
    const job = await inspectBackgroundJob(id);
    assert.ok(job);
    const result = await recordAttemptFailure({
      job,
      error: "invalid number",
      backoffMs: 1_000,
      permanent: true,
    });
    assert.equal(result.outcome, "dead");
    const row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id } });
    assert.equal(row.status, JobStatus.DEAD);
    assert.equal(row.attemptCount, 1);
  });
});

describe("ops", () => {
  it("reports counts against a known set and flags a dead threshold", async () => {
    if (!dbAvailable) return;
    await cleanup();
    await insertJob({ status: JobStatus.PENDING });
    await insertJob({ status: JobStatus.FAILED, lastError: "x" });
    await insertJob({ status: JobStatus.DEAD, lastError: "y" });
    await insertJob({ status: JobStatus.DEAD, lastError: "z" });
    await insertJob({ status: JobStatus.SUCCEEDED, result: "SENT" });
    const report = await reportBackgroundJobs({ deadAlertThreshold: 2 });
    assert.ok(report.counts.PENDING >= 1);
    assert.ok(report.counts.FAILED >= 1);
    assert.ok(report.counts.DEAD >= 2);
    assert.ok(report.counts.SUCCEEDED >= 1);
    assert.equal(report.deadJobsAboveThreshold, true);
    assert.ok(report.oldestPendingAgeMs !== null);
    assert.ok(report.recentErrors.length >= 1);
  });

  it("retries a dead job and bulk-retries by type, and cancel keeps the row", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const sms = await insertJob({ type: JobType.SMS_ORDER_CONFIRMATION, status: JobStatus.DEAD, attemptCount: 5 });
    const email = await insertJob({ type: JobType.EMAIL_ORDER_RECEIPT, status: JobStatus.DEAD, attemptCount: 5 });
    const retried = await retryDeadJob(sms);
    assert.equal(retried.status, JobStatus.PENDING);
    assert.equal(retried.attemptCount, 0);
    const n = await retryDeadJobsByType(JobType.EMAIL_ORDER_RECEIPT, new Date(), { testPrefix: MARKER });
    assert.equal(n, 1);
    const emailRow = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: email } });
    assert.equal(emailRow.status, JobStatus.PENDING);
    const pending = await insertJob({ status: JobStatus.PENDING });
    const cancelled = await cancelBackgroundJob(pending);
    assert.equal(cancelled.status, JobStatus.CANCELLED);
    const still = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: pending } });
    assert.ok(still);
    const claimed = await claimDueJobs({ limit: 50, testPrefix: MARKER });
    assert.equal(claimed.some((j) => j.id === pending), false);
    await completeJob({ jobId: retried.id, result: "SENT" });
  });
});

describe("suppression", () => {
  it("honours opt-out and restores on opt-in; inbound is idempotent", async () => {
    if (!dbAvailable) return;
    const phone = "+17085557001";
    await prisma.smsSuppression.deleteMany({ where: { phoneE164: phone } });
    await prisma.smsInboundEvent.deleteMany({ where: { fromPhone: phone } });
    assert.equal(await isPhoneSuppressed(phone), false);
    await setSmsSuppression({ phoneE164: phone, suppressed: true });
    assert.equal(await isPhoneSuppressed(phone), true);
    await setSmsSuppression({ phoneE164: phone, suppressed: false });
    assert.equal(await isPhoneSuppressed(phone), false);
    const first = await recordSmsInboundEvent({
      providerEventId: "s7in-dup",
      fromPhone: phone,
      body: "STOP",
      kind: "opt_out",
    });
    const second = await recordSmsInboundEvent({
      providerEventId: "s7in-dup",
      fromPhone: phone,
      body: "STOP",
      kind: "opt_out",
    });
    assert.equal(first.outcome, "recorded");
    assert.equal(second.outcome, "duplicate");
  });
});
