// SPRINT-4: orphan detection — DB reads + optional manager alerts; gateway lookups injected by caller
import { prisma } from "./client";
import { JobType, JobStatus, OrderStatus, PaymentStatus } from "@harolds/types";

export type ReconcileFinding = {
  kind:
    | "ORPHAN_GATEWAY_PAYMENT"
    | "STUCK_AWAITING_PAYMENT"
    | "AMOUNT_MISMATCH"
    | "ORPHAN_GATEWAY_REFUND";
  orderId: string | null;
  processorPaymentId: string | null;
  orderTotalCents: number | null;
  gatewayAmountCents: number | null;
  detail: string;
};

export type GatewayPaymentProbe = {
  status: string;
  amountCents: number;
};

/**
 * Report discrepancies. `probePayment` is injected so this module never imports the gateway.
 * When `enqueueAlerts` is true, inserts manager alert jobs for money findings only.
 */
export async function runReconciliation(args: {
  since: Date;
  until: Date;
  enqueueAlerts?: boolean;
  probePayment: (paymentId: string) => Promise<GatewayPaymentProbe | null>;
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
      gatewayAmountCents: null,
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
              gatewayAmountCents: payment.amountCents,
              detail: "Gateway completed amount differs from order total",
            });
          } else {
            findings.push({
              kind: "ORPHAN_GATEWAY_PAYMENT",
              orderId: o.id,
              processorPaymentId: o.processorPaymentId,
              orderTotalCents: o.totalCents,
              gatewayAmountCents: payment.amountCents,
              detail: "Gateway payment completed but local order not marked PAID",
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
          gatewayAmountCents: payment.amountCents,
          detail: "Paid order total does not match the gateway captured amount",
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
      // SPRINT-17: never abandon an order that still holds a charge claim. A claim with no
      // payment id means an attempt was interrupted before its outcome was recorded, and
      // whether money moved is unknown until the gateway is asked. Writing it off as abandoned
      // would hide a real charge. `findStrandedChargeClaims` surfaces these instead.
      chargeClaimedAt: null,
      createdAt: { lt: cutoff },
    },
    data: {
      status: OrderStatus.ABANDONED,
      cancelledAt: new Date(),
    },
  });
  return result.count;
}

/**
 * Orders whose charge claim outlived the request that took it.
 *
 * SPRINT-17. Each of these had a sale sent to the gateway, or possibly sent, with no outcome
 * recorded — so each may represent money taken from a customer for an order the kitchen never
 * saw. They are reported, never auto-resolved here: settling one requires asking the gateway
 * for a sale against the order id, which this module deliberately cannot do.
 */
export async function findStrandedChargeClaims(olderThanMs: number): Promise<
  Array<{ id: string; totalCents: number; chargeClaimedAt: Date | null; paymentStatus: string }>
> {
  const cutoff = new Date(Date.now() - olderThanMs);
  return prisma.order.findMany({
    where: {
      processorPaymentId: null,
      chargeClaimedAt: { not: null, lt: cutoff },
    },
    select: { id: true, totalCents: true, chargeClaimedAt: true, paymentStatus: true },
    orderBy: { chargeClaimedAt: "asc" },
  });
}
