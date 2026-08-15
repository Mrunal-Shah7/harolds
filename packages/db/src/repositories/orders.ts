// SPRINT-4: order persistence — pending-order creation, payment-result transitions, and lookup.
// Authoritative repricing (QuoteResult) plus checkout keys go in; a Prisma Order row comes out.
// This file does NOT talk to Square — it only records outcomes the caller already determined.
import { randomBytes } from "node:crypto";
import type { QuoteResult, SelectedModifierSnapshot } from "@harolds/types";
import { OrderStatus, PaymentStatus, PrintTarget, PrintJobStatus, JobType, JobStatus } from "@harolds/types";
import { prisma } from "../client";
import type { Order, OrderLine, Prisma } from "../generated/prisma";
import { allocateOrderNumber } from "../order-numbers";
import { businessDateToUtcDate } from "../business-date";
import { getStoreConfig } from "../store-config";
import { renderPayloadsForOrder } from "../print-jobs";

export type OrderWithLines = Order & { lines: OrderLine[] };

export type CreatePendingOrderCustomer = {
  firstName: string;
  lastName: string;
  /** Must already be normalised to E.164 — see `normalizePhoneToE164` in customer.ts. */
  phoneE164: string;
  email: string;
  smsConsent: boolean;
  smsConsentAt: Date | null;
};

export type CreatePendingOrderArgs = {
  /** Authoritative repricing result from `@harolds/pricing` — never trust client-sent totals. */
  quote: QuoteResult;
  customer: CreatePendingOrderCustomer;
  /** Client-supplied checkout idempotency key — unique; retried submits return the same order. */
  clientIdempotencyKey: string;
  /** Stable fingerprint of cart+tip for conflict detection on key reuse. */
  cartFingerprint: string;
  /** Unguessable public status-lookup token. Generated with crypto if the caller omits it. */
  lookupToken?: string;
  /** Order-level note (distinct from each line's own `customerNote`, already in the quote snapshot). */
  customerNote?: string | null;
};

/** Generates a 32-byte random hex token — used for `lookupToken` when the caller doesn't supply one. */
export function generateLookupToken(): string {
  return randomBytes(32).toString("hex");
}

function tipRateBpsFromQuote(quote: QuoteResult): number | null {
  const { tip } = quote;
  if (tip.type === "preset" || tip.type === "rate") {
    return tip.rateBps;
  }
  return null;
}

/**
 * Create an unpaid order from an authoritative quote. Order number / sequence / business date
 * are left null — they are only allocated once payment actually succeeds
 * (see `markOrderPaidAndAllocate`). `quote.lines` order is preserved into `OrderLine` rows, and
 * each line's `itemId` becomes the (nullable, SetNull-on-delete) `menuItemId` FK.
 *
 * Idempotent by `clientIdempotencyKey`: callers should check `findOrderByIdempotencyKey` first
 * and return the existing order on a retried submit rather than calling this again — this
 * function itself will throw (unique constraint violation) on a duplicate key.
 */
export async function createPendingOrder(args: CreatePendingOrderArgs): Promise<OrderWithLines> {
  const { quote, customer } = args;
  const lookupToken = args.lookupToken ?? generateLookupToken();

  return prisma.order.create({
    data: {
      orderNumber: null,
      orderSequence: null,
      businessDate: null,

      customerFirstName: customer.firstName,
      customerLastName: customer.lastName,
      customerPhone: customer.phoneE164,
      customerEmail: customer.email,
      smsConsent: customer.smsConsent,
      smsConsentAt: customer.smsConsentAt,

      subtotalCents: quote.subtotalCents,
      taxCents: quote.taxCents,
      tipCents: quote.tip.tipCents,
      totalCents: quote.totalCents,
      taxRateBps: quote.taxRateBps,
      taxAppliedPreDiscount: quote.taxAppliedPreDiscount,
      tipRateBps: tipRateBpsFromQuote(quote),

      paymentStatus: PaymentStatus.PENDING,
      status: OrderStatus.AWAITING_PAYMENT,
      estimatedReadyAt: new Date(quote.estimatedReadyAt),

      customerNote: args.customerNote ?? null,

      lookupToken,
      clientIdempotencyKey: args.clientIdempotencyKey,
      cartFingerprint: args.cartFingerprint,

      lines: {
        create: quote.lines.map((line) => ({
          menuItemId: line.itemId,
          quantity: line.snapshot.quantity,
          itemName: line.snapshot.itemName,
          boardLabel: line.snapshot.boardLabel,
          unitPriceCents: line.snapshot.baseUnitPriceCents,
          modifierTotalCents: line.snapshot.modifierTotalCents,
          effectiveUnitPriceCents: line.snapshot.effectiveUnitPriceCents,
          lineTotalCents: line.snapshot.lineTotalCents,
          selectedModifiers: line.snapshot.selectedModifiers as unknown as Prisma.InputJsonValue,
          customerNote: line.snapshot.customerNote,
        })),
      },
    },
    include: { lines: true },
  });
}

