// SPRINT-3: Phase 6 cart totals — subtotal → tax (once) → tip → total by addition of parts.
import {
  CartValidationReasonCode,
  type CartValidationReason,
  type PricedLine,
  type TipApplied,
  type TipRequest,
} from "@harolds/types";
import { applyBasisPoints, MAX_MONEY_CENTS, MoneyError, sumCents } from "./money";

export type TotalsConfig = {
  taxRateBps: number;
  taxAppliedPreDiscount: boolean;
  tippingEnabled: boolean;
  tipPresetsBps: number[];
};

export type TotalsSuccess = {
  ok: true;
  subtotalCents: number;
  taxCents: number;
  tip: TipApplied;
  totalCents: number;
  taxRateBps: number;
  taxAppliedPreDiscount: boolean;
};

export type TotalsFailure = {
  ok: false;
  reasons: CartValidationReason[];
};

function tipReason(
  code: CartValidationReason["code"],
  message: string,
): CartValidationReason {
  return {
    code,
    message,
    lineIndex: null,
    itemId: null,
    groupId: null,
    optionId: null,
    isAvailability: false,
  };
}

/**
 * Exact Phase 6 order:
 * 1. subtotal = sum(line totals)
 * 2. tax = applyBasisPoints(taxBase, rate) once — taxBase honours taxAppliedPreDiscount
 * 3. tip from tip spec (percentage tips on post-tax = subtotal + tax)
 * 4. total = subtotal + tax + tipCents (ADD the parts; never recompute from rates)
 */
export function computeTotals(
  lines: readonly PricedLine[],
  tip: TipRequest | undefined,
  config: TotalsConfig,
): TotalsSuccess | TotalsFailure {
  const subtotalCents = sumCents(lines.map((l) => l.snapshot.lineTotalCents));

  // v1 has no discounts: pre- and post-discount subtotals are identical.
  // Honour the flag so the arithmetic stays correct when discounts arrive.
  const taxBaseCents = config.taxAppliedPreDiscount
    ? subtotalCents
    : subtotalCents; /* post-discount base when discounts exist */

  let taxCents: number;
  try {
    taxCents = applyBasisPoints(taxBaseCents, config.taxRateBps);
  } catch (err) {
    if (err instanceof MoneyError) {
      return {
        ok: false,
        reasons: [tipReason(CartValidationReasonCode.TIP_OUT_OF_RANGE, err.message)],
      };
    }
    throw err;
  }

  if (tip !== undefined && !config.tippingEnabled) {
    return {
      ok: false,
      reasons: [
        tipReason(
          CartValidationReasonCode.TIP_DISABLED,
          "Tipping is disabled for this store; omit tip from the cart",
        ),
      ],
    };
  }

  let tipApplied: TipApplied;
  try {
    tipApplied = resolveTip(tip, subtotalCents, taxCents, config);
  } catch (err) {
    if (err instanceof TipValidationError) {
      return { ok: false, reasons: err.reasons };
    }
    if (err instanceof MoneyError) {
      return {
        ok: false,
        reasons: [
          tipReason(
            CartValidationReasonCode.TIP_OUT_OF_RANGE,
            err.message,
          ),
        ],
      };
    }
    throw err;
  }

  // Grand total by addition of the three stored values — never recomputed from a rate.
  const totalCents = subtotalCents + taxCents + tipApplied.tipCents;
  if (totalCents > MAX_MONEY_CENTS) {
    return {
      ok: false,
      reasons: [
        tipReason(
          CartValidationReasonCode.TIP_OUT_OF_RANGE,
          `Cart total ${totalCents} exceeds maximum allowed monetary value`,
        ),
      ],
    };
  }

  return {
    ok: true,
    subtotalCents,
    taxCents,
    tip: tipApplied,
    totalCents,
    taxRateBps: config.taxRateBps,
    taxAppliedPreDiscount: config.taxAppliedPreDiscount,
  };
}

class TipValidationError extends Error {
  readonly reasons: CartValidationReason[];
  constructor(reasons: CartValidationReason[]) {
    super(reasons[0]?.message ?? "tip validation failed");
    this.name = "TipValidationError";
    this.reasons = reasons;
  }
}

function resolveTip(
  tip: TipRequest | undefined,
  subtotalCents: number,
  taxCents: number,
  config: TotalsConfig,
): TipApplied {
  if (tip === undefined) {
    return { type: "none", tipCents: 0 };
  }

  const postTax = subtotalCents + taxCents;

  if (tip.type === "preset") {
    if (
      !Number.isInteger(tip.presetIndex) ||
      tip.presetIndex < 0 ||
      tip.presetIndex >= config.tipPresetsBps.length
    ) {
      throw new TipValidationError([
        tipReason(
          CartValidationReasonCode.TIP_PRESET_INVALID,
          `tip.presetIndex ${tip.presetIndex} is outside configured presets`,
        ),
      ]);
    }
    const rateBps = config.tipPresetsBps[tip.presetIndex]!;
    const tipCents = applyBasisPoints(postTax, rateBps);
    return { type: "preset", presetIndex: tip.presetIndex, rateBps, tipCents };
  }

  if (tip.type === "rate") {
    // Percentage tip on post-tax (subtotal + tax), rounded once.
    const tipCents = applyBasisPoints(postTax, tip.rateBps);
    return { type: "rate", rateBps: tip.rateBps, tipCents };
  }

  // Fixed amount — no rounding. amountCents: 0 is an explicit zero tip (not absent).
  return { type: "amount", tipCents: tip.amountCents };
}
