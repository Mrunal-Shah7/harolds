// SPRINT-5: print job claim, completion, state machine, sweep, reprint — DB-backed, no printer
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: path.join(rootDir, ".env") });

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { JobType, OrderStatus, PaymentStatus, PrintJobStatus, PrintTarget } from "@harolds/types";
import { prisma } from "./client";
import {
  cancelQueuedPrintJob,
  cancelOrphanPrintJobs,
  claimNextPrintJob,
  IllegalPrintTransitionError,
  isLegalPrintTransition,
  printRetryBackoffMs,
  recordPrintCompletion,
  repairMissingPrintJobs,
  reportPrintQueue,
  reprintTicket,
  requeuePrintJob,
  sweepPrintJobs,
  touchPrinterHeartbeat,
} from "./print-jobs";

const SERIAL = "TEST-S5-PRINTER";
const PREFIX = "s5print-";
let sequence = 800_000;

async function cleanup(): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { clientIdempotencyKey: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = orders.map((o) => o.id);
  if (ids.length > 0) {
    await prisma.backgroundJob.deleteMany({
      where: {
        OR: ids.map((id) => ({ payload: { path: ["orderId"], equals: id } })),
      },
    });
  }
  await prisma.order.deleteMany({ where: { clientIdempotencyKey: { startsWith: PREFIX } } });
  await prisma.printerHeartbeat.deleteMany({ where: { printerSerial: SERIAL } });
}

const SWEEP: Parameters<typeof sweepPrintJobs>[0] = {
  sentTimeoutMs: 1_000,
  maxAttempts: 2,
  retryBackoffMs: 5_000,
  unacknowledgedOrderMs: 2_000,
};

async function paidOrder(opts?: { paidAt?: Date; withJobs?: boolean; payload?: string }) {
  const key = `${PREFIX}${Math.random().toString(16).slice(2)}`;
  const paidAt = opts?.paidAt ?? new Date();
  const order = await prisma.order.create({
    data: {
      orderNumber: `HC-S5-${key.slice(-4)}`,
      orderSequence: sequence++,
      businessDate: new Date("2099-01-01T00:00:00.000Z"),
      customerFirstName: "Test",
      customerLastName: "Print",
      customerPhone: "+17085550000",
      customerEmail: "s5print@example.com",
      subtotalCents: 29,
      taxCents: 3,
      tipCents: 0,
      totalCents: 32,
      taxRateBps: 1010,
      taxAppliedPreDiscount: true,
      paymentStatus: PaymentStatus.CAPTURED,
      status: OrderStatus.PAID,
      paidAt,
      lookupToken: key,
      clientIdempotencyKey: key,
      cartFingerprint: key,
      lines: {
        create: [
          {
            quantity: 1,
            itemName: "Fish & Chips",
            boardLabel: "FISH & CHIPS",
            unitPriceCents: 29,
            modifierTotalCents: 0,
            effectiveUnitPriceCents: 29,
            lineTotalCents: 29,
            selectedModifiers: [],
            customerNote: `a <b> & "c"`,
          },
        ],
      },
    },
    include: { lines: true },
  });

  if (opts?.withJobs === false) return order;

  const payload = opts?.payload ?? "<epos-print>stored</epos-print>";
  await prisma.printJob.createMany({
    data: [
      {
        orderId: order.id,
        target: PrintTarget.KITCHEN_TICKET,
        status: PrintJobStatus.QUEUED,
        payload,
        printerSerial: SERIAL,
        maxAttempts: 2,
      },
      {
        orderId: order.id,
        target: PrintTarget.COUNTER_RECEIPT,
        status: PrintJobStatus.QUEUED,
        payload: payload + "-counter",
        printerSerial: SERIAL,
        maxAttempts: 2,
      },
    ],
  });
  return order;
}

let dbAvailable = true;

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
  } catch (err) {
    dbAvailable = false;
    console.warn(`[print-jobs.test] skipping: ${(err as Error).message}`);
  }
});

after(async () => {
  if (dbAvailable) await cleanup();
});

