// SPRINT-8: operations snapshot — printer, jobs, today's orders, store state from existing reports.
import { DateTime } from "luxon";
import { OrderStatus } from "@harolds/types";
import { prisma } from "./client";
import { reportPrintQueue } from "./print-jobs";
import { reportBackgroundJobs } from "./jobs";
import { listKitchenQueue, KITCHEN_QUEUE_STATUSES } from "./kitchen-queue";
import { getStoreStatus } from "./repositories/store";
import { getStoreConfig } from "./store-config";
import { todayRange } from "./admin-orders";
import { getLatestReconciliationRun } from "./scheduled-reconcile";

export async function getOperationsSnapshot(args: {
  printerSerials: string[];
  deadAlertThreshold: number;
  unackAlertMs: number;
  timeZone: string;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const range = todayRange(args.timeZone, now);

  const [print, jobs, queue, store, config, todayGroups, unacked, lastReconcile] = await Promise.all([
    reportPrintQueue(args.printerSerials, now),
    reportBackgroundJobs({ now, deadAlertThreshold: args.deadAlertThreshold }),
    listKitchenQueue(),
    getStoreStatus(now),
    getStoreConfig(),
    prisma.order.groupBy({
      by: ["status"],
      where: { createdAt: { gte: range.from, lt: range.to } },
      _count: { _all: true },
    }),
    prisma.order.count({
      where: {
        status: { in: [OrderStatus.PAID, OrderStatus.PRINTED] },
        paidAt: { lte: new Date(now.getTime() - args.unackAlertMs) },
      },
    }),
    getLatestReconciliationRun(),
  ]);

  const countsByStatus: Record<string, number> = {};
  for (const status of Object.values(OrderStatus)) countsByStatus[status] = 0;
  for (const row of todayGroups) {
    countsByStatus[row.status] = row._count._all;
  }

  const stalePrinters = print.printers.map((p) => ({
    serial: p.serial,
    lastPolledAt: p.lastPolledAt?.toISOString() ?? null,
    stale:
      !p.lastPolledAt || now.getTime() - p.lastPolledAt.getTime() > 120_000,
    ageMs: p.lastPolledAt ? now.getTime() - p.lastPolledAt.getTime() : null,
  }));

  return {
    generatedAt: now.toISOString(),
    generatedAtLocal: DateTime.fromJSDate(now, { zone: "utc" }).setZone(args.timeZone).toFormat("ccc LLL d, yyyy h:mm a ZZZZ"),
    store: {
      isOpen: store.isOpen,
      acceptingOrders: store.acceptingOrders,
      prepMinutes: store.prepMinutes,
      isBusy: config.isBusy,
      timezone: store.timezone,
      estimatedReadyAt: store.estimatedReadyAt,
    },
    print: {
      counts: print.counts,
      oldestQueuedAgeMs: print.oldestQueuedAgeMs,
      printers: stalePrinters,
    },
    jobs: {
      counts: jobs.counts,
      countsByType: jobs.countsByType,
      oldestPendingAgeMs: jobs.oldestPendingAgeMs,
      deadCount: jobs.deadCount,
      deadJobsAboveThreshold: jobs.deadJobsAboveThreshold,
      deadAlertThreshold: jobs.deadAlertThreshold,
      recentErrors: jobs.recentErrors.map((e) => ({
        id: e.id,
        type: e.type,
        status: e.status,
        lastError: e.lastError,
        updatedAt: e.updatedAt.toISOString(),
      })),
    },
    today: {
      countsByStatus,
      unacknowledgedPastThreshold: unacked,
      liveQueueCount: queue.length,
      liveQueueStatuses: KITCHEN_QUEUE_STATUSES,
    },
    reconciliation: {
      lastRunAt: lastReconcile?.ranAt ?? null,
      lastBusinessDate: lastReconcile?.businessDate ?? null,
      lastFindingCount: lastReconcile?.findingCount ?? null,
      lastFindings: lastReconcile?.findings ?? [],
      overdue: !lastReconcile || now.getTime() - new Date(lastReconcile.ranAt).getTime() > 26 * 3600_000,
    },
  };
}
