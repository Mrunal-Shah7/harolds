// SPRINT-5: print job state machine, SDP claim, completion, sweep, reprint, queue report.
// Order-line snapshots are the only content source. Stored payload is immutable.
import {
  JobStatus,
  JobType,
  OrderStatus,
  PrintJobStatus,
  PrintTarget,
  type SelectedModifierSnapshot,
} from "@harolds/types";
import {
  buildCounterReceipt,
  buildKitchenTicket,
  formatLastError,
  renderEposPrintXml,
  type TicketOrderInput,
} from "@harolds/print";
import { emitLog } from "@harolds/config";
import { prisma } from "./client";
import { getStoreConfig } from "./store-config";
import type { Order, OrderLine, PrintJob, Prisma } from "./generated/prisma";
import { applyAutomaticPrintTransition } from "./order-status";

export class IllegalPrintTransitionError extends Error {
  constructor(
    public readonly from: PrintJobStatus,
    public readonly to: PrintJobStatus,
    public readonly jobId: string,
  ) {
    super(`Illegal print-job transition ${from} → ${to} for ${jobId}`);
    this.name = "IllegalPrintTransitionError";
  }
}

const ALLOWED: Record<PrintJobStatus, readonly PrintJobStatus[]> = {
  QUEUED: [PrintJobStatus.SENT, PrintJobStatus.CANCELLED],
  SENT: [PrintJobStatus.PRINTED, PrintJobStatus.FAILED, PrintJobStatus.QUEUED],
  FAILED: [PrintJobStatus.QUEUED, PrintJobStatus.CANCELLED],
  CANCELLED: [PrintJobStatus.QUEUED],
  PRINTED: [],
};

export function isLegalPrintTransition(from: PrintJobStatus, to: PrintJobStatus): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

function assertLegal(job: { id: string; status: string }, to: PrintJobStatus): void {
  const from = job.status as PrintJobStatus;
  if (!isLegalPrintTransition(from, to)) {
    emitLog("warn", "print.illegal_transition", { from, to, jobId: job.id }, { scope: "print" });
    throw new IllegalPrintTransitionError(from, to, job.id);
  }
}

export type PrintSweepConfig = {
  sentTimeoutMs: number;
  maxAttempts: number;
  retryBackoffMs: number;
  unacknowledgedOrderMs: number;
  now?: Date;
};

export function printRetryBackoffMs(baseMs: number, attemptCount: number): number {
  const exp = Math.min(Math.max(attemptCount, 1) - 1, 4);
  return baseMs * 2 ** exp;
}

function modifiersOf(line: OrderLine): SelectedModifierSnapshot[] {
  const raw = line.selectedModifiers;
  if (!Array.isArray(raw)) return [];
  return raw as unknown as SelectedModifierSnapshot[];
}

export function toTicketOrderInput(
  order: Order & { lines: OrderLine[] },
  store: { timezone: string; storeName: string },
): TicketOrderInput {
  return {
    orderNumber: order.orderNumber ?? "UNNUMBERED",
    paidAt: order.paidAt ?? order.createdAt,
    timeZone: store.timezone,
    storeName: store.storeName,
    customerFirstName: order.customerFirstName,
    customerLastName: order.customerLastName,
    paymentStatus: order.paymentStatus,
    cardLast4: order.cardLast4,
    subtotalCents: order.subtotalCents,
    taxCents: order.taxCents,
    tipCents: order.tipCents,
    totalCents: order.totalCents,
    lines: order.lines.map((line) => ({
      quantity: line.quantity,
      itemName: line.itemName,
      boardLabel: line.boardLabel,
      customerNote: line.customerNote,
      selectedModifiers: modifiersOf(line).map((m) => ({ optionName: m.optionName })),
    })),
  };
}

export function renderPayloadsForOrder(
  order: Order & { lines: OrderLine[] },
  store: { timezone: string; storeName: string },
): { kitchen: string; counter: string } {
  const input = toTicketOrderInput(order, store);
  return {
    kitchen: renderEposPrintXml(buildKitchenTicket(input)),
    counter: renderEposPrintXml(buildCounterReceipt(input)),
  };
}