/** Look up a (pending or resolved) order by the client-supplied checkout idempotency key. */
export async function findOrderByIdempotencyKey(clientIdempotencyKey: string): Promise<OrderWithLines | null> {
  return prisma.order.findUnique({
    where: { clientIdempotencyKey },
    include: { lines: true },
  });
}

/** Look up an order by its unguessable public status-lookup token. Never use orderNumber for this. */
export async function findOrderByLookupToken(lookupToken: string): Promise<OrderWithLines | null> {
  return prisma.order.findUnique({
    where: { lookupToken },
    include: { lines: true },
  });
}

/**
 * Look up an order by processor payment id. Not unique at the DB level (index only) — a
 * processor could theoretically reuse ids across environments/tests — so this returns the
 * most recently created match.
 */
export async function findOrderByProcessorPaymentId(processorPaymentId: string): Promise<OrderWithLines | null> {
  return prisma.order.findFirst({
    where: { processorPaymentId },
    orderBy: { createdAt: "desc" },
    include: { lines: true },
  });
}

export type MarkOrderPaidAndAllocateArgs = {
  /** Processor (Square) payment id — becomes `Order.processorPaymentId`. */
  paymentId: string;
  /** Instant the payment was captured; also the instant business-date allocation resolves against. */
  paidAt: Date;
  /** Kitchen-ticket printer serial. */
  kitchenSerial: string;
  /** Counter-receipt printer serial (may equal kitchenSerial). */
  counterSerial: string;
  /** Attempt ceiling for the two print jobs. */
  printMaxAttempts?: number;
  /** Last four of the card, only when Square supplied them. */
  cardLast4?: string | null;
  /** Request correlation id from the originating HTTP request, if any. */
  correlationId?: string | null;
};

/**
 * Persist Square's payment id as soon as it is known — before allocate/paid transition —
 * so a crash leaves a recoverable pointer for webhooks / reconciliation.
 */
export async function recordProcessorPaymentId(
  orderId: string,
  processorPaymentId: string,
): Promise<Order> {
  return prisma.order.update({
    where: { id: orderId },
    data: { processorPaymentId },
  });
}

/**
 * Transactionally: allocate the order's number (via `allocateOrderNumber`, gap-free per business
 * date), flip payment/order status to CAPTURED/PAID, and enqueue the fulfilment side-effects
 * (2 PrintJobs — kitchen ticket + counter receipt — and 2 BackgroundJobs — SMS confirmation +
 * email receipt). All in one DB transaction so a crash between steps cannot leave a PAID order
 * with no number, or a numbered order with no print jobs queued.
 *
 * Idempotent: if the order is already PAID with an allocated number, returns it unchanged (webhook
 * and sync path convergence).
 */
