// SPRINT-7 / SPRINT-18: worker pass — overlapping claims, retry, volume cap. No live providers.
// The consent / suppression / inbound-keyword suites went with the SMS subsystem in Sprint 18;
// the generic worker behaviours they happened to exercise are now driven through email jobs.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { JobStatus, JobType, OrderStatus, PaymentStatus } from "@harolds/types";
import {
  invalidateStoreConfigCache,
  prisma,
  claimDueJobs,
} from "@harolds/db";
import type { EmailSendResult } from "@harolds/email";
import { PermanentJobError } from "./errors";
import { createDefaultJobRegistry, createJobRegistry } from "./registry";
import { JOB_HANDLERS } from "./handlers";
import type { NotifyPorts } from "./ports";
import { runWorkerPass } from "./worker";

const PREFIX = "s7notify-";
let sequence = 870_000;

async function cleanup(): Promise<void> {
  const jobs = await prisma.backgroundJob.findMany({
    where: { payload: { path: ["testPrefix"], equals: PREFIX } },
    select: { id: true },
  });
  await prisma.backgroundJob.deleteMany({
    where: {
      OR: [
        { payload: { path: ["testPrefix"], equals: PREFIX } },
        ...jobs.map((j) => ({ payload: { path: ["deadJobId"], equals: j.id } })),
      ],
    },
  });
  await prisma.order.deleteMany({ where: { clientIdempotencyKey: { startsWith: PREFIX } } });

  // The manager-alert volume cap counts EVERY delivered alert of a type in a rolling window,
  // not just this suite's. A SUCCEEDED/SENT alert left behind by another suite (the Sprint-5
  // print tests enqueue real ALERT_MANAGER_PRINT_FAILED jobs, with no testPrefix to match on)
  // silently caps the alerts these tests expect to send, for fifteen minutes. Clear delivered
  // alerts of the types exercised here so the cap starts from zero regardless of run order.
  await prisma.backgroundJob.deleteMany({
    where: {
      type: { in: [JobType.ALERT_MANAGER_PRINT_FAILED, JobType.ALERT_MANAGER_JOB_DEAD] },
      status: JobStatus.SUCCEEDED,
      result: "SENT",
    },
  });
}

async function createOrder(args: {
  phone?: string;
  email?: string;
  estimatedReadyAt?: Date;
} = {}): Promise<string> {
  const key = `${PREFIX}${Math.random().toString(16).slice(2)}`;
  const order = await prisma.order.create({
    data: {
      orderNumber: `HC-S7-${key.slice(-4)}`,
      orderSequence: sequence++,
      businessDate: new Date("2099-03-01T00:00:00.000Z"),
      customerFirstName: "Pat",
      customerLastName: "Jones",
      customerPhone: args.phone ?? "+17085558001",
      customerEmail: args.email ?? "s7notify@example.com",
      subtotalCents: 1099,
      taxCents: 111,
      tipCents: 200,
      totalCents: 1410,
      taxRateBps: 1010,
      taxAppliedPreDiscount: true,
      paymentStatus: PaymentStatus.CAPTURED,
      status: OrderStatus.PAID,
      paidAt: new Date(),
      estimatedReadyAt: args.estimatedReadyAt ?? new Date("2026-08-15T22:20:00.000Z"),
      lookupToken: key,
      clientIdempotencyKey: key,
      cartFingerprint: key,
      customerNote: "Please add extra sauce.",
      lines: {
        create: [
          {
            quantity: 1,
            itemName: "6pc Dark",
            boardLabel: "6 DARK",
            unitPriceCents: 1099,
            modifierTotalCents: 0,
            effectiveUnitPriceCents: 1099,
            lineTotalCents: 1099,
            selectedModifiers: [{ optionName: "Mild sauce" }],
            customerNote: "No gizzards",
          },
        ],
      },
    },
  });
  return order.id;
}

async function enqueue(type: JobType, payload: Record<string, unknown>, extra?: { maxAttempts?: number }) {
  return prisma.backgroundJob.create({
    data: {
      type,
      status: JobStatus.PENDING,
      payload: { testPrefix: PREFIX, ...payload },
      runAfter: new Date(Date.now() - 1_000),
      maxAttempts: extra?.maxAttempts ?? 5,
    },
  });
}

function ports(opts?: {
  email?: EmailSendResult;
  delayMs?: number;
  onEmail?: () => void;
}): NotifyPorts & { emailCalls: { n: number; subjects: string[] } } {
  const emailCalls = { n: 0, subjects: [] as string[] };
  return {
    emailCalls,
    sendEmail: async (input) => {
      emailCalls.n += 1;
      emailCalls.subjects.push(input.subject);
      opts?.onEmail?.();
      if (opts?.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      return opts?.email ?? { kind: "sent", providerMessageId: `em${emailCalls.n}` };
    },
  };
}

const registry = createDefaultJobRegistry();

const PASS = {
  registry,
  claimLimit: 10,
  strandedMs: 90_000,
  backoffMs: 1_000,
  testPrefix: PREFIX,
};

let dbAvailable = true;
let savedAlerts: { email: string | null } | null = null;

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
    const store = await prisma.storeConfig.findUniqueOrThrow({ where: { id: "default" } });
    savedAlerts = { email: store.managerAlertEmail };
  } catch (err) {
    dbAvailable = false;
    console.warn(`[worker.test] skipping: ${(err as Error).message}`);
  }
});