type ClaimedJobRow = {
  id: string;
  orderId: string;
  target: PrintTarget;
  status: PrintJobStatus;
  payload: string;
  printerSerial: string;
  attemptCount: number;
  maxAttempts: number;
  sentAt: Date | null;
  acknowledgedAt: Date | null;
  lastError: string | null;
  isReprint: boolean;
  runAfter: Date;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Atomically select the oldest queued job for this printer (kitchen before counter)
 * and mark it SENT. Concurrent polls cannot receive the same job (SKIP LOCKED).
 */
export async function claimNextPrintJob(printerSerial: string, now = new Date()): Promise<PrintJob | null> {
  const rows = await prisma.$queryRaw<ClaimedJobRow[]>`
    UPDATE "PrintJob" AS j
    SET
      status = 'SENT'::"PrintJobStatus",
      "sentAt" = ${now},
      "attemptCount" = j."attemptCount" + 1,
      "updatedAt" = ${now}
    WHERE j.id = (
      SELECT p.id
      FROM "PrintJob" p
      WHERE p.status = 'QUEUED'::"PrintJobStatus"
        AND p."printerSerial" = ${printerSerial}
        AND p."runAfter" <= ${now}
      ORDER BY
        CASE p.target WHEN 'KITCHEN_TICKET'::"PrintTarget" THEN 0 ELSE 1 END,
        p."createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      j.id, j."orderId", j.target, j.status, j.payload, j."printerSerial",
      j."attemptCount", j."maxAttempts", j."sentAt", j."acknowledgedAt",
      j."lastError", j."isReprint", j."runAfter", j."createdAt", j."updatedAt"
  `;
  const row = rows[0];
  if (!row) return null;

  if (row.payload.length === 0) {
    const filled = await fillEmptyPayload(row.id);
    if (filled) return filled;
  }
  return row as unknown as PrintJob;
}

async function fillEmptyPayload(jobId: string): Promise<PrintJob | null> {
  const job = await prisma.printJob.findUnique({
    where: { id: jobId },
    include: { order: { include: { lines: true } } },
  });
  if (!job) return null;
  const store = await getStoreConfig();
  const payloads = renderPayloadsForOrder(job.order, store);
  const payload = job.target === PrintTarget.KITCHEN_TICKET ? payloads.kitchen : payloads.counter;
  return prisma.printJob.update({ where: { id: jobId }, data: { payload } });
}

export async function touchPrinterHeartbeat(printerSerial: string, now = new Date()): Promise<void> {
  await prisma.printerHeartbeat.upsert({
    where: { printerSerial },
    create: { printerSerial, lastPolledAt: now },
    update: { lastPolledAt: now },
  });
}

export type CompletionResult =
  | { outcome: "PRINTED" | "FAILED" }
  | { outcome: "UNKNOWN_JOB" }
  | { outcome: "DUPLICATE" }
  | { outcome: "IGNORED"; reason: string };

/**
 * Record the printer's acknowledgement. Duplicate success reports for an already-printed
 * job do not change state or increment attempts.
 */
export async function recordPrintCompletion(args: {
  printJobId: string;
  success: boolean;
  code: string;
  now?: Date;
}): Promise<CompletionResult> {
  const now = args.now ?? new Date();
  const job = await prisma.printJob.findUnique({ where: { id: args.printJobId } });
  if (!job) {
    emitLog("warn", "print.unknown_job", { printJobId: args.printJobId }, { scope: "print" });
    return { outcome: "UNKNOWN_JOB" };
  }

  if (job.status === PrintJobStatus.PRINTED) {
    return { outcome: "DUPLICATE" };
  }

  if (args.success) {
    if (job.status !== PrintJobStatus.SENT) {
      emitLog("warn", "print.success_ignored", { status: job.status, jobId: job.id }, { scope: "print" });
      return { outcome: "IGNORED", reason: `status ${job.status}` };
    }
    assertLegal(job, PrintJobStatus.PRINTED);
    await prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: PrintJobStatus.PRINTED,
        acknowledgedAt: now,
        lastError: null,
      },
    });
    // SPRINT-6: kitchen ticket printed → order PAID→PRINTED. Counter receipt does not.
    if (job.target === PrintTarget.KITCHEN_TICKET) {
      await applyAutomaticPrintTransition(job.orderId, now);
    }
    return { outcome: "PRINTED" };
  }

  if (job.status !== PrintJobStatus.SENT) {
      emitLog("warn", "print.failure_ignored", { status: job.status, jobId: job.id }, { scope: "print" });
    return { outcome: "IGNORED", reason: `status ${job.status}` };
  }
  assertLegal(job, PrintJobStatus.FAILED);
  await prisma.printJob.update({
    where: { id: job.id },
    data: {
      status: PrintJobStatus.FAILED,
      lastError: formatLastError(args.code),
    },
  });
  return { outcome: "FAILED" };
}

