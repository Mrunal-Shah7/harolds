// SPRINT-4: orphan detection — DB reads + optional manager alerts; Square lookups injected by caller
import { prisma } from "./client";
import { JobType, JobStatus, OrderStatus, PaymentStatus } from "@harolds/types";

export type ReconcileFinding = {
  kind:
    | "ORPHAN_SQUARE_PAYMENT"
    | "STUCK_AWAITING_PAYMENT"
    | "AMOUNT_MISMATCH"
    | "ORPHAN_SQUARE_REFUND";
  orderId: string | null;
  processorPaymentId: string | null;
  orderTotalCents: number | null;
  squareAmountCents: number | null;
  detail: string;
};

export type SquarePaymentProbe = {
  status: string;
  amountCents: number;
};

/**
 * Report discrepancies. `probePayment` is injected so this module never imports Square.
 * When `enqueueAlerts` is true, inserts manager alert jobs for money findings only.
 */
export async function runReconciliation(args: {
  since: Date;
  until: Date;
  enqueueAlerts?: boolean;
  probePayment: (paymentId: string) => Promise<SquarePaymentProbe | null>;
}): Promise<ReconcileFinding[]> {
  const findings: ReconcileFinding[] = [];

  const awaiting = await prisma.order.findMany({
    where: {
      createdAt: { gte: args.since, lte: args.until },
      status: OrderStatus.AWAITING_PAYMENT,
      paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.UNKNOWN] },
    },
    select: {
      id: true,
      totalCents: true,
      processorPaymentId: true,
      paymentStatus: true,
    },
  });

  for (const o of awaiting) {
    findings.push({
      kind: "STUCK_AWAITING_PAYMENT",
      orderId: o.id,
      processorPaymentId: o.processorPaymentId,
      orderTotalCents: o.totalCents,
      squareAmountCents: null,
      detail: o.processorPaymentId
        ? `Awaiting payment with payment id recorded (status=${o.paymentStatus})`
        : `Awaiting payment with no payment id (status=${o.paymentStatus})`,
    });

    if (o.processorPaymentId) {
      try {
        const payment = await args.probePayment(o.processorPaymentId);
        if (payment && (payment.status === "completed" || payment.status === "approved")) {
          if (payment.amountCents !== o.totalCents) {
            findings.push({
              kind: "AMOUNT_MISMATCH",
              orderId: o.id,
              processorPaymentId: o.processorPaymentId,
              orderTotalCents: o.totalCents,
              squareAmountCents: payment.amountCents,
              detail: "Square completed amount differs from order total",
            });
          } else {
            findings.push({
              kind: "ORPHAN_SQUARE_PAYMENT",
              orderId: o.id,
              processorPaymentId: o.processorPaymentId,
              orderTotalCents: o.totalCents,
              squareAmountCents: payment.amountCents,
              detail: "Square payment completed but local order not marked PAID",
            });
          }
        }
      } catch {
        // leave stuck finding only
      }
    }
  }

  const paid = await prisma.order.findMany({
    where: {
      createdAt: { gte: args.since, lte: args.until },
      status: OrderStatus.PAID,
      processorPaymentId: { not: null },
    },
    select: { id: true, totalCents: true, processorPaymentId: true },
  });

  for (const o of paid) {
    if (!o.processorPaymentId) continue;
    try {
      const payment = await args.probePayment(o.processorPaymentId);
      if (payment && payment.amountCents !== o.totalCents) {
        findings.push({
          kind: "AMOUNT_MISMATCH",
          orderId: o.id,
          processorPaymentId: o.processorPaymentId,
          orderTotalCents: o.totalCents,
          squareAmountCents: payment.amountCents,
          detail: "Paid order total does not match Square captured amount",
        });
      }
    } catch {
      // skip
    }
  }

  if (args.enqueueAlerts) {
    for (const f of findings) {
      if (f.kind === "STUCK_AWAITING_PAYMENT" && !f.processorPaymentId) continue;
      await prisma.backgroundJob.create({
        data: {
          type: JobType.ALERT_MANAGER_PAYMENT_DISCREPANCY,
          status: JobStatus.PENDING,
          payload: f,
        },
      });
    }
  }

  return findings;
}

export async function sweepAbandonedOrders(olderThanMinutes: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const result = await prisma.order.updateMany({
    where: {
      status: OrderStatus.AWAITING_PAYMENT,
      processorPaymentId: null,
      createdAt: { lt: cutoff },
    },
    data: {
      status: OrderStatus.ABANDONED,
      cancelledAt: new Date(),
    },
  });
  return result.count;
}