describe("print job state machine", () => {
  it("lists only the permitted transitions", () => {
    assert.equal(isLegalPrintTransition("QUEUED", "SENT"), true);
    assert.equal(isLegalPrintTransition("SENT", "PRINTED"), true);
    assert.equal(isLegalPrintTransition("SENT", "FAILED"), true);
    assert.equal(isLegalPrintTransition("SENT", "QUEUED"), true);
    assert.equal(isLegalPrintTransition("FAILED", "QUEUED"), true);
    assert.equal(isLegalPrintTransition("FAILED", "CANCELLED"), true);
    assert.equal(isLegalPrintTransition("QUEUED", "CANCELLED"), true);
    assert.equal(isLegalPrintTransition("CANCELLED", "QUEUED"), true);
    assert.equal(isLegalPrintTransition("PRINTED", "QUEUED"), false);
    assert.equal(isLegalPrintTransition("PRINTED", "SENT"), false);
    assert.equal(isLegalPrintTransition("QUEUED", "PRINTED"), false);
    assert.equal(isLegalPrintTransition("CANCELLED", "PRINTED"), false);
  });
});

describe("claim + complete", () => {
  it("returns the oldest queued job, marks SENT, empty poll is a no-op", async () => {
    const order = await paidOrder();
    const first = await claimNextPrintJob(SERIAL);
    assert.ok(first);
    assert.equal(first.target, PrintTarget.KITCHEN_TICKET);
    assert.equal(first.status, PrintJobStatus.SENT);
    assert.ok(first.sentAt);

    const empty = await claimNextPrintJob("UNKNOWN-SERIAL");
    assert.equal(empty, null);

    const second = await claimNextPrintJob(SERIAL);
    assert.equal(second?.target, PrintTarget.COUNTER_RECEIPT);

    const none = await claimNextPrintJob(SERIAL);
    assert.equal(none, null);

    const kitchen = await prisma.printJob.findFirst({
      where: { orderId: order.id, target: PrintTarget.KITCHEN_TICKET },
    });
    assert.equal(kitchen?.status, PrintJobStatus.SENT);
  });

  it("never hands the same job to two concurrent polls", async () => {
    await paidOrder({ payload: "concurrent" });
    // One kitchen + one counter. Twenty callers; each job claimed at most once.
    const results = await Promise.all(Array.from({ length: 20 }, () => claimNextPrintJob(SERIAL)));
    const ids = results.filter(Boolean).map((j) => j!.id);
    assert.equal(ids.length, 2);
    assert.equal(new Set(ids).size, 2);
  });

  it("success completion sets printed + acknowledgedAt; duplicate is a no-op", async () => {
    await paidOrder();
    const job = await claimNextPrintJob(SERIAL);
    assert.ok(job);
    const r1 = await recordPrintCompletion({ printJobId: job.id, success: true, code: "" });
    assert.equal(r1.outcome, "PRINTED");
    const row = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.status, PrintJobStatus.PRINTED);
    assert.ok(row.acknowledgedAt);

    const r2 = await recordPrintCompletion({ printJobId: job.id, success: true, code: "" });
    assert.equal(r2.outcome, "DUPLICATE");
    const again = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(again.attemptCount, row.attemptCount);
    assert.equal(again.acknowledgedAt?.toISOString(), row.acknowledgedAt?.toISOString());
  });

  it("failure completion records the device code; unknown id is handled", async () => {
    await paidOrder();
    const job = await claimNextPrintJob(SERIAL);
    assert.ok(job);
    const r = await recordPrintCompletion({
      printJobId: job.id,
      success: false,
      code: "EPTR_COVER_OPEN",
    });
    assert.equal(r.outcome, "FAILED");
    const row = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.status, PrintJobStatus.FAILED);
    assert.match(row.lastError ?? "", /EPTR_COVER_OPEN/);

    const unknown = await recordPrintCompletion({
      printJobId: "does-not-exist-id-xxxx",
      success: true,
      code: "",
    });
    assert.equal(unknown.outcome, "UNKNOWN_JOB");
  });
});