async function raisePrintFailedAlert(job: PrintJob, orderNumber: string | null): Promise<void> {
  const existing = await prisma.backgroundJob.findFirst({
    where: {
      type: JobType.ALERT_MANAGER_PRINT_FAILED,
      payload: { path: ["printJobId"], equals: job.id },
    },
  });
  if (existing) return;
  await prisma.backgroundJob.create({
    data: {
      type: JobType.ALERT_MANAGER_PRINT_FAILED,
      status: JobStatus.PENDING,
      payload: {
        printJobId: job.id,
        orderId: job.orderId,
        orderNumber,
        target: job.target,
        lastError: job.lastError,
        printerSerial: job.printerSerial,
      } as Prisma.InputJsonValue,
    },
  });
}

async function raiseUnacknowledgedAlert(orderId: string, orderNumber: string | null): Promise<void> {
  const existing = await prisma.backgroundJob.findFirst({
    where: {
      type: JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED,
      payload: { path: ["orderId"], equals: orderId },
    },
  });
  if (existing) return;
  await prisma.backgroundJob.create({
    data: {
      type: JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED,
      status: JobStatus.PENDING,
      payload: {
        orderId,
        orderNumber,
        reason: "Paid order has print jobs that never reached PRINTED (printer may be off).",
      } as Prisma.InputJsonValue,
    },
  });
}

export type SweepResult = {
  requeued: number;
  cancelled: number;
  unacknowledgedAlerts: number;
};

