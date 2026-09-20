// SPRINT-4: authoritative checkout — reprice, persist, charge, converge with webhooks.
import { createHash } from "node:crypto";
import { getOrderDuplicateGuardWindowMs, getPrinterConfig } from "@harolds/config";
import {
  claimOrderForCharge,
  createPendingOrderGuarded,
  findOrderByIdempotencyKey,
  getPublicOrderView,
  markOrderPaidAndAllocate,
  markOrderPaymentFailed,
  markOrderPaymentUnknown,
  normalizePhoneToE164,
  prisma,
  recordProcessorPaymentId,
  releaseChargeClaim,
  validateEmail,
  fetchItemsForQuote,
  getStoreConfig,
  getStoreStatus,
  type OrderWithLines,
} from "@harolds/db";
import { parseCartRequest, quoteCart, sanitizeKitchenNote, toMenuCatalog } from "@harolds/pricing";
import {
  createPayment,
  findPaymentByOrderId,
  GATEWAY_REQUEST_TIMEOUT_MS,
} from "@harolds/payments";
import {
  ApiErrorCode,
  JobStatus,
  JobType,
  OrderStatus,
  PaymentStatus,
  type CartRequest,
  type CheckoutOrderResponse,
  type CreateOrderRequest,
} from "@harolds/types";
import { getRequestId } from "@/lib/request-context";

export type CheckoutSuccess = { ok: true; order: CheckoutOrderResponse; replay: boolean };
export type CheckoutFailure = {
  ok: false;
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown> | null;
};

/**
 * Deterministic fingerprint of cart + tip, used for idempotency conflict detection and (SPRINT-16)
 * as the server-side cart signature the duplicate guard matches on.
 *
 * SPRINT-16 made this order-independent. It previously sorted `selectedOptionIds` within a line
 * but left the LINES in whatever order the client sent, so the same cart built by adding A then B
 * fingerprinted differently from B then A. That was harmless for conflict detection — the only
 * prior consumer, which compares for equality — and fatal for the guard, which has to recognise
 * the same cart arriving twice. Nothing depends on the old ordering: this value is written once
 * and only ever compared for equality.
 */
export function cartFingerprint(cart: CartRequest): string {
  const lines = cart.lines
    .map((l) => ({
      itemId: l.itemId,
      quantity: l.quantity,
      selectedOptionIds: [...l.selectedOptionIds].sort(),
      customerNote: l.customerNote ?? null,
    }))
    .sort((a, b) => {
      const left = `${a.itemId}|${a.selectedOptionIds.join(",")}|${a.customerNote ?? ""}|${a.quantity}`;
      const right = `${b.itemId}|${b.selectedOptionIds.join(",")}|${b.customerNote ?? ""}|${b.quantity}`;
      return left < right ? -1 : left > right ? 1 : 0;
    });
  return createHash("sha256").update(JSON.stringify({ lines, tip: cart.tip ?? null })).digest("hex");
}

/**
 * SPRINT-16 (Phase 5). The single wording for an AMBIGUOUS payment outcome.
 *
 * The classification can distinguish, cleanly, and this matters:
 *   - `declined`          -> a definite pre-capture decline. No money moved. -> PAYMENT_DECLINED
 *   - `transport_failure` -> timeout / 5xx / unusable response. The outcome is UNKNOWN, which is
 *                            why it routes through `markOrderPaymentUnknown`. -> PAYMENT_FAILED
 *
 * So PAYMENT_FAILED is emitted on the ambiguous class and ONLY the ambiguous class. The previous
 * storefront copy — "Nothing has been charged" — asserted the one thing the system cannot know,
 * on the one path where it is least likely to be true, and it is the sentence most likely to
 * produce the second attempt. The confident wording stays on PAYMENT_DECLINED, where it is
 * earned.
 *
 * SPRINT-17 corrected the wording: it told the customer to "check your texts", which stopped
 * being possible the moment SMS was removed. It now points at the only two things that actually
 * happen — an email receipt if the charge did land, and the store's phone.
 */
export const AMBIGUOUS_PAYMENT_MESSAGE =
  "We couldn't confirm that payment. Don't try again just yet — check your email for a receipt in a minute, or call the store.";

