// SPRINT-8 / SPRINT-18.3 / SPRINT-19: admin order listing and detail — redacted contacts in lists; full history on detail.
import { DateTime } from "luxon";
import { OrderStatus, PaymentStatus } from "@harolds/types";
import { prisma } from "./client";
import { maskName, redactEmail, redactPaymentId, redactPhone } from "./admin-redact";
import { AdminValidationError } from "./admin-menu";
import { remainingAfterReservation, reservedRefundCentsByOrderIds } from "./refunds";

export type AdminOrderListQuery = {
  from: Date;
  to: Date;
  status?: string;
  paymentStatus?: string;
  q?: string;
};

export function todayRange(timeZone: string, now = new Date()): { from: Date; to: Date } {
  const start = DateTime.fromJSDate(now, { zone: timeZone }).startOf("day");
  return { from: start.toUTC().toJSDate(), to: start.plus({ days: 1 }).toUTC().toJSDate() };
}

export function formatStoreDateTime(instant: Date, timeZone: string): string {
  return DateTime.fromJSDate(instant, { zone: "utc" }).setZone(timeZone).toFormat("ccc LLL d, yyyy h:mm a ZZZZ");
}

export async function listAdminOrders(query: AdminOrderListQuery) {
  const q = query.q?.trim();
  const rows = await prisma.order.findMany({
    where: {
      createdAt: { gte: query.from, lt: query.to },
      ...(query.status ? { status: query.status as OrderStatus } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus as PaymentStatus } : {}),
      ...(q
        ? {
            OR: [
              { orderNumber: { contains: q, mode: "insensitive" } },
              { customerFirstName: { contains: q, mode: "insensitive" } },
              { customerLastName: { contains: q, mode: "insensitive" } },
              { customerPhone: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      orderNumber: true,
      customerFirstName: true,
      customerLastName: true,
      customerPhone: true,
      status: true,
      paymentStatus: true,
      totalCents: true,
      refundedCents: true,
      createdAt: true,
      paidAt: true,
    },
  });

  const reservedByOrder = await reservedRefundCentsByOrderIds(rows.map((row) => row.id));
  return rows.map((row) => {
    const name = maskName(row.customerFirstName, row.customerLastName);
    const reservedCents = reservedByOrder.get(row.id) ?? 0;
    return {
      id: row.id,
      orderNumber: row.orderNumber,
      customerFirstName: name.firstName,
      customerLastInitial: name.lastInitial,
      customerPhoneRedacted: redactPhone(row.customerPhone),
      status: row.status,
      paymentStatus: row.paymentStatus,
      totalCents: row.totalCents,
      refundedCents: row.refundedCents,
      reservedRefundCents: reservedCents,
      remainingRefundableCents: remainingAfterReservation(row.totalCents, row.refundedCents, reservedCents),
      createdAt: row.createdAt.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
    };
  });
}

export async function getAdminOrderDetail(id: string, timeZone: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { createdAt: "asc" } },
      printJobs: { orderBy: { createdAt: "asc" } },
      refunds: {
        orderBy: { createdAt: "asc" },
        include: { actedBy: { select: { id: true, displayName: true, role: true } } },
      },
      statusEvents: { orderBy: { createdAt: "asc" } },
      paymentAttempts: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) return null;

  const notifyJobs = await prisma.backgroundJob.findMany({
    where: { payload: { path: ["orderId"], equals: id } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      status: true,
      attemptCount: true,
      lastError: true,
      result: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const actorIds = [...new Set(order.statusEvents.map((e) => e.userId).filter((v): v is string => Boolean(v)))];
  const actors =
    actorIds.length === 0
      ? []
      : await prisma.adminUser.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, displayName: true, role: true },
        });
  const actorById = new Map(actors.map((a) => [a.id, a]));
  const reservedCents = order.refunds
    .filter((r) => r.status === "PENDING" || r.status === "UNKNOWN")
    .reduce((sum, r) => sum + r.amountCents, 0);

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerFirstName: order.customerFirstName,
    customerLastName: order.customerLastName,
    customerPhoneRedacted: redactPhone(order.customerPhone),
    customerEmailRedacted: redactEmail(order.customerEmail),
    status: order.status,
    paymentStatus: order.paymentStatus,
    processorPaymentIdRedacted: redactPaymentId(order.processorPaymentId),
    cardLast4: order.cardLast4,
    subtotalCents: order.subtotalCents,
    taxCents: order.taxCents,
    tipCents: order.tipCents,
    totalCents: order.totalCents,
    refundedCents: order.refundedCents,
    reservedRefundCents: reservedCents,
    remainingRefundableCents: remainingAfterReservation(order.totalCents, order.refundedCents, reservedCents),
    taxRateBps: order.taxRateBps,
    customerNote: order.customerNote,
    staffNote: order.staffNote,
    createdAt: order.createdAt.toISOString(),
    createdAtLocal: formatStoreDateTime(order.createdAt, timeZone),
    paidAt: order.paidAt?.toISOString() ?? null,
    paidAtLocal: order.paidAt ? formatStoreDateTime(order.paidAt, timeZone) : null,
    printedAt: order.printedAt?.toISOString() ?? null,
    readyAt: order.readyAt?.toISOString() ?? null,
    pickedUpAt: order.pickedUpAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
    lines: order.lines.map((line) => ({
      id: line.id,
      quantity: line.quantity,
      itemName: line.itemName,
      boardLabel: line.boardLabel,
      unitPriceCents: line.unitPriceCents,
      modifierTotalCents: line.modifierTotalCents,
      effectiveUnitPriceCents: line.effectiveUnitPriceCents,
      lineTotalCents: line.lineTotalCents,
      selectedModifiers: line.selectedModifiers,
      customerNote: line.customerNote,
    })),
    refunds: order.refunds.map((r) => ({
      id: r.id,
      amountCents: r.amountCents,
      status: r.status,
      processorRefundIdRedacted: redactPaymentId(r.processorRefundId),
      actedBy: r.actedBy ? { displayName: r.actedBy.displayName, role: r.actedBy.role } : null,
      createdAt: r.createdAt.toISOString(),
      createdAtLocal: formatStoreDateTime(r.createdAt, timeZone),
    })),
    printJobs: order.printJobs.map((j) => ({
      id: j.id,
      target: j.target,
      status: j.status,
      isReprint: j.isReprint,
      attemptCount: j.attemptCount,
      lastError: j.lastError,
      createdAt: j.createdAt.toISOString(),
      sentAt: j.sentAt?.toISOString() ?? null,
      acknowledgedAt: j.acknowledgedAt?.toISOString() ?? null,
    })),
    notifyJobs: notifyJobs.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      attemptCount: j.attemptCount,
      lastError: j.lastError,
      result: j.result,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
    })),
    statusEvents: order.statusEvents.map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      source: e.source,
      reason: e.reason,
      user: e.userId ? (actorById.get(e.userId) ?? null) : null,
      createdAt: e.createdAt.toISOString(),
      createdAtLocal: formatStoreDateTime(e.createdAt, timeZone),
    })),
    // SPRINT-18.3: every sale attempt and what the gateway said — enough to diagnose a decline
    // without the gateway portal. The transaction id is shown redacted like every other payment
    // id on this screen; the full id is on the row and in the payment.outcome log line.
    paymentAttempts: order.paymentAttempts.map((a) => ({
      id: a.id,
      createdAt: a.createdAt.toISOString(),
      createdAtLocal: formatStoreDateTime(a.createdAt, timeZone),
      amountCents: a.amountCents,
      gatewayEnvironment: a.gatewayEnvironment,
      gatewayOrigin: a.gatewayOrigin,
      classification: a.classification,
      internalReason: a.internalReason,
      gatewayResponse: a.gatewayResponse,
      gatewayResponseCode: a.gatewayResponseCode,
      gatewayResponseText: a.gatewayResponseText,
      avsResponse: a.avsResponse,
      cvvResponse: a.cvvResponse,
      authCode: a.authCode,
      gatewayTransactionIdRedacted: redactPaymentId(a.gatewayTransactionId),
      httpStatus: a.httpStatus,
      // SPRINT-19: how the token was produced, and the brand Collect.js reported.
      paymentMethod: a.paymentMethod,
      cardBrand: a.cardBrand,
    })),
  };
}

export function remainingRefundableCents(
  totalCents: number,
  refundedCents: number,
  reservedCents = 0,
): number {
  return remainingAfterReservation(totalCents, refundedCents, reservedCents);
}

export function assertRefundAmount(amountCents: number, remaining: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new AdminValidationError("Refund amount must be a positive number of cents.");
  }
  if (amountCents > remaining) {
    throw new AdminValidationError(`Refund exceeds remaining refundable amount (${remaining} cents).`);
  }
}