describe("sweep / reprint / ops", () => {
  it("returns a sent-unacked job to queued after timeout, with backoff", async () => {
    await paidOrder();
    const job = await claimNextPrintJob(SERIAL);
    assert.ok(job);
    await prisma.printJob.update({
      where: { id: job.id },
      data: { sentAt: new Date(Date.now() - 60_000) },
    });
    const now = new Date();
    const first = await sweepPrintJobs({ ...SWEEP, now });
    assert.ok(first.requeued >= 1);
    const row = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.status, PrintJobStatus.QUEUED);
    assert.ok(row.runAfter.getTime() > now.getTime());

    const second = await sweepPrintJobs({ ...SWEEP, now });
    const row2 = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row2.status, PrintJobStatus.QUEUED);
    assert.equal(row2.runAfter.getTime(), row.runAfter.getTime());
    assert.ok(second.requeued === 0 || row2.status === PrintJobStatus.QUEUED);
  });

  it("cancels at the attempt ceiling and raises exactly one manager alert", async () => {
    await paidOrder();
    const job = await claimNextPrintJob(SERIAL);
    assert.ok(job);
    await prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: PrintJobStatus.FAILED,
        attemptCount: 2,
        maxAttempts: 2,
        lastError: "out of paper [EPTR_REC_EMPTY]",
      },
    });
    await sweepPrintJobs({ ...SWEEP, now: new Date() });
    const row = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.status, PrintJobStatus.CANCELLED);
    const alerts = await prisma.backgroundJob.findMany({
      where: {
        type: JobType.ALERT_MANAGER_PRINT_FAILED,
        payload: { path: ["printJobId"], equals: job.id },
      },
    });
    assert.equal(alerts.length, 1);
    await sweepPrintJobs({ ...SWEEP, now: new Date() });
    const alerts2 = await prisma.backgroundJob.findMany({
      where: {
        type: JobType.ALERT_MANAGER_PRINT_FAILED,
        payload: { path: ["printJobId"], equals: job.id },
      },
    });
    assert.equal(alerts2.length, 1);
  });

  it("raises an unacknowledged-order alert when a paid order is never collected", async () => {
    const order = await paidOrder({ paidAt: new Date(Date.now() - 10_000) });
    const r = await sweepPrintJobs({ ...SWEEP, now: new Date() });
    assert.ok(r.unacknowledgedAlerts >= 1);
    const alerts = await prisma.backgroundJob.findMany({
      where: {
        type: JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED,
        payload: { path: ["orderId"], equals: order.id },
      },
    });
    assert.equal(alerts.length, 1);
    await sweepPrintJobs({ ...SWEEP, now: new Date() });
    const alerts2 = await prisma.backgroundJob.findMany({
      where: {
        type: JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED,
        payload: { path: ["orderId"], equals: order.id },
      },
    });
    assert.equal(alerts2.length, 1);
  });

  it("reprint copies stored payload, marks reprint, leaves original untouched", async () => {
    const order = await paidOrder({ payload: "<epos-print>ORIGINAL-BYTES</epos-print>" });
    const original = await prisma.printJob.findFirstOrThrow({
      where: { orderId: order.id, target: PrintTarget.KITCHEN_TICKET },
    });
    await prisma.printJob.update({
      where: { id: original.id },
      data: { status: PrintJobStatus.PRINTED, sentAt: new Date(), acknowledgedAt: new Date() },
    });
    const copy = await reprintTicket(order.id, PrintTarget.KITCHEN_TICKET);
    assert.equal(copy.payload, original.payload);
    assert.equal(copy.isReprint, true);
    assert.equal(copy.status, PrintJobStatus.QUEUED);
    assert.notEqual(copy.id, original.id);
    const still = await prisma.printJob.findUniqueOrThrow({ where: { id: original.id } });
    assert.equal(still.status, PrintJobStatus.PRINTED);
    assert.equal(still.payload, "<epos-print>ORIGINAL-BYTES</epos-print>");
  });

  it("requeues a cancelled job with attempts reset; cancel queued works; repair creates jobs", async () => {
    const order = await paidOrder();
    const job = await prisma.printJob.findFirstOrThrow({
      where: { orderId: order.id, target: PrintTarget.KITCHEN_TICKET },
    });
    await cancelQueuedPrintJob(job.id);
    const cancelled = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(cancelled.status, PrintJobStatus.CANCELLED);

    const rq = await requeuePrintJob(job.id);
    assert.equal(rq.status, PrintJobStatus.QUEUED);
    assert.equal(rq.attemptCount, 0);

    const lonely = await paidOrder({ withJobs: false });
    const created = await repairMissingPrintJobs({
      orderId: lonely.id,
      kitchenSerial: SERIAL,
      counterSerial: SERIAL,
      maxAttempts: 5,
    });
    assert.equal(created.length, 2);
    assert.ok(created.every((j) => j.payload.length > 0));
  });

  it("queue report matches a known set and last-poll updates", async () => {
    await prisma.printJob.deleteMany({ where: { printerSerial: SERIAL } });
    await prisma.order.deleteMany({ where: { clientIdempotencyKey: { startsWith: PREFIX } } });
    await paidOrder();
    await touchPrinterHeartbeat(SERIAL, new Date("2026-08-09T19:00:00.000Z"));
    const mine = await prisma.printJob.groupBy({
      by: ["status"],
      where: { printerSerial: SERIAL },
      _count: { _all: true },
    });
    const queued = mine.find((g) => g.status === PrintJobStatus.QUEUED)?._count._all ?? 0;
    assert.equal(queued, 2);
    const report = await reportPrintQueue([SERIAL], new Date("2026-08-09T19:01:00.000Z"));
    assert.ok(report.counts.QUEUED >= 2);
    assert.ok(report.oldestQueuedAgeMs !== null);
    assert.equal(report.printers[0]?.serial, SERIAL);
    assert.equal(report.printers[0]?.lastPolledAt?.toISOString(), "2026-08-09T19:00:00.000Z");
  });

  it("backoff doubles with attempts", () => {
    assert.equal(printRetryBackoffMs(30_000, 1), 30_000);
    assert.equal(printRetryBackoffMs(30_000, 2), 60_000);
    assert.equal(printRetryBackoffMs(30_000, 3), 120_000);
  });

  it("rejects requeue of a printed job", async () => {
    const order = await paidOrder();
    const job = await prisma.printJob.findFirstOrThrow({
      where: { orderId: order.id, target: PrintTarget.KITCHEN_TICKET },
    });
    await prisma.printJob.update({
      where: { id: job.id },
      data: { status: PrintJobStatus.PRINTED, acknowledgedAt: new Date(), sentAt: new Date() },
    });
    await assert.rejects(() => requeuePrintJob(job.id), (err: unknown) => {
      assert.ok(err instanceof IllegalPrintTransitionError);
      return true;
    });
  });
});