/**
 * Machine-readable reason attached to an ambiguous PAYMENT_FAILED, so the response says WHY
 * without telling the customer something the system cannot know.
 *
 * The customer-facing message is identical in every case on purpose — the honest answer is
 * always "we don't know yet". These exist so an operator reading a log or a support ticket can
 * tell a gateway that never answered from one that answered with something unusable, without
 * having to open the database.
 */
export const AmbiguousPaymentReason = {
  /** The sale was sent and the gateway did not give a usable answer. May or may not have charged. */
  GATEWAY_UNCONFIRMED: "GATEWAY_UNCONFIRMED",
  /** Another request holds the charge claim and may still be in flight. */
  CHARGE_IN_PROGRESS: "CHARGE_IN_PROGRESS",
  /** A previous attempt was interrupted and the gateway could not be asked what happened. */
  RECOVERY_UNAVAILABLE: "RECOVERY_UNAVAILABLE",
  /** The gateway has a sale for this order whose amount does not match the order total. */
  AMOUNT_MISMATCH: "AMOUNT_MISMATCH",
  /** The gateway has a sale for this order that is not in a completed state. */
  GATEWAY_SALE_INCOMPLETE: "GATEWAY_SALE_INCOMPLETE",
} as const;
export type AmbiguousPaymentReason =
  (typeof AmbiguousPaymentReason)[keyof typeof AmbiguousPaymentReason];

/**
 * Correlation id stamped on the gateway call's logs — NOT an idempotency key.
 *
 * It was one under Square, which deduplicated on it. NMI has no such field, so this value
 * makes nothing safe on its own; `claimOrderForCharge` is what prevents a double charge.
 * Renamed rather than deleted so log lines stay greppable across the migration.
 */
export function paymentCorrelationId(orderId: string): string {
  return `pay:${orderId}`;
}

export function toCheckoutOrderResponse(order: OrderWithLines): CheckoutOrderResponse {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status as OrderStatus,
    paymentStatus: order.paymentStatus as PaymentStatus,
    lookupToken: order.lookupToken,
    subtotalCents: order.subtotalCents,
    taxCents: order.taxCents,
    tipCents: order.tipCents,
    tipRateBps: order.tipRateBps,
    totalCents: order.totalCents,
    taxRateBps: order.taxRateBps,
    taxAppliedPreDiscount: order.taxAppliedPreDiscount,
    estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
    tip: null,
    lines: order.lines.map((line) => ({
      itemName: line.itemName,
      boardLabel: line.boardLabel,
      quantity: line.quantity,
      baseUnitPriceCents: line.unitPriceCents,
      modifierTotalCents: line.modifierTotalCents,
      effectiveUnitPriceCents: line.effectiveUnitPriceCents,
      lineTotalCents: line.lineTotalCents,
      selectedModifiers: line.selectedModifiers as CheckoutOrderResponse["lines"][number]["selectedModifiers"],
      customerNote: line.customerNote,
    })),
  };
}

