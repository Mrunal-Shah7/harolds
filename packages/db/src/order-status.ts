// SPRINT-6: order status transition table — the only place legal kitchen/print status changes are decided.
// SPRINT-7: SMS_ORDER_READY is enqueued in the same transaction as the READY transition.
import { JobStatus, JobType, OrderStatus } from "@harolds/types";
import { emitLog } from "@harolds/config";
import { prisma } from "./client";
import { AdminValidationError } from "./admin-menu";
import type { OrderStatus as DbOrderStatus, Prisma } from "./generated/prisma";

export class IllegalOrderTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
    public readonly orderId: string,
  ) {
    super(`Illegal order transition ${from} → ${to} for ${orderId}`);
    this.name = "IllegalOrderTransitionError";
  }
}

export class StaleOrderTransitionError extends Error {
  constructor(
    public readonly orderId: string,
    public readonly expected: OrderStatus,
    public readonly actual: OrderStatus,
  ) {
    super(`Stale order transition for ${orderId}: expected ${expected}, was ${actual}`);
    this.name = "StaleOrderTransitionError";
  }
}

/**
 * Complete legal table. Anything else is rejected.
 *
 * PAID → PRINTED is automatic (kitchen ticket printed), never a kitchen-display action.
 * PAID → IN_PROGRESS is allowed regardless of print outcome.
 * READY cannot go back to IN_PROGRESS. PICKED_UP cannot reverse on the KDS.
 */
export const ORDER_STATUS_ALLOWED: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.AWAITING_PAYMENT]: [],
  [OrderStatus.PAID]: [OrderStatus.PRINTED, OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
  [OrderStatus.PRINTED]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
  [OrderStatus.IN_PROGRESS]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.PICKED_UP],
  [OrderStatus.PICKED_UP]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REFUNDED]: [],
  [OrderStatus.ABANDONED]: [],
};

export const KDS_TARGET_STATUSES = [
  OrderStatus.IN_PROGRESS,
  OrderStatus.READY,
  OrderStatus.PICKED_UP,
  OrderStatus.CANCELLED,
] as const;

export type KdsTargetStatus = (typeof KDS_TARGET_STATUSES)[number];

export type OrderTransitionSource = "KITCHEN_TICKET_PRINTED" | "KDS" | "ADMIN_CORRECTION";

export function isLegalOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_STATUS_ALLOWED[from] ?? []).includes(to);
}

export function isKdsTargetStatus(value: string): value is KdsTargetStatus {
  return (KDS_TARGET_STATUSES as readonly string[]).includes(value);
}

function stampFor(to: OrderStatus, now: Date): Prisma.OrderUpdateManyMutationInput {
  switch (to) {
    case OrderStatus.PRINTED:
      return { printedAt: now };
    case OrderStatus.READY:
      return { readyAt: now };
    case OrderStatus.PICKED_UP:
      return { pickedUpAt: now };
    case OrderStatus.CANCELLED:
      return { cancelledAt: now };
    default:
      return {};
  }
}

export type ApplyOrderTransitionArgs = {
  orderId: string;
  to: OrderStatus;
  source: OrderTransitionSource;
  sessionId?: string | null;
  userId?: string | null;
  now?: Date;
  /**
   * SPRINT-7 test hook: runs inside the same transaction after the READY job is enqueued.
   * A throw here must roll the READY transition back.
   */
  afterWork?: (tx: Prisma.TransactionClient) => Promise<void>;
};

export type ApplyOrderTransitionResult = {
  from: OrderStatus;
  to: OrderStatus;
  orderId: string;
};

/**
 * Apply a legal transition only if the row is still in the expected prior status.
 * Concurrent advances: exactly one updateMany succeeds; the other gets StaleOrderTransitionError.
 */
