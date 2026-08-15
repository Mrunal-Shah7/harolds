// SPRINT-3: pure quote orchestrator — no I/O, no clock read except store.now, no DB.
import type {
  CartRequest,
  CartValidationReason,
  QuoteResult,
} from "@harolds/types";
import type { MenuCatalog } from "./menu-data";
import { evaluateOrderability } from "./orderability";
import { priceLines } from "./price-lines";
import { computeTotals } from "./totals";
import { validateCart } from "./validate";

export type QuoteStoreContext = {
  taxRateBps: number;
  taxAppliedPreDiscount: boolean;
  tippingEnabled: boolean;
  tipPresetsBps: number[];
  isOpen: boolean;
  acceptingOrders: boolean;
  prepMinutes: number;
  /** Injected clock — the engine never calls Date.now(). */
  now: Date;
};

export type QuoteInput = {
  /** Already structurally parsed (parseCartRequest). */
  cart: CartRequest;
  catalog: MenuCatalog;
  store: QuoteStoreContext;
};

export type QuoteOk = { ok: true; result: QuoteResult };
export type QuoteErr = { ok: false; reasons: CartValidationReason[] };

/**
 * Pure pricing engine entry point.
 * Validation → line pricing → totals → orderability → estimatedReadyAt.
 */
export function quoteCart(input: QuoteInput): QuoteOk | QuoteErr {
  const { cart, catalog, store } = input;

  const validationReasons = validateCart(cart, catalog);
  if (validationReasons.length > 0) {
    return { ok: false, reasons: validationReasons };
  }

  const lines = priceLines(cart, catalog);

  const totals = computeTotals(lines, cart.tip, {
    taxRateBps: store.taxRateBps,
    taxAppliedPreDiscount: store.taxAppliedPreDiscount,
    tippingEnabled: store.tippingEnabled,
    tipPresetsBps: store.tipPresetsBps,
  });

  if (!totals.ok) {
    return { ok: false, reasons: totals.reasons };
  }

  const { orderable, blockingReasons } = evaluateOrderability({
    isOpen: store.isOpen,
    acceptingOrders: store.acceptingOrders,
  });

  const estimatedReadyAt = new Date(
    store.now.getTime() + store.prepMinutes * 60_000,
  ).toISOString();

  const result: QuoteResult = {
    lines,
    subtotalCents: totals.subtotalCents,
    taxCents: totals.taxCents,
    taxRateBps: totals.taxRateBps,
    taxAppliedPreDiscount: totals.taxAppliedPreDiscount,
    tip: totals.tip,
    totalCents: totals.totalCents,
    orderable,
    blockingReasons,
    estimatedReadyAt,
  };

  return { ok: true, result };
}