function parseCreateOrderBody(body: unknown):
  | { ok: true; request: CreateOrderRequest; fingerprint: string }
  | { ok: false; failure: CheckoutFailure } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      failure: {
        ok: false,
        code: ApiErrorCode.VALIDATION_ERROR,
        message: "Request body must be a JSON object.",
        details: { reasons: [{ code: "MALFORMED_BODY", message: "Malformed body" }] },
      },
    };
  }

  const raw = body as Record<string, unknown>;

  // Top-level money fields forbidden (cart is checked by parseCartRequest).
  for (const key of Object.keys(raw)) {
    if (
      /(?:Cents|Price)$/.test(key) ||
      ["total", "subtotal", "tax", "price", "amount"].includes(key)
    ) {
      return {
        ok: false,
        failure: {
          ok: false,
          code: ApiErrorCode.VALIDATION_ERROR,
          message: "Client-supplied prices are not allowed.",
          details: {
            reasons: [
              {
                code: "PRICE_FIELD_FORBIDDEN",
                message: `Field "${key}" is not permitted.`,
                lineIndex: null,
                itemId: null,
                groupId: null,
                optionId: null,
                isAvailability: false,
              },
            ],
          },
        },
      };
    }
  }

  if (typeof raw.idempotencyKey !== "string" || raw.idempotencyKey.trim().length < 8) {
    return {
      ok: false,
      failure: {
        ok: false,
        code: ApiErrorCode.VALIDATION_ERROR,
        message: "idempotencyKey is required (min 8 characters).",
        details: { field: "idempotencyKey" },
      },
    };
  }

  if (typeof raw.paymentToken !== "string" || raw.paymentToken.length === 0) {
    return {
      ok: false,
      failure: {
        ok: false,
        code: ApiErrorCode.VALIDATION_ERROR,
        message: "paymentToken is required.",
        details: { field: "paymentToken" },
      },
    };
  }

  const customer = raw.customer;
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) {
    return {
      ok: false,
      failure: {
        ok: false,
        code: ApiErrorCode.VALIDATION_ERROR,
        message: "customer is required.",
        details: { field: "customer" },
      },
    };
  }
  const c = customer as Record<string, unknown>;
  for (const field of ["firstName", "lastName", "phone", "email"] as const) {
    if (typeof c[field] !== "string" || !(c[field] as string).trim()) {
      return {
        ok: false,
        failure: {
          ok: false,
          code: ApiErrorCode.VALIDATION_ERROR,
          message: `customer.${field} is required.`,
          details: { field: `customer.${field}` },
        },
      };
    }
  }
  // SPRINT-17: `customer.smsConsent` is still ACCEPTED so existing storefront clients keep
  // working, but it is no longer required and is never read. SMS was removed with Twilio, so
  // there is nothing to consent to; a client that still sends it is not an error, and one that
  // omits it is not either. When present it must still be a boolean rather than arbitrary data.
  if (c.smsConsent !== undefined && typeof c.smsConsent !== "boolean") {
    return {
      ok: false,
      failure: {
        ok: false,
        code: ApiErrorCode.VALIDATION_ERROR,
        message: "customer.smsConsent, when provided, must be a boolean.",
        details: { field: "customer.smsConsent" },
      },
    };
  }

  const phoneE164 = normalizePhoneToE164(c.phone as string);
  if (!phoneE164) {
    return {
      ok: false,
      failure: {
        ok: false,
        code: ApiErrorCode.VALIDATION_ERROR,
        message: "Enter a valid US phone number (10 digits, e.g. 7085551234).",
        details: { field: "customer.phone" },
      },
    };
  }
  if (!validateEmail(c.email as string)) {
    return {
      ok: false,
      failure: {
        ok: false,
        code: ApiErrorCode.VALIDATION_ERROR,
        message: "customer.email is not a valid email address.",
        details: { field: "customer.email" },
      },
    };
  }

  const cartParsed = parseCartRequest(raw.cart);
  if (!cartParsed.ok) {
    return {
      ok: false,
      failure: {
        ok: false,
        code: ApiErrorCode.VALIDATION_ERROR,
        message: "Cart validation failed.",
        details: { reasons: cartParsed.reasons },
      },
    };
  }

  const request: CreateOrderRequest = {
    cart: cartParsed.cart,
    customer: {
      firstName: (c.firstName as string).trim(),
      lastName: (c.lastName as string).trim(),
      phone: phoneE164,
      email: (c.email as string).trim().toLowerCase(),
    },
    paymentToken: raw.paymentToken,
    idempotencyKey: raw.idempotencyKey.trim(),
    // Free text that ends up on a thermal printer. `sanitizeKitchenNote` caps the length and
    // strips control bytes, which ESC/POS would otherwise read as printer commands.
    customerNote: sanitizeKitchenNote(raw.customerNote),
  };

  return { ok: true, request, fingerprint: cartFingerprint(request.cart) };
}

/**
 * Full checkout: validate → reprice → persist pending → charge → allocate on success.
 */