export async function applyOrderTransition(
  args: ApplyOrderTransitionArgs,
): Promise<ApplyOrderTransitionResult> {
  const now = args.now ?? new Date();

  if (args.to === OrderStatus.PRINTED && args.source !== "KITCHEN_TICKET_PRINTED") {
    const order = await prisma.order.findUnique({ where: { id: args.orderId }, select: { status: true } });
    const from = (order?.status as OrderStatus | undefined) ?? OrderStatus.PAID;
    emitLog(
      "warn",
      "order.illegal_transition",
      { from, to: args.to, source: args.source },
      { scope: "kitchen", orderId: args.orderId },
    );
    throw new IllegalOrderTransitionError(from, args.to, args.orderId);
  }

  const current = await prisma.order.findUnique({
    where: { id: args.orderId },
    select: { id: true, status: true },
  });
  if (!current) {
    throw new IllegalOrderTransitionError(OrderStatus.PAID, args.to, args.orderId);
  }
  const from = current.status as OrderStatus;

  if (!isLegalOrderTransition(from, args.to)) {
    emitLog(
      "warn",
      "order.illegal_transition",
      { from, to: args.to, source: args.source },
      { scope: "kitchen", orderId: args.orderId },
    );
    throw new IllegalOrderTransitionError(from, args.to, args.orderId);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: args.orderId, status: from as DbOrderStatus },
        data: {
          status: args.to as DbOrderStatus,
          ...stampFor(args.to, now),
        },
      });

      if (updated.count !== 1) {
        throw new StaleOrderTransitionError(args.orderId, from, from);
      }

      await tx.orderStatusEvent.create({
        data: {
          orderId: args.orderId,
          fromStatus: from as DbOrderStatus,
          toStatus: args.to as DbOrderStatus,
          sessionId: args.sessionId ?? null,
          userId: args.userId ?? null,
          source: args.source,
        },
      });

      if (args.to === OrderStatus.READY) {
        await tx.backgroundJob.create({
          data: {
            type: JobType.SMS_ORDER_READY,
            status: JobStatus.PENDING,
            payload: { orderId: args.orderId },
            runAfter: now,
          },
        });
      }

      if (args.afterWork) {
        await args.afterWork(tx);
      }
    });
  } catch (err) {
    if (err instanceof StaleOrderTransitionError) {
      const again = await prisma.order.findUnique({
        where: { id: args.orderId },
        select: { status: true },
      });
      const actual = (again?.status as OrderStatus | undefined) ?? from;
      emitLog(
        "warn",
        "order.stale_transition",
        { from, to: args.to, actual },
        { scope: "kitchen", orderId: args.orderId },
      );
      throw new StaleOrderTransitionError(args.orderId, from, actual);
    }
    throw err;
  }

  return { from, to: args.to, orderId: args.orderId };
}

/**
 * Kitchen ticket reaching printed: PAID → PRINTED + printedAt.
 * No-op (and never a reversal) if the kitchen already advanced the order.
 */
export async function applyAutomaticPrintTransition(orderId: string, now = new Date()): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, orderNumber: true },
  });
  if (!order) return;
  if (order.status !== OrderStatus.PAID) {
    emitLog(
      "info",
      "order.print_status_kept",
      { status: order.status },
      { scope: "kitchen", orderId: order.id },
    );
    return;
  }
  try {
    await applyOrderTransition({
      orderId,
      to: OrderStatus.PRINTED,
      source: "KITCHEN_TICKET_PRINTED",
      now,
    });
  } catch (err) {
    if (err instanceof StaleOrderTransitionError || err instanceof IllegalOrderTransitionError) {
      emitLog(
        "info",
        "order.print_status_skipped",
        { message: err.message },
        { scope: "kitchen", orderId: order.id },
      );
      return;
    }
    throw err;
  }
}

export type ApplyAdminStatusCorrectionArgs = {
  orderId: string;
  to: OrderStatus;
  reason: string;
  sessionId: string;
  userId: string;
  now?: Date;
};

/**
 * SPRINT-8: manager/owner override of the one-directional kitchen table.
 * Distinct source ADMIN_CORRECTION. Does not enqueue SMS — a correction is not a
 * kitchen "ready" tap; retry the ready job from the dashboard if the customer
 * still needs a message.
 */
export async function applyAdminStatusCorrection(
  args: ApplyAdminStatusCorrectionArgs,
): Promise<ApplyOrderTransitionResult> {
  const now = args.now ?? new Date();
  const reason = args.reason.trim();
  if (reason.length < 3) {
    throw new AdminValidationError("A reason of at least 3 characters is required.");
  }

  const current = await prisma.order.findUnique({
    where: { id: args.orderId },
    select: { id: true, status: true },
  });
  if (!current) {
    throw new IllegalOrderTransitionError(OrderStatus.PAID, args.to, args.orderId);
  }
  const from = current.status as OrderStatus;
  if (from === args.to) {
    throw new AdminValidationError(`Order is already ${args.to}.`);
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: args.orderId, status: from as DbOrderStatus },
      data: {
        status: args.to as DbOrderStatus,
        ...stampFor(args.to, now),
      },
    });
    if (updated.count !== 1) {
      throw new StaleOrderTransitionError(args.orderId, from, from);
    }
    await tx.orderStatusEvent.create({
      data: {
        orderId: args.orderId,
        fromStatus: from as DbOrderStatus,
        toStatus: args.to as DbOrderStatus,
        sessionId: args.sessionId,
        userId: args.userId,
        source: "ADMIN_CORRECTION",
        reason,
      },
    });
  });

  return { from, to: args.to, orderId: args.orderId };
}
