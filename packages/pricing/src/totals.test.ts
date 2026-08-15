// SPRINT-3: Phase 6 totals — post-tax tip proof, tip forms, tipping disabled.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CartValidationReasonCode, type PricedLine } from "@harolds/types";
import { applyBasisPoints } from "./money";
import { computeTotals } from "./totals";

function line(total: number): PricedLine {
  return {
    itemId: "x",
    snapshot: {
      itemName: "x",
      boardLabel: null,
      baseUnitPriceCents: total,
      modifierTotalCents: 0,
      effectiveUnitPriceCents: total,
      quantity: 1,
      lineTotalCents: total,
      selectedModifiers: [],
      customerNote: null,
    },
  };
}

const baseConfig = {
  taxRateBps: 1010,
  taxAppliedPreDiscount: true,
  tippingEnabled: true,
  tipPresetsBps: [1500, 1800, 2000, 2500],
};

describe("computeTotals", () => {
  it("tax on zero subtotal is zero; total equals parts", () => {
    const r = computeTotals([], undefined, baseConfig);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.subtotalCents, 0);
    assert.equal(r.taxCents, 0);
    assert.equal(r.tip.type, "none");
    assert.equal(r.totalCents, 0);
    assert.equal(r.taxRateBps, 1010);
    assert.equal(r.taxAppliedPreDiscount, true);
  });

  it("hand-verified tax at 1010 bps for many subtotals", () => {
    for (const sub of [100, 199, 449, 500, 879, 1149, 1500, 6499]) {
      const r = computeTotals([line(sub)], undefined, baseConfig);
      assert.equal(r.ok, true);
      if (!r.ok) return;
      assert.equal(r.taxCents, applyBasisPoints(sub, 1010));
      assert.equal(r.totalCents, r.subtotalCents + r.taxCents + r.tip.tipCents);
    }
  });

  it("percentage tip is calculated on post-tax (differs from pre-tax by ≥1¢)", () => {
    const sub = 879;
    const tax = applyBasisPoints(sub, 1010); // 89
    const rateBps = 1800;
    const postTaxTip = applyBasisPoints(sub + tax, rateBps);
    const preTaxTip = applyBasisPoints(sub, rateBps);
    assert.ok(
      Math.abs(postTaxTip - preTaxTip) >= 1,
      `need post-tax ≠ pre-tax tip; got post=${postTaxTip} pre=${preTaxTip}`,
    );

    const r = computeTotals([line(sub)], { type: "rate", rateBps }, baseConfig);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.tip.type, "rate");
    if (r.tip.type === "rate") {
      assert.equal(r.tip.tipCents, postTaxTip);
      assert.notEqual(r.tip.tipCents, preTaxTip);
    }
    assert.equal(r.totalCents, sub + tax + postTaxTip);
  });

  it("resolves all three tip forms and rejects out-of-range preset", () => {
    const sub = 1000;
    const tax = applyBasisPoints(sub, 1010);

    const preset = computeTotals([line(sub)], { type: "preset", presetIndex: 1 }, baseConfig);
    assert.equal(preset.ok, true);
    if (preset.ok) {
      assert.equal(preset.tip.type, "preset");
      if (preset.tip.type === "preset") {
        assert.equal(preset.tip.rateBps, 1800);
        assert.equal(preset.tip.tipCents, applyBasisPoints(sub + tax, 1800));
      }
    }

    const rate = computeTotals([line(sub)], { type: "rate", rateBps: 2000 }, baseConfig);
    assert.equal(rate.ok, true);

    const amount = computeTotals([line(sub)], { type: "amount", amountCents: 250 }, baseConfig);
    assert.equal(amount.ok, true);
    if (amount.ok) {
      assert.equal(amount.tip.type, "amount");
      assert.equal(amount.tip.tipCents, 250);
      assert.equal(amount.totalCents, sub + tax + 250);
    }

    const zero = computeTotals([line(sub)], { type: "amount", amountCents: 0 }, baseConfig);
    assert.equal(zero.ok, true);
    if (zero.ok) {
      assert.equal(zero.tip.type, "amount");
      assert.equal(zero.tip.tipCents, 0);
    }

    const bad = computeTotals([line(sub)], { type: "preset", presetIndex: 99 }, baseConfig);
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      assert.equal(bad.reasons[0]!.code, CartValidationReasonCode.TIP_PRESET_INVALID);
    }
  });

  it("rejects any tip when tipping is disabled", () => {
    const cfg = { ...baseConfig, tippingEnabled: false };
    for (const tip of [
      { type: "amount" as const, amountCents: 0 },
      { type: "rate" as const, rateBps: 1500 },
      { type: "preset" as const, presetIndex: 0 },
    ]) {
      const r = computeTotals([line(879)], tip, cfg);
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.equal(r.reasons[0]!.code, CartValidationReasonCode.TIP_DISABLED);
      }
    }
  });
});