export async function checkoutOrder(body: unknown): Promise<CheckoutSuccess | CheckoutFailure> {
  const parsed = parseCreateOrderBody(body);
  if (!parsed.ok) return parsed.failure;

  const { request, fingerprint } = parsed;

  const existing = await findOrderByIdempotencyKey(request.idempotencyKey);
  if (existing) {
    if (existing.cartFingerprint !== fingerprint) {
      return {
        ok: false,
        code: ApiErrorCode.IDEMPOTENCY_CONFLICT,
        message: "idempotencyKey was reused with a different cart.",
        details: { field: "idempotencyKey" },
      };
    }
    // Replay — never create a second order / second charge.
    if (
      existing.status === OrderStatus.PAID ||
      existing.paymentStatus === PaymentStatus.CAPTURED
    ) {
      return { ok: true, order: toCheckoutOrderResponse(existing), replay: true };
    }
    // Pending/failed with same fingerprint: return current state without charging again if payment id exists,
    // otherwise fall through to re-attempt payment only when still awaiting and no processorPaymentId.
    if (existing.processorPaymentId && existing.paymentStatus === PaymentStatus.UNKNOWN) {
      return {
        ok: false,
        code: ApiErrorCode.PAYMENT_FAILED,
        message: AMBIGUOUS_PAYMENT_MESSAGE,
        details: { reason: AmbiguousPaymentReason.GATEWAY_SALE_INCOMPLETE, replayed: true },
      };
    }
    if (existing.paymentStatus === PaymentStatus.FAILED) {
      return {
        ok: false,
        code: ApiErrorCode.PAYMENT_DECLINED,
        message: existing.paymentFailureReason ?? "Payment was declined.",
        details: { replayed: true },
      };
    }
    if (existing.processorPaymentId) {
      // Already charged somehow — return as-is (webhook may still complete).
      return { ok: true, order: toCheckoutOrderResponse(existing), replay: true };
    }
    // Same cart, no payment yet — continue charging this existing pending order below.
    return chargeExistingPending(existing, request.paymentToken);
  }

  const itemIds = request.cart.lines.map((l) => l.itemId);
  const [rows, config, status] = await Promise.all([
    fetchItemsForQuote(itemIds),
    getStoreConfig(),
    getStoreStatus(),
  ]);

  const catalog = toMenuCatalog(rows);
  const quoted = quoteCart({
    cart: request.cart,
    catalog,
    store: {
      taxRateBps: config.taxRateBps,
      taxAppliedPreDiscount: config.taxAppliedPreDiscount,
      tippingEnabled: config.tippingEnabled,
      tipPresetsBps: config.tipPresetsBps,
      isOpen: status.isOpen,
      acceptingOrders: status.acceptingOrders,
      prepMinutes: status.prepMinutes,
      now: new Date(),
    },
  });

  if (!quoted.ok) {
    const soldOut = quoted.reasons.some((r) => r.code === "ITEM_SOLD_OUT" || r.code === "OPTION_SOLD_OUT");
    if (soldOut && quoted.reasons.every((r) => r.isAvailability || r.code === "ITEM_SOLD_OUT")) {
      return {
        ok: false,
        code: ApiErrorCode.ITEM_UNAVAILABLE,
        message: "One or more items are unavailable.",
        details: { reasons: quoted.reasons },
      };
    }
    return {
      ok: false,
      code: ApiErrorCode.VALIDATION_ERROR,
      message: "Cart validation failed.",
      details: { reasons: quoted.reasons },
    };
  }

  if (!quoted.result.orderable) {
    const blockers = quoted.result.blockingReasons;
    if (blockers.includes(ApiErrorCode.STORE_CLOSED)) {
      return {
        ok: false,
        code: ApiErrorCode.STORE_CLOSED,
        message: "The store is currently closed.",
        details: { blockingReasons: blockers },
      };
    }
    if (blockers.includes(ApiErrorCode.STORE_NOT_ACCEPTING_ORDERS)) {
      return {
        ok: false,
        code: ApiErrorCode.STORE_NOT_ACCEPTING_ORDERS,
        message: "The store is not accepting orders right now.",
        details: { blockingReasons: blockers },
      };
    }
    return {
      ok: false,
      code: ApiErrorCode.STORE_NOT_ACCEPTING_ORDERS,
      message: "This cart cannot be ordered right now.",
      details: { blockingReasons: blockers },
    };
  }


  // SPRINT-16: the server-side duplicate guard. The derived client key stops the reload double
  // charge, but a cleared browser, a second tab, or another device defeats it. This is the
  // guarantee. `fingerprint` is computed here from the parsed request — a client-supplied
  // signature would not be a guard.
  const guarded = await createPendingOrderGuarded({
    quote: quoted.result,
    customer: {
      firstName: request.customer.firstName,
      lastName: request.customer.lastName,
      phoneE164: request.customer.phone,
      email: request.customer.email,
    },
    clientIdempotencyKey: request.idempotencyKey,
    cartFingerprint: fingerprint,
    customerNote: request.customerNote ?? null,
    guardWindowMs: getOrderDuplicateGuardWindowMs(),
  });

  if (guarded.kind === "existing") {
    // Logged on EVERY hit so the false-positive rate is observable rather than assumed: a
    // customer genuinely ordering the same thing twice inside the window lands here too.
    console.warn(
      JSON.stringify({
        event: "checkout.duplicate_guard_hit",
        requestId: getRequestId() ?? null,
        matchedOrderId: guarded.order.id,
        matchedOrderNumber: guarded.order.orderNumber,
        matchedAgeMs: guarded.matchedAgeMs,
        matchedPaymentStatus: guarded.order.paymentStatus,
        customerPhone: guarded.order.customerPhone,
        cartFingerprint: fingerprint,
        guardWindowMs: getOrderDuplicateGuardWindowMs(),
      }),
    );

    // Already paid: show them the order they already have. This is exactly right for the reload
    // case where the first attempt actually succeeded.
    if (
      guarded.order.status === OrderStatus.PAID ||
      guarded.order.paymentStatus === PaymentStatus.CAPTURED
    ) {
      return { ok: true, order: toCheckoutOrderResponse(guarded.order), replay: true };
    }
    // In flight against the processor with an unknown outcome — never fire a second charge.
    if (guarded.order.paymentStatus === PaymentStatus.UNKNOWN) {
      return {
        ok: false,
        code: ApiErrorCode.PAYMENT_FAILED,
        message: AMBIGUOUS_PAYMENT_MESSAGE,
        details: { reason: AmbiguousPaymentReason.GATEWAY_UNCONFIRMED, duplicateGuard: true },
      };
    }
    // Unpaid: continue paying THAT order rather than creating another.
    return chargeExistingPending(guarded.order, request.paymentToken);
  }

  return chargeExistingPending(guarded.order, request.paymentToken);
}