export async function sweepPrintJobs(config: PrintSweepConfig): Promise<SweepResult> {
  const now = config.now ?? new Date();
  let requeued = 0;
  let cancelled = 0;
  let unacknowledgedAlerts = 0;

  const sentStale = await prisma.printJob.findMany({
    where: {
      status: PrintJobStatus.SENT,
      sentAt: { lte: new Date(now.getTime() - config.sentTimeoutMs) },
      acknowledgedAt: null,
    },
  });

  for (const job of sentStale) {
    if (job.attemptCount >= job.maxAttempts) {
      assertLegal(job, PrintJobStatus.CANCELLED);
      const updated = await prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: PrintJobStatus.CANCELLED,
          lastError: job.lastError ?? "sent but never acknowledged — attempt ceiling reached",
        },
      });
      const order = await prisma.order.findUnique({ where: { id: job.orderId }, select: { orderNumber: true } });
      await raisePrintFailedAlert(updated, order?.orderNumber ?? null);
      cancelled += 1;
      continue;
    }
    assertLegal(job, PrintJobStatus.QUEUED);
    await prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: PrintJobStatus.QUEUED,
        sentAt: null,
        runAfter: new Date(now.getTime() + printRetryBackoffMs(config.retryBackoffMs, job.attemptCount)),
        lastError: job.lastError ?? "sent but never acknowledged",
      },
    });
    requeued += 1;
  }

  const failed = await prisma.printJob.findMany({
    where: { status: PrintJobStatus.FAILED },
  });

  for (const job of failed) {
    if (job.attemptCount >= job.maxAttempts) {
      assertLegal(job, PrintJobStatus.CANCELLED);
      const updated = await prisma.printJob.update({
        where: { id: job.id },
        data: { status: PrintJobStatus.CANCELLED },
      });
      const order = await prisma.order.findUnique({ where: { id: job.orderId }, select: { orderNumber: true } });
      await raisePrintFailedAlert(updated, order?.orderNumber ?? null);
      cancelled += 1;
      continue;
    }
    const due = new Date(job.updatedAt.getTime() + printRetryBackoffMs(config.retryBackoffMs, job.attemptCount));
    if (due > now) continue;
    assertLegal(job, PrintJobStatus.QUEUED);
    await prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: PrintJobStatus.QUEUED,
        sentAt: null,
        runAfter: now,
      },
    });
    requeued += 1;
  }

  const windowStart = new Date(now.getTime() - config.unacknowledgedOrderMs);
  const stalePaid = await prisma.order.findMany({
    where: {
      status: OrderStatus.PAID,
      paidAt: { lte: windowStart },
      printJobs: { some: { status: { not: PrintJobStatus.PRINTED } } },
    },
    select: { id: true, orderNumber: true },
  });

  for (const order of stalePaid) {
    const before = await prisma.backgroundJob.count({
      where: {
        type: JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED,
        payload: { path: ["orderId"], equals: order.id },
      },
    });
    await raiseUnacknowledgedAlert(order.id, order.orderNumber);
    const after = await prisma.backgroundJob.count({
      where: {
        type: JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED,
        payload: { path: ["orderId"], equals: order.id },
      },
    });
    if (after > before) unacknowledgedAlerts += 1;
  }

  return { requeued, cancelled, unacknowledgedAlerts };
}

export async function reprintTicket(orderId: string, target: PrintTarget): Promise<PrintJob> {
  const original = await prisma.printJob.findFirst({
    where: { orderId, target, payload: { not: "" }, isReprint: false },
    orderBy: { createdAt: "asc" },
  });
  if (!original) {
    throw new Error(`No stored payload to reprint for order ${orderId} target ${target}`);
  }
  return prisma.printJob.create({
    data: {
      orderId,
      target,
      status: PrintJobStatus.QUEUED,
      payload: original.payload,
      printerSerial: original.printerSerial,
      isReprint: true,
      maxAttempts: original.maxAttempts,
    },
  });
}

export async function requeuePrintJob(jobId: string): Promise<PrintJob> {
  const job = await prisma.printJob.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status !== PrintJobStatus.FAILED && job.status !== PrintJobStatus.CANCELLED) {
    throw new IllegalPrintTransitionError(job.status as PrintJobStatus, PrintJobStatus.QUEUED, job.id);
  }
  assertLegal(job, PrintJobStatus.QUEUED);
  return prisma.printJob.update({
    where: { id: job.id },
    data: {
      status: PrintJobStatus.QUEUED,
      attemptCount: 0,
      sentAt: null,
      acknowledgedAt: null,
      lastError: null,
      runAfter: new Date(),
    },
  });
}

export async function cancelQueuedPrintJob(
  jobId: string,
  reason = "cancelled manually",
): Promise<PrintJob> {
  const job = await prisma.printJob.findUniqueOrThrow({ where: { id: jobId } });
  assertLegal(job, PrintJobStatus.CANCELLED);
  return prisma.printJob.update({
    where: { id: job.id },
    data: { status: PrintJobStatus.CANCELLED, lastError: reason },
  });
}

const ORPHAN_REASON = "cancelled: printer serial not in current configuration (Sprint 6 orphan cleanup)";

/**
 * Cancel jobs addressed to serials that will never poll. Does not delete rows.
 * QUEUED → CANCELLED via the Sprint 5 cancel path. SENT walks SENT→FAILED→CANCELLED
 * (SENT→CANCELLED is not in the print table). FAILED → CANCELLED. PRINTED is left alone.
 */