describe("SPRINT-6 print → order status + orphan cancel", () => {
  async function markSent(orderId: string, target: PrintTarget) {
    const job = await prisma.printJob.findFirstOrThrow({
      where: { orderId, target },
    });
    return prisma.printJob.update({
      where: { id: job.id },
      data: { status: PrintJobStatus.SENT, sentAt: new Date() },
    });
  }

  it("kitchen ticket reaching printed stamps the order; counter receipt does not", async () => {
    if (!dbAvailable) return;
    const order = await paidOrder();
    const kitchen = await markSent(order.id, PrintTarget.KITCHEN_TICKET);
    await recordPrintCompletion({ printJobId: kitchen.id, success: true, code: "" });
    const afterKitchen = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(afterKitchen.status, OrderStatus.PRINTED);
    assert.ok(afterKitchen.printedAt);

    const counter = await markSent(order.id, PrintTarget.COUNTER_RECEIPT);
    const printedAt = afterKitchen.printedAt!.toISOString();
    await recordPrintCompletion({ printJobId: counter.id, success: true, code: "" });
    const afterCounter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(afterCounter.status, OrderStatus.PRINTED);
    assert.equal(afterCounter.printedAt?.toISOString(), printedAt);
  });

  it("counter receipt printed first leaves the order PAID", async () => {
    if (!dbAvailable) return;
    const order = await paidOrder();
    const counter = await markSent(order.id, PrintTarget.COUNTER_RECEIPT);
    await recordPrintCompletion({ printJobId: counter.id, success: true, code: "" });
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(row.status, OrderStatus.PAID);
    assert.equal(row.printedAt, null);
  });

  it("cancels queued jobs whose serial is not in the known set and does not delete them", async () => {
    if (!dbAvailable) return;
    const order = await paidOrder();
    await prisma.printJob.updateMany({
      where: { orderId: order.id },
      data: { printerSerial: "UNCONFIGURED" },
    });
    const result = await cancelOrphanPrintJobs([SERIAL]);
    assert.ok(result.cancelled >= 2);
    const jobs = await prisma.printJob.findMany({ where: { orderId: order.id } });
    assert.equal(jobs.length, 2);
    assert.ok(jobs.every((j) => j.status === PrintJobStatus.CANCELLED));
    assert.ok(jobs.every((j) => (j.lastError ?? "").includes("orphan")));
  });
});