/**
 * How long a claim must have existed before we treat it as possibly abandoned.
 *
 * This is NOT a staleness heuristic for deciding whether money moved — the gateway decides that.
 * It exists because "the gateway has no record of this order" is ambiguous while a sale is still
 * in flight: an unbooked transaction and one that never arrived look identical. Until the
 * in-flight window has closed, a claim is presumed live and is left strictly alone.
 *
 * The margin covers the gap between the gateway answering and the winner persisting its outcome.
 */
export const CHARGE_RECOVERY_AFTER_MS = GATEWAY_REQUEST_TIMEOUT_MS + 10_000;

/** Seams for tests. Production always uses the real gateway and the real clock. */
export type ChargeDeps = {
  createPayment: typeof createPayment;
  findPaymentByOrderId: typeof findPaymentByOrderId;
  now: () => number;
};

const REAL_DEPS: ChargeDeps = {
  createPayment,
  findPaymentByOrderId,
  now: () => Date.now(),
};

/**
 * Charge an order that is pending payment.
 *
 * SPRINT-17. Under Square this function could simply call the gateway: the idempotency key made
 * a repeat call harmless, so a race or a retry cost nothing. NMI has no such field, and this
 * account's processor rejects `dup_seconds`, so a second call here takes a SECOND payment from
 * the customer. Every path below exists to make sure the gateway is called at most once per
 * order, and that an interrupted attempt is resolved by asking the gateway what happened rather
 * than by guessing.
 */