export async function markOrderPaidAndAllocate(
  orderId: string,
  args: MarkOrderPaidAndAllocateArgs,
): Promise<OrderWithLines> {
  const storeConfig = await getStoreConfig();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { lines: true },
    });

    if (
      existing.status === OrderStatus.PAID &&
      existing.paymentStatus === PaymentStatus.CAPTURED &&
      existing.orderNumber
    ) {
      return existing;
    }

    const allocation = await allocateOrderNumber(tx, {
      instant: args.paidAt,
      timeZone: storeConfig.timezone,
      resetHour: storeConfig.orderNumberResetHour,
      prefix: storeConfig.orderNumberPrefix,
      startValue: storeConfig.orderNumberStartValue,
      padWidth: storeConfig.orderNumberPadWidth,
    });

    const order = await tx.order.update({
      where: { id: orderId },
      data: {
        orderNumber: allocation.orderNumber,
        orderSequence: allocation.orderSequence,
        businessDate: businessDateToUtcDate(allocation.businessDate),
        paymentStatus: PaymentStatus.CAPTURED,
        status: OrderStatus.PAID,
        processorPaymentId: args.paymentId,
        paymentCapturedAt: args.paidAt,
        paidAt: args.paidAt,
        paymentFailureReason: null,
        ...(args.cardLast4 !== undefined && args.cardLast4 !== null ? { cardLast4: args.cardLast4 } : {}),
      },
      include: { lines: true },
    });

    const existingJobs = await tx.printJob.count({ where: { orderId } });
    if (existingJobs === 0) {
      const payloads = renderPayloadsForOrder(order, storeConfig);
      const maxAttempts = args.printMaxAttempts ?? 5;
      await tx.printJob.createMany({
        data: [
          {
            orderId,
            target: PrintTarget.KITCHEN_TICKET,
            status: PrintJobStatus.QUEUED,
            payload: payloads.kitchen,
            printerSerial: args.kitchenSerial,
            maxAttempts,
          },
          {
            orderId,
            target: PrintTarget.COUNTER_RECEIPT,
            status: PrintJobStatus.QUEUED,
            payload: payloads.counter,
            printerSerial: args.counterSerial,
            maxAttempts,
          },
        ],
      });

      await tx.backgroundJob.createMany({
        data: [
          {
            type: JobType.SMS_ORDER_CONFIRMATION,
            status: JobStatus.PENDING,
            payload: { orderId, correlationId: args.correlationId ?? undefined },
          },
          {
            type: JobType.EMAIL_ORDER_RECEIPT,
            status: JobStatus.PENDING,
            payload: { orderId, correlationId: args.correlationId ?? undefined },
          },
        ],
      });
    }

    return order;
  });
}

export type MarkOrderPaymentFailedArgs = {
  /** Processor payment id, when the processor returned one despite the failure. */
  processorPaymentId?: string | null;
  reason: string;
};

/**
 * Record a definite payment failure (processor explicitly declined/errored the charge).
 * Leaves `status` at AWAITING_PAYMENT so the customer can retry checkout with a new attempt.
 */
export async function markOrderPaymentFailed(
  orderId: string,
  args: MarkOrderPaymentFailedArgs,
): Promise<Order> {
  return prisma.order.update({
    where: { id: orderId },
    data: {
      paymentStatus: PaymentStatus.FAILED,
      paymentFailureReason: args.reason,
      ...(args.processorPaymentId !== undefined ? { processorPaymentId: args.processorPaymentId } : {}),
    },
  });
}

export type MarkOrderPaymentUnknownArgs = {
  /** Processor payment id, when known — the reconciliation sweep keys off this. */
  processorPaymentId?: string | null;
};

/**
 * Record an indeterminate payment outcome — the synchronous call to the processor failed
 * (timeout, network error, 5xx) so we cannot tell whether the charge actually succeeded.
 * A reconciliation job (Sprint 4/9) resolves UNKNOWN orders by polling the processor.
 */
export async function markOrderPaymentUnknown(
  orderId: string,
  args: MarkOrderPaymentUnknownArgs = {},
): Promise<Order> {
  return prisma.order.update({
    where: { id: orderId },
    data: {
      paymentStatus: PaymentStatus.UNKNOWN,
      ...(args.processorPaymentId !== undefined ? { processorPaymentId: args.processorPaymentId } : {}),
    },
  });
}

export type PublicOrderLineView = {
  itemName: string;
  boardLabel: string | null;
  quantity: number;
  effectiveUnitPriceCents: number;
  lineTotalCents: number;
  selectedModifiers: SelectedModifierSnapshot[];
};

/**
 * Public status-lookup shape (Phase 7) — deliberately excludes phone, email, lookup token,
 * processor/payment ids, staff notes, and anything else that isn't safe to hand back to
 * whoever holds the lookup-token URL. First name only (no last name) for the same reason.
 */
export type PublicOrderView = {
  orderNumber: string | null;
  status: OrderStatus;
  firstName: string;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  estimatedReadyAt: Date | null;
  lines: PublicOrderLineView[];
};

export function getPublicOrderView(order: OrderWithLines): PublicOrderView {
  return {
    orderNumber: order.orderNumber,
    status: order.status as OrderStatus,
    firstName: order.customerFirstName,
    subtotalCents: order.subtotalCents,
    taxCents: order.taxCents,
    tipCents: order.tipCents,
    totalCents: order.totalCents,
    estimatedReadyAt: order.estimatedReadyAt,
    lines: order.lines.map((line) => ({
      itemName: line.itemName,
      boardLabel: line.boardLabel,
      quantity: line.quantity,
      effectiveUnitPriceCents: line.effectiveUnitPriceCents,
      lineTotalCents: line.lineTotalCents,
      selectedModifiers: line.selectedModifiers as unknown as SelectedModifierSnapshot[],
    })),
  };
}
