// SPRINT-6: enqueue ALERT_MANAGER_ORDER_UNACKNOWLEDGED exactly once per qualifying order.
import { JobStatus, JobType, OrderStatus } from "@harolds/types";
import { prisma } from "./client";
import type { Prisma } from "./generated/prisma";

/** Paid or printed, not yet started by the kitchen — independent of print-job outcome. */
const UNACKED_STATUSES = [OrderStatus.PAID, OrderStatus.PRINTED] as const;

export async function hasUnacknowledgedOrderAlert(orderId: string): Promise<boolean> {
  const existing = await prisma.backgroundJob.findFirst({
    where: {
      type: JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED,
      payload: { path: ["orderId"], equals: orderId },
    },
    select: { id: true },
  });
  return existing !== null;
}

export async function enqueueUnacknowledgedOrderAlert(args: {
  orderId: string;
  orderNumber: string | null;
  reason: string;
}): Promise<boolean> {
  if (await hasUnacknowledgedOrderAlert(args.orderId)) return false;
  await prisma.backgroundJob.create({
    data: {
      type: JobType.ALERT_MANAGER_ORDER_UNACKNOWLEDGED,
      status: JobStatus.PENDING,
      payload: {
        orderId: args.orderId,
        orderNumber: args.orderNumber,
        reason: args.reason,
      } as Prisma.InputJsonValue,
    },
  });
  return true;
}

/**
 * Any order still in PAID/PRINTED past the threshold gets exactly one manager alert.
 * Shares the Sprint 5 job type and the same orderId payload path, so a print-driven
 * alert already on the row suppresses a duplicate from this sweep.
 */
export async function enqueueUnacknowledgedKitchenAlerts(args: {
  thresholdMs: number;
  now?: Date;
}): Promise<number> {
  const now = args.now ?? new Date();
  const cutoff = new Date(now.getTime() - args.thresholdMs);
  const stale = await prisma.order.findMany({
    where: {
      status: { in: [...UNACKED_STATUSES] },
      paidAt: { lte: cutoff },
    },
    select: { id: true, orderNumber: true },
  });

  let inserted = 0;
  for (const order of stale) {
    const created = await enqueueUnacknowledgedOrderAlert({
      orderId: order.id,
      orderNumber: order.orderNumber,
      reason: "Paid order has not been moved to in progress (kitchen unacknowledged).",
    });
    if (created) inserted += 1;
  }
  return inserted;
}