export async function cancelOrphanPrintJobs(
  knownSerials: string[],
): Promise<{ cancelled: number; skipped: number }> {
  const known = new Set(knownSerials.map((s) => s.trim()).filter(Boolean));
  const jobs = await prisma.printJob.findMany({
    where: {
      status: { in: [PrintJobStatus.QUEUED, PrintJobStatus.SENT, PrintJobStatus.FAILED] },
    },
  });

  let cancelled = 0;
  let skipped = 0;
  for (const job of jobs) {
    if (known.has(job.printerSerial)) {
      skipped += 1;
      continue;
    }
    if (job.status === PrintJobStatus.QUEUED) {
      await cancelQueuedPrintJob(job.id, ORPHAN_REASON);
      cancelled += 1;
      continue;
    }
    if (job.status === PrintJobStatus.SENT) {
      assertLegal(job, PrintJobStatus.FAILED);
      const failed = await prisma.printJob.update({
        where: { id: job.id },
        data: { status: PrintJobStatus.FAILED, lastError: ORPHAN_REASON },
      });
      assertLegal(failed, PrintJobStatus.CANCELLED);
      await prisma.printJob.update({
        where: { id: failed.id },
        data: { status: PrintJobStatus.CANCELLED, lastError: ORPHAN_REASON },
      });
      cancelled += 1;
      continue;
    }
    if (job.status === PrintJobStatus.FAILED) {
      assertLegal(job, PrintJobStatus.CANCELLED);
      await prisma.printJob.update({
        where: { id: job.id },
        data: { status: PrintJobStatus.CANCELLED, lastError: ORPHAN_REASON },
      });
      cancelled += 1;
    }
  }
  return { cancelled, skipped };
}

export async function repairMissingPrintJobs(args: {
  orderId: string;
  kitchenSerial: string;
  counterSerial: string;
  maxAttempts: number;
}): Promise<PrintJob[]> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: args.orderId },
    include: { lines: true, printJobs: true },
  });
  if (order.status !== OrderStatus.PAID) {
    throw new Error("Repair path is only for paid orders.");
  }
  if (order.printJobs.length > 0) {
    return order.printJobs;
  }
  const store = await getStoreConfig();
  const payloads = renderPayloadsForOrder(order, store);
  await prisma.printJob.createMany({
    data: [
      {
        orderId: order.id,
        target: PrintTarget.KITCHEN_TICKET,
        status: PrintJobStatus.QUEUED,
        payload: payloads.kitchen,
        printerSerial: args.kitchenSerial,
        maxAttempts: args.maxAttempts,
      },
      {
        orderId: order.id,
        target: PrintTarget.COUNTER_RECEIPT,
        status: PrintJobStatus.QUEUED,
        payload: payloads.counter,
        printerSerial: args.counterSerial,
        maxAttempts: args.maxAttempts,
      },
    ],
  });
  return prisma.printJob.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
}

export type PrintQueueReport = {
  counts: Record<PrintJobStatus, number>;
  oldestQueuedAgeMs: number | null;
  printers: Array<{ serial: string; lastPolledAt: Date | null }>;
};

export async function reportPrintQueue(configuredSerials: string[], now = new Date()): Promise<PrintQueueReport> {
  const groups = await prisma.printJob.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const counts: Record<PrintJobStatus, number> = {
    QUEUED: 0,
    SENT: 0,
    PRINTED: 0,
    FAILED: 0,
    CANCELLED: 0,
  };
  for (const g of groups) {
    counts[g.status as PrintJobStatus] = g._count._all;
  }
  const oldest = await prisma.printJob.findFirst({
    where: { status: PrintJobStatus.QUEUED },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const hearts = await prisma.printerHeartbeat.findMany({
    where: { printerSerial: { in: configuredSerials } },
  });
  const bySerial = new Map(hearts.map((h) => [h.printerSerial, h.lastPolledAt]));
  return {
    counts,
    oldestQueuedAgeMs: oldest ? now.getTime() - oldest.createdAt.getTime() : null,
    printers: configuredSerials.map((serial) => ({
      serial,
      lastPolledAt: bySerial.get(serial) ?? null,
    })),
  };
}