after(async () => {
  if (!dbAvailable) return;
  if (savedAlerts) {
    await prisma.storeConfig.update({
      where: { id: "default" },
      data: { managerAlertEmail: savedAlerts.email },
    });
    invalidateStoreConfigCache();
  }
  await cleanup();
});

describe("runWorkerPass", () => {
  it("overlapping passes with a slow handler execute a job once", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const orderId = await createOrder();
    await enqueue(JobType.EMAIL_ORDER_RECEIPT, { orderId });
    const p = ports({ delayMs: 200 });
    const [a, b] = await Promise.all([
      runWorkerPass({ ...PASS, ports: p }),
      runWorkerPass({ ...PASS, ports: p }),
    ]);
    assert.equal(a.claimed + b.claimed, 1);
    assert.equal(p.emailCalls.n, 1, "a job claimed by two overlapping passes still sends once");
  });

  it("records the provider id before completing, and retries skip a second send", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const orderId = await createOrder();
    const job = await enqueue(JobType.EMAIL_ORDER_RECEIPT, { orderId });
    const p = ports();
    await runWorkerPass({ ...PASS, ports: p });
    const row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.providerMessageId, "em1");
    assert.equal(row.status, JobStatus.SUCCEEDED);
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: { status: JobStatus.PENDING, runAfter: new Date(Date.now() - 1_000), attemptCount: 0 },
    });
    const p2 = ports();
    await runWorkerPass({ ...PASS, ports: p2 });
    assert.equal(p2.emailCalls.n, 0, "a recorded provider id suppresses a second send");
  });

  it("a rejected unsendable address is permanent (DEAD on first attempt)", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const orderId = await createOrder();
    const job = await enqueue(JobType.EMAIL_ORDER_RECEIPT, { orderId }, { maxAttempts: 5 });
    const p = ports({ email: { kind: "rejected", code: "invalid_to", message: "bad" } });
    const result = await runWorkerPass({ ...PASS, ports: p });
    assert.equal(result.dead, 1);
    const row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.status, JobStatus.DEAD);
    assert.equal(row.attemptCount, 1);
  });

  it("a thrown handler schedules retry with backoff rather than immediate re-attempt", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const now = new Date();
    const job = await prisma.backgroundJob.create({
      data: {
        type: JobType.EMAIL_ORDER_READY,
        status: JobStatus.PENDING,
        payload: { testPrefix: PREFIX },
        runAfter: new Date(now.getTime() - 1_000),
        maxAttempts: 5,
      },
    });
    const throwing = createJobRegistry({
      ...JOB_HANDLERS,
      [JobType.EMAIL_ORDER_READY]: async () => {
        throw new Error("provider down");
      },
    });
    await runWorkerPass({ ...PASS, registry: throwing, ports: ports(), now });
    const row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.status, JobStatus.FAILED);
    assert.equal(row.runAfter.getTime() - now.getTime(), 1_000);
    const beforeDue = new Date(row.runAfter.getTime() - 5_000);
    const claimedEarly = await claimDueJobs({ limit: 10, now: beforeDue, testPrefix: PREFIX });
    assert.equal(
      claimedEarly.length,
      0,
      claimedEarly.map((j) => `${j.id}:${j.type}:${j.runAfter.toISOString()}`).join(","),
    );
  });

  it("stranded RUNNING jobs are recovered then executed", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const orderId = await createOrder();
    const job = await prisma.backgroundJob.create({
      data: {
        type: JobType.EMAIL_ORDER_RECEIPT,
        status: JobStatus.RUNNING,
        payload: { testPrefix: PREFIX, orderId },
        attemptCount: 1,
        lastAttemptAt: new Date(Date.now() - 120_000),
        runAfter: new Date(Date.now() - 120_000),
      },
    });
    const p = ports();
    const now = new Date();
    const recovered = await runWorkerPass({
      ...PASS,
      ports: p,
      strandedMs: 90_000,
      backoffMs: 1,
      now,
    });
    assert.equal(recovered.recovered, 1);
    const later = new Date(now.getTime() + 50);
    await runWorkerPass({ ...PASS, ports: p, strandedMs: 90_000, backoffMs: 1, now: later });
    const row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.status, JobStatus.SUCCEEDED);
    assert.equal(p.emailCalls.n, 1);
  });

  it("email receipt sends html and text and matches stored cents", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const orderId = await createOrder();
    const box: { current: { html: string; text: string } | null } = { current: null };
    const p: NotifyPorts = {
      sendEmail: async (input) => {
        box.current = { html: input.html, text: input.text };
        return { kind: "sent", providerMessageId: "em_receipt" };
      },
    };
    await enqueue(JobType.EMAIL_ORDER_RECEIPT, { orderId });
    await runWorkerPass({ ...PASS, ports: p });
    const captured = box.current;
    if (!captured) throw new Error("email not sent");
    assert.match(captured.text, /6pc Dark/);
    assert.match(captured.text, /Mild sauce/);
    assert.match(captured.text, /\$10\.99/);
    assert.match(captured.text, /\$1\.11/);
    assert.match(captured.text, /\$2\.00/);
    assert.match(captured.text, /\$14\.10/);
    assert.match(captured.html, /<html/);
    assert.ok(captured.text.length > 40);
  });

  it("manager alert with no destination is a permanent failure", async () => {
    if (!dbAvailable) return;
    await cleanup();
    await prisma.storeConfig.update({
      where: { id: "default" },
      data: { managerAlertEmail: "todo-manager-alerts@localhost" },
    });
    invalidateStoreConfigCache();
    const job = await enqueue(JobType.ALERT_MANAGER_PRINT_FAILED, {
      orderId: "ord_missing_dest",
      orderNumber: "HC-042",
      target: "KITCHEN_TICKET",
      lastError: "offline",
      printerSerial: "XBVN044247",
    });
    const p = ports();
    const result = await runWorkerPass({ ...PASS, ports: p });
    assert.equal(result.dead, 1);
    assert.equal(p.emailCalls.n, 0);
    const row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.status, JobStatus.DEAD);
    const extraAlerts = await prisma.backgroundJob.count({
      where: { type: JobType.ALERT_MANAGER_JOB_DEAD, payload: { path: ["deadJobId"], equals: job.id } },
    });
    assert.equal(extraAlerts, 0);
  });

  it("caps a burst of the same manager alert type", async () => {
    if (!dbAvailable) return;
    await cleanup();
    await prisma.storeConfig.update({
      where: { id: "default" },
      data: { managerAlertEmail: "burst-cap@example.com" },
    });
    invalidateStoreConfigCache();
    await enqueue(JobType.ALERT_MANAGER_PRINT_FAILED, {
      orderId: "ord_burst_1",
      orderNumber: "HC-001",
      target: "KITCHEN_TICKET",
      lastError: "offline",
      printerSerial: "XBVN044247",
    });
    await enqueue(JobType.ALERT_MANAGER_PRINT_FAILED, {
      orderId: "ord_burst_2",
      orderNumber: "HC-002",
      target: "KITCHEN_TICKET",
      lastError: "offline",
      printerSerial: "XBVN044247",
    });
    const p = ports();
    await runWorkerPass({ ...PASS, ports: p, claimLimit: 10 });
    assert.equal(p.emailCalls.n, 1, "the volume cap lets exactly one of the burst through");
    const skipped = await prisma.backgroundJob.findMany({
      where: {
        type: JobType.ALERT_MANAGER_PRINT_FAILED,
        payload: { path: ["testPrefix"], equals: PREFIX },
      },
    });
    const results = skipped.map((j) => j.result).sort();
    assert.deepEqual(results, ["SENT", "SKIPPED_VOLUME_CAP"].sort());
  });

  it("a retired SMS job drains as skipped instead of failing forever", async () => {
    // SPRINT-18. The SMS job types are still in the JobType enum (removing a PostgreSQL enum
    // value with live rows would need a migration), and rows enqueued before the removal are
    // still in the queue. They must reach a terminal state rather than dying on every pass.
    if (!dbAvailable) return;
    await cleanup();
    const orderId = await createOrder();
    const job = await enqueue(JobType.SMS_ORDER_CONFIRMATION, { orderId });
    const p = ports();
    const result = await runWorkerPass({ ...PASS, ports: p });
    assert.equal(result.succeeded, 1);
    assert.equal(p.emailCalls.n, 0, "a retired SMS job sends nothing at all");
    const row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.status, JobStatus.SUCCEEDED);
    assert.equal(row.result, "SKIPPED_SMS_REMOVED");
  });

  it("a dying manager alert does not enqueue another manager alert", async () => {
    if (!dbAvailable) return;
    await cleanup();
    const job = await enqueue(JobType.ALERT_MANAGER_JOB_DEAD, {
      deadJobId: "other",
      deadJobType: "SMS_ORDER_CONFIRMATION",
      orderId: "ord_x",
      lastError: "timeout",
      attemptCount: 5,
    });
    const throwing = createJobRegistry({
      ...JOB_HANDLERS,
      [JobType.ALERT_MANAGER_JOB_DEAD]: async () => {
        throw new PermanentJobError("alert channel down");
      },
    });
    await runWorkerPass({ ...PASS, registry: throwing, ports: ports() });
    const row = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.status, JobStatus.DEAD);
    const chain = await prisma.backgroundJob.count({
      where: { type: JobType.ALERT_MANAGER_JOB_DEAD, payload: { path: ["deadJobId"], equals: job.id } },
    });
    assert.equal(chain, 0);
  });
});
