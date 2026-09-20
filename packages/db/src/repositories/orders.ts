// SPRINT-4: order persistence — pending-order creation, payment-result transitions, and lookup.
// Authoritative repricing (QuoteResult) plus checkout keys go in; a Prisma Order row comes out.
// This file does NOT talk to the payment gateway — it only records outcomes the caller determined.
import { createHash, randomBytes } from "node:crypto";
import type { QuoteResult, SelectedModifierSnapshot } from "@harolds/types";
import { OrderStatus, PaymentStatus, PrintTarget, PrintJobStatus, JobType, JobStatus } from "@harolds/types";
import { prisma } from "../client";
import type { Order, OrderLine, Prisma } from "../generated/prisma";
import { allocateOrderNumber } from "../order-numbers";
import { businessDateToUtcDate } from "../business-date";
import { getStoreConfig } from "../store-config";
import { renderReceiptPayload } from "../print-jobs";

export type OrderWithLines = Order & { lines: OrderLine[] };

export type CreatePendingOrderCustomer = {
  firstName: string;
  lastName: string;
  /** Must already be normalised to E.164 — see `normalizePhoneToE164` in customer.ts. */
  phoneE164: string;
  email: string;
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
  return createPendingOrderWith(prisma, args);
}

/** The shared insert, usable on the global client or inside a transaction (SPRINT-16). */
async function createPendingOrderWith(
  client: Prisma.TransactionClient | typeof prisma,
  args: CreatePendingOrderArgs,
): Promise<OrderWithLines> {
  const { quote, customer } = args;
  const lookupToken = args.lookupToken ?? generateLookupToken();

  return client.order.create({
    data: {
      orderNumber: null,
      orderSequence: null,
      businessDate: null,

      customerFirstName: customer.firstName,
      customerLastName: customer.lastName,
      customerPhone: customer.phoneE164,
      customerEmail: customer.email,
      // SPRINT-17: smsConsent / smsConsentAt remain as columns (the SMS removal was
      // deliberately code-only, no migration) but are never written. Nothing can send an SMS,
      // so recording permission to send one would be a false record.

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

/* ---------------------------------------------------------------------------
 * SPRINT-16: the server-side duplicate-order guard.
 *
 * The derived idempotency key (apps/web/src/lib/order-key.ts) stops the reload double charge, but
 * it is client-side and therefore advisory: a cleared browser, a second tab, or a different
 * device defeats it. This is the guarantee.
 *
 * Before creating an order we look for a recent one from the same phone with the same
 * server-computed cart signature, and return it instead of creating a second. The lookup and the
 * insert run in ONE transaction behind a Postgres advisory lock keyed on (phone, signature), so
 * two simultaneous submissions cannot both pass the lookup.
 * ------------------------------------------------------------------------- */

/** Payment states a duplicate match may be in. */
const GUARD_MATCHABLE_PAYMENT_STATUSES = [
  // Money may have moved and we do not yet know: the exact case worth collapsing.
  PaymentStatus.UNKNOWN,
  // In flight.
  PaymentStatus.PENDING,
  // Already captured: the customer should be shown the order they already paid for.
  PaymentStatus.CAPTURED,
] as const;

/*
 * PaymentStatus.FAILED is DELIBERATELY not matchable. A decline is definite — the processor
 * confirmed no money moved — and the customer is explicitly retrying past it, usually with a
 * different card. Collapsing that retry onto the declined order would replay the cached decline
 * and trap them on a dead order they can never pay.
 *
 * Cancelled and refunded orders are excluded for the same reason: they are terminal, and a
 * customer ordering again after one is not duplicating anything.
 */

export type DuplicateGuardOutcome =
  | { kind: "created"; order: OrderWithLines }
  | { kind: "existing"; order: OrderWithLines; matchedAgeMs: number };

/** Two 32-bit ints for pg_advisory_xact_lock(int4, int4), derived from the guard's identity. */
function advisoryLockKeys(phoneE164: string, cartFingerprint: string): [number, number] {
  const digest = createHash("sha256").update(`${phoneE164}|${cartFingerprint}`).digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

/**
 * Create a pending order, unless an equivalent one was created moments ago — in which case
 * return that one and charge nothing new.
 */
export async function createPendingOrderGuarded(
  args: CreatePendingOrderArgs & { guardWindowMs: number },
): Promise<DuplicateGuardOutcome> {
  const { guardWindowMs, ...createArgs } = args;
  const [lockA, lockB] = advisoryLockKeys(createArgs.customer.phoneE164, createArgs.cartFingerprint);

  return prisma.$transaction(async (tx) => {
    // Serialises concurrent submissions for this (phone, cart). Released with the transaction.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockA}::int4, ${lockB}::int4)`;

    const since = new Date(Date.now() - guardWindowMs);
    const existing = await tx.order.findFirst({
      where: {
        customerPhone: createArgs.customer.phoneE164,
        cartFingerprint: createArgs.cartFingerprint,
        createdAt: { gte: since },
        paymentStatus: { in: [...GUARD_MATCHABLE_PAYMENT_STATUSES] },
        status: { notIn: [OrderStatus.CANCELLED] },
        refundedCents: { lte: 0 },
      },
      orderBy: { createdAt: "desc" },
      include: { lines: true },
    });

    if (existing) {
      return {
        kind: "existing" as const,
        order: existing,
        matchedAgeMs: Date.now() - existing.createdAt.getTime(),
      };
    }

    return { kind: "created" as const, order: await createPendingOrderWith(tx, createArgs) };
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

/**
 * Outcome of trying to take exclusive ownership of an order's charge attempt.
 *
 * `claimed` is the only result that permits calling the gateway. `already_charged` means the
 * order already carries a payment id. `in_flight` means another request holds the claim, or a
 * previous attempt died holding it — the caller must resolve that with the gateway (by order
 * id) rather than charging, because whether money moved is unknown.
 */
export type ChargeClaim =
  | { kind: "claimed"; order: OrderWithLines }
  | { kind: "already_charged"; order: OrderWithLines }
  | { kind: "in_flight"; order: OrderWithLines; claimedAt: Date }
  | { kind: "not_chargeable"; order: OrderWithLines }
  | { kind: "not_found" };

/**
 * Atomically take the right to charge this order.
 *
 * This is the whole double-charge defence. NMI has no idempotency key and this account's
 * processor rejects `dup_seconds`, so a second concurrent `createPayment` for the same order
 * WILL take a second payment. The guard has to be here, in a single conditional UPDATE whose
 * WHERE clause names every precondition — `updateMany` compiles to
 * `UPDATE ... WHERE id = ? AND chargeClaimedAt IS NULL AND ...`, which PostgreSQL applies
 * atomically, so exactly one of two racing requests sees `count === 1`.
 *
 * Do NOT reimplement this as a read followed by a write: the gap between them is precisely
 * the race this exists to close.
 */
export async function claimOrderForCharge(orderId: string): Promise<ChargeClaim> {
  const claimedAt = new Date();
  const claim = await prisma.order.updateMany({
    where: {
      id: orderId,
      chargeClaimedAt: null,
      processorPaymentId: null,
      paymentStatus: PaymentStatus.PENDING,
      status: OrderStatus.AWAITING_PAYMENT,
    },
    data: { chargeClaimedAt: claimedAt },
  });

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { lines: true } });
  if (!order) return { kind: "not_found" };
  if (claim.count === 1) return { kind: "claimed", order };

  // The update matched nothing — work out which precondition failed, so the caller can tell a
  // settled order from one whose fate is genuinely unknown.
  //
  // A DEFINITE decline is checked BEFORE the payment id, and the order matters. NMI returns a
  // `transactionid` on declines as well as approvals, and that id is deliberately kept so the
  // failure stays traceable — so a declined order carries one. Testing `processorPaymentId`
  // first read that as "already charged" and handed the caller a success replay, which showed
  // the customer a placed order they had never paid for.
  if (order.paymentStatus === PaymentStatus.FAILED) return { kind: "not_chargeable", order };
  if (order.processorPaymentId) return { kind: "already_charged", order };
  if (order.chargeClaimedAt) return { kind: "in_flight", order, claimedAt: order.chargeClaimedAt };
  return { kind: "not_chargeable", order };
}

/**
 * Release a claim so the order can be charged again.
 *
 * Only safe when the gateway has told us NO sale exists for this order — a released claim on an
 * order that did charge is a licence to charge it twice.
 *
 * `claimedAt` is REQUIRED and is matched exactly, so this can only ever clear the specific claim
 * the caller observed. Without it the release is a double-charge hole: an in-flight sale has not
 * yet written `processorPaymentId`, so a concurrent request that found no gateway record would
 * clear the live claim out from under it and charge again. Matching the timestamp means a claim
 * taken (or retaken) since the caller looked is left alone. `processorPaymentId: null` stays as a
 * second condition so a charge that lands mid-release still wins.
 *
 * Returns true when this call actually cleared the claim.
 */
export async function releaseChargeClaim(orderId: string, claimedAt: Date): Promise<boolean> {
  const released = await prisma.order.updateMany({
    where: { id: orderId, processorPaymentId: null, chargeClaimedAt: claimedAt },
    data: { chargeClaimedAt: null },
  });
  return released.count === 1;
}

export type MarkOrderPaidAndAllocateArgs = {
  /** Gateway payment id — becomes `Order.processorPaymentId`. */
  paymentId: string;
  /** Instant the payment was captured; also the instant business-date allocation resolves against. */
  paidAt: Date;
  /** Kitchen-ticket printer serial. */
  kitchenSerial: string;
  /** Counter-receipt printer serial (may equal kitchenSerial). */
  counterSerial: string;
  /** Attempt ceiling for the two print jobs. */
  printMaxAttempts?: number;
  /** Last four of the card, only when the gateway supplied them. */
  cardLast4?: string | null;
  /** Request correlation id from the originating HTTP request, if any. */
  correlationId?: string | null;
};

/**
 * Persist the gateway's payment id as soon as it is known — before allocate/paid transition —
 * so a crash leaves a recoverable pointer for webhooks / reconciliation.
 *
 * SPRINT-17: this also clears the charge claim. The payment id is the stronger guard from here
 * on (`claimOrderForCharge` refuses any order that has one), and leaving the claim set would
 * strand the order for the recovery path to re-examine for no reason.
 */
export async function recordProcessorPaymentId(
  orderId: string,
  processorPaymentId: string,
): Promise<Order> {
  return prisma.order.update({
    where: { id: orderId },
    data: { processorPaymentId, chargeClaimedAt: null },
  });
}

/**
 * Transactionally: allocate the order's number (via `allocateOrderNumber`, gap-free per business
 * date), flip payment/order status to CAPTURED/PAID, and enqueue the fulfilment side-effects
 * (2 PrintJobs — kitchen ticket + counter receipt — and 2 BackgroundJobs — SMS confirmation +
 * email receipt). All in one DB transaction so a crash between steps cannot leave a PAID order
 * with no number, or a numbered order with no print jobs queued.
 *
 * Idempotent: an order that already carries a CAPTURED payment and an allocated number is
 * returned unchanged (webhook and sync path convergence).
 *
 * The idempotency key here is deliberately the PAYMENT state, not the order status. It used to
 * also require `status === PAID`, which quietly stopped protecting the order the moment the
 * kitchen advanced it: a redelivered `payment.updated` webhook then fell through, allocated a
 * SECOND order number, and reset a READY order back to PAID. Fulfilment progress must never
 * decide whether a payment is re-applied.
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

    // Captured and numbered means done, however far the kitchen has taken it since.
    if (existing.paymentStatus === PaymentStatus.CAPTURED && existing.orderNumber) {
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
      // ONE slip per order. This used to queue two — a kitchen ticket and a counter receipt —
      // which on a single-printer store meant two pieces of paper per order that staff had to
      // pair up by hand. `buildOrderReceipt` merges them. The target stays KITCHEN_TICKET
      // because acknowledging that target is what moves the order PAID -> PRINTED.
      const payload = renderReceiptPayload(order, storeConfig);
      const maxAttempts = args.printMaxAttempts ?? 5;
      await tx.printJob.create({
        data: {
          orderId,
          target: PrintTarget.KITCHEN_TICKET,
          status: PrintJobStatus.QUEUED,
          payload,
          printerSerial: args.kitchenSerial,
          maxAttempts,
        },
      });

      // SPRINT-17: the confirmation SMS that used to sit alongside this was removed with
      // Twilio. The email receipt is now the only customer confirmation.
      await tx.backgroundJob.create({
        data: {
          type: JobType.EMAIL_ORDER_RECEIPT,
          status: JobStatus.PENDING,
          payload: { orderId, correlationId: args.correlationId ?? undefined },
        },
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
      // A decline is definite — the gateway confirmed no money moved — so the claim is released.
      chargeClaimedAt: null,
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
      // The claim is DELIBERATELY left in place. Unknown means the charge may have landed, and
      // releasing it here would re-open the order to a second sale for the same money. It is
      // cleared only once the gateway has been asked whether a sale exists for this order.
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
  /** Set when the counter handed the order over. The status page turns it into a thank-you. */
  pickedUpAt: Date | null;
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
    pickedUpAt: order.pickedUpAt,
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
