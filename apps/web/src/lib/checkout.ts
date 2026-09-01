// SPRINT-4: authoritative checkout — reprice, persist, charge, converge with webhooks.
import { createHash } from "node:crypto";
import { getOrderDuplicateGuardWindowMs, getPrinterConfig } from "@harolds/config";
import {
  createPendingOrderGuarded,
  findOrderByIdempotencyKey,
  getPublicOrderView,
  markOrderPaidAndAllocate,
  markOrderPaymentFailed,
  markOrderPaymentUnknown,
  normalizePhoneToE164,
  recordProcessorPaymentId,
  validateEmail,
  fetchItemsForQuote,
  getStoreConfig,
  getStoreStatus,
  type OrderWithLines,
} from "@harolds/db";
import { parseCartRequest, quoteCart, sanitizeKitchenNote, toMenuCatalog } from "@harolds/pricing";
import { createPayment } from "@harolds/square";
import {
  ApiErrorCode,
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
 */
export const AMBIGUOUS_PAYMENT_MESSAGE =
  "We couldn't confirm that payment. Don't try again just yet — check your texts in a minute, or call the store.";

/** Square payment idempotency key — derived from our order id so retries never double-charge. */
export function squarePaymentIdempotencyKey(orderId: string): string {
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
  if (typeof c.smsConsent !== "boolean") {
    return {
      ok: false,
      failure: {
        ok: false,
        code: ApiErrorCode.VALIDATION_ERROR,
        message: "customer.smsConsent must be an explicit boolean.",
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
      smsConsent: c.smsConsent,
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
        details: null,
      };
    }
    if (existing.paymentStatus === PaymentStatus.FAILED) {
      return {
        ok: false,
        code: ApiErrorCode.PAYMENT_DECLINED,
        message: existing.paymentFailureReason ?? "Payment was declined.",
        details: null,
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

  const smsConsentAt = request.customer.smsConsent ? new Date() : null;

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
      smsConsent: request.customer.smsConsent,
      smsConsentAt,
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
        details: null,
      };
    }
    // Unpaid: continue paying THAT order rather than creating another.
    return chargeExistingPending(guarded.order, request.paymentToken);
  }

  return chargeExistingPending(guarded.order, request.paymentToken);
}

async function chargeExistingPending(
  order: OrderWithLines,
  paymentToken: string,
): Promise<CheckoutSuccess | CheckoutFailure> {
  const printers = getPrinterConfig();
  const outcome = await createPayment({
    sourceId: paymentToken,
    idempotencyKey: squarePaymentIdempotencyKey(order.id),
    amountCents: order.totalCents,
    orderId: order.id,
    orderReference: order.id,
  });

  if (outcome.kind === "succeeded") {
    // Record payment id BEFORE allocate/paid — crash recovery relies on this.
    await recordProcessorPaymentId(order.id, outcome.paymentId);
    const paid = await markOrderPaidAndAllocate(order.id, {
      paymentId: outcome.paymentId,
      paidAt: new Date(),
      kitchenSerial: printers.kitchenSerial,
      counterSerial: printers.counterSerial,
      printMaxAttempts: printers.maxAttempts,
      cardLast4: outcome.cardLast4,
      correlationId: getRequestId() ?? null,
    });
    return { ok: true, order: toCheckoutOrderResponse(paid), replay: false };
  }

  if (outcome.kind === "declined") {
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

  // transport_failure — do not assume no charge
  await markOrderPaymentUnknown(order.id, {
    processorPaymentId: outcome.paymentId,
  });
  return {
    ok: false,
    code: ApiErrorCode.PAYMENT_FAILED,
    message: AMBIGUOUS_PAYMENT_MESSAGE,
    details: null,
  };
}

export { getPublicOrderView };