export async function chargeExistingPending(
  order: OrderWithLines,
  paymentToken: string,
  deps: ChargeDeps = REAL_DEPS,
): Promise<CheckoutSuccess | CheckoutFailure> {
  const claim = await claimOrderForCharge(order.id);

  switch (claim.kind) {
    case "claimed":
      return chargeClaimedOrder(claim.order, paymentToken, deps);
    case "not_found":
      return { ok: false, code: ApiErrorCode.NOT_FOUND, message: "Order not found." };
    case "already_charged":
      // A charge landed between our read and our claim. Show what we have; the webhook or the
      // reconciler will finish converging it.
      return { ok: true, order: toCheckoutOrderResponse(claim.order), replay: true };
    case "not_chargeable":
      // Payment already resolved (declined, refunded) or the order left AWAITING_PAYMENT.
      //
      // A recorded failure reason means the gateway gave a DEFINITE answer on a previous
      // attempt, so this replays that answer as a decline. Returning PAYMENT_FAILED here told
      // the customer the outcome was unknown when it was known — the one wording that stops
      // them retrying with a different card, which is exactly what a declined order needs.
      if (claim.order.paymentStatus === PaymentStatus.FAILED && claim.order.paymentFailureReason) {
        return {
          ok: false,
          code: ApiErrorCode.PAYMENT_DECLINED,
          message: claim.order.paymentFailureReason,
          details: { replayed: true },
        };
      }
      return {
        ok: false,
        code: ApiErrorCode.PAYMENT_FAILED,
        message: AMBIGUOUS_PAYMENT_MESSAGE,
        details: { reason: AmbiguousPaymentReason.GATEWAY_UNCONFIRMED },
      };
    case "in_flight":
      return resolveInFlightCharge(claim.order, paymentToken, claim.claimedAt, deps);
  }
}

/**
 * Someone else holds the charge claim — either a concurrent request, or an attempt that died
 * before it could record its outcome.
 *
 * Two questions, in order, and the order matters:
 *
 *  1. COULD the holder still be working? A claim younger than the gateway's own request timeout
 *     may belong to a sale that is in flight right now. The gateway has not booked it yet, so
 *     asking would return "no such order" — the same answer it gives when the request never
 *     arrived. Acting on that ambiguity is a double charge, so a young claim is left untouched.
 *  2. Only once the window has closed: what does the GATEWAY say? It is the only thing that
 *     knows whether money moved, and it is asked by our own order id. Nothing below infers an
 *     outcome from elapsed time — the clock decides only whether it is safe to look.
 */
async function resolveInFlightCharge(
  order: OrderWithLines,
  paymentToken: string,
  claimedAt: Date,
  deps: ChargeDeps,
): Promise<CheckoutSuccess | CheckoutFailure> {
  const ambiguous = (reason: AmbiguousPaymentReason): CheckoutFailure => ({
    ok: false,
    code: ApiErrorCode.PAYMENT_FAILED,
    message: AMBIGUOUS_PAYMENT_MESSAGE,
    details: { reason },
  });

  // (1) The holder may still be mid-flight. Touch nothing — not the gateway, not the claim.
  if (deps.now() - claimedAt.getTime() < CHARGE_RECOVERY_AFTER_MS) {
    return ambiguous(AmbiguousPaymentReason.CHARGE_IN_PROGRESS);
  }

  // (2) The window has closed. Ask the gateway what actually happened.
  let existingPayment: Awaited<ReturnType<typeof findPaymentByOrderId>>;
  try {
    existingPayment = await deps.findPaymentByOrderId(order.id);
  } catch {
    // We could not ask. Failing closed is the only safe answer: charging now risks doubling a
    // payment that may already exist.
    return ambiguous(AmbiguousPaymentReason.RECOVERY_UNAVAILABLE);
  }

  if (!existingPayment) {
    // No record after the in-flight window has passed, so the previous attempt never reached the
    // gateway. Release THIS claim specifically — `releaseChargeClaim` matches the exact timestamp
    // we observed, so a claim taken since we looked is left alone — then re-claim and charge.
    const released = await releaseChargeClaim(order.id, claimedAt);
    if (!released) return ambiguous(AmbiguousPaymentReason.CHARGE_IN_PROGRESS);

    const reclaim = await claimOrderForCharge(order.id);
    if (reclaim.kind !== "claimed") return ambiguous(AmbiguousPaymentReason.CHARGE_IN_PROGRESS);
    return chargeClaimedOrder(reclaim.order, paymentToken, deps);
  }

  if (existingPayment.amountCents !== order.totalCents) {
    // A sale exists for this order but not for this price. Never charge again, never mark paid;
    // a human has to look at it.
    await prisma.backgroundJob.create({
      data: {
        type: JobType.ALERT_MANAGER_PAYMENT_DISCREPANCY,
        status: JobStatus.PENDING,
        payload: {
          orderId: order.id,
          paymentId: existingPayment.paymentId,
          orderTotalCents: order.totalCents,
          gatewayAmountCents: existingPayment.amountCents,
          reason: "Recovered gateway sale does not match order total",
        },
      },
    });
    return ambiguous(AmbiguousPaymentReason.AMOUNT_MISMATCH);
  }

  // The money moved and the amount is right — the previous attempt succeeded and died before it
  // could say so. Finish what it started instead of charging again.
  if (existingPayment.status === "completed") {
    return finalisePaidOrder(
      order.id,
      { paymentId: existingPayment.paymentId, cardLast4: existingPayment.cardLast4 },
      deps,
    );
  }

  // A sale exists but is not (yet) good — failed, pending, or something we do not recognise.
  // Record the pointer so reconciliation can find it, and leave the claim in place.
  await markOrderPaymentUnknown(order.id, { processorPaymentId: existingPayment.paymentId });
  return ambiguous(AmbiguousPaymentReason.GATEWAY_SALE_INCOMPLETE);
}

/** Send the sale. Only ever reached holding the claim for this order. */
async function chargeClaimedOrder(
  order: OrderWithLines,
  paymentToken: string,
  deps: ChargeDeps,
): Promise<CheckoutSuccess | CheckoutFailure> {
  const outcome = await deps.createPayment({
    paymentToken,
    correlationId: paymentCorrelationId(order.id),
    amountCents: order.totalCents,
    orderId: order.id,
    orderReference: order.id,
  });

  if (outcome.kind === "succeeded") {
    return finalisePaidOrder(
      order.id,
      { paymentId: outcome.paymentId, cardLast4: outcome.cardLast4 },
      deps,
    );
  }

  if (outcome.kind === "declined") {
    // Definite: no money moved. This releases the claim, so the customer can retry with
    // another card on a new order.
    await markOrderPaymentFailed(order.id, {
      processorPaymentId: outcome.paymentId,
      reason: outcome.reason,
    });
    return {
      ok: false,
      code: ApiErrorCode.PAYMENT_DECLINED,
      message: outcome.reason,
      details: { declineCode: outcome.code },
    };
  }

  // transport_failure — do not assume no charge. The claim is deliberately NOT released: the
  // recovery path above will ask the gateway what actually happened.
  await markOrderPaymentUnknown(order.id, {
    processorPaymentId: outcome.paymentId,
  });
  return {
    ok: false,
    code: ApiErrorCode.PAYMENT_FAILED,
    message: AMBIGUOUS_PAYMENT_MESSAGE,
    details: { reason: AmbiguousPaymentReason.GATEWAY_UNCONFIRMED },
  };
}

/** Record the payment id, then allocate the number and enqueue fulfilment. */
async function finalisePaidOrder(
  orderId: string,
  payment: { paymentId: string; cardLast4: string | null },
  deps: ChargeDeps,
): Promise<CheckoutSuccess> {
  const printers = getPrinterConfig();
  // Record payment id BEFORE allocate/paid — crash recovery relies on this. It also clears the
  // charge claim, which is what retires this order from the recovery path for good.
  await recordProcessorPaymentId(orderId, payment.paymentId);
  const paid = await markOrderPaidAndAllocate(orderId, {
    paymentId: payment.paymentId,
    // The INJECTED clock, not `new Date()`. This instant decides the business date the order
    // number is allocated under, so a test using the wall clock burns real numbers out of
    // today's counter — which never rolls back, because an order number must never be reused.
    // Tests pin it to a far-future date and allocate from a throwaway counter row instead.
    paidAt: new Date(deps.now()),
    kitchenSerial: printers.kitchenSerial,
    counterSerial: printers.counterSerial,
    printMaxAttempts: printers.maxAttempts,
    cardLast4: payment.cardLast4,
    correlationId: getRequestId() ?? null,
  });
  return { ok: true, order: toCheckoutOrderResponse(paid), replay: false };
}

export { getPublicOrderView };
