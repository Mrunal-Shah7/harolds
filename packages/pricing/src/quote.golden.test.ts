// SPRINT-3: golden quote cases — hand-verified Harold's board prices.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyBasisPoints } from "./money";
import { quoteCart } from "./quote";
import {
  DEFAULT_STORE,
  ITEM_CATERING,
  ITEM_CHEAP,
  ITEM_HALF_CHICKEN,
  ITEM_PLAIN,
  ITEM_WINGS,
  OPT_CHEESE,
  OPT_FRIES,
  OPT_HOT,
  OPT_MILD,
  OPT_ZERO_A,
  OPT_ZERO_B,
  buildTestCatalog,
} from "./test-fixtures";
import { ApiErrorCode } from "@harolds/types";

const catalog = buildTestCatalog();

describe("quoteCart golden cases", () => {
  it("single plain item 879 — no modifiers", () => {
    const r = quoteCart({
      cart: { lines: [{ itemId: ITEM_PLAIN, quantity: 1, selectedOptionIds: [] }] },
      catalog,
      store: DEFAULT_STORE,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.result.subtotalCents, 879);
    assert.equal(r.result.taxCents, 89);
    assert.equal(r.result.tip.tipCents, 0);
    assert.equal(r.result.totalCents, 879 + 89);
    assert.equal(r.result.orderable, true);
    assert.deepEqual(r.result.blockingReasons, []);
    assert.equal(r.result.estimatedReadyAt, "2026-08-09T18:20:00.000Z");
  });

  it("single item with several zero-delta modifiers", () => {
    const r = quoteCart({
      cart: {
        lines: [
          {
            itemId: ITEM_WINGS,
            quantity: 1,
            selectedOptionIds: [OPT_MILD, OPT_ZERO_A, OPT_ZERO_B],
          },
        ],
      },
      catalog,
      store: DEFAULT_STORE,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.result.subtotalCents, 879);
    assert.equal(r.result.taxCents, 89);
    assert.equal(r.result.totalCents, 968);
  });

  it("Add Fries (+449)", () => {
    const unit = 879 + 449;
    const r = quoteCart({
      cart: {
        lines: [
          {
            itemId: ITEM_WINGS,
            quantity: 1,
            selectedOptionIds: [OPT_HOT, OPT_FRIES],
          },
        ],
      },
      catalog,
      store: DEFAULT_STORE,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.result.subtotalCents, unit);
    assert.equal(r.result.taxCents, applyBasisPoints(unit, 1010)); // 134
    assert.equal(r.result.taxCents, 134);
    assert.equal(r.result.totalCents, unit + 134);
  });

  it("Add Cheese (+119)", () => {
    const unit = 1149 + 119;
    const r = quoteCart({
      cart: {
        lines: [
          {
            itemId: ITEM_HALF_CHICKEN,
            quantity: 1,
            selectedOptionIds: [OPT_CHEESE],
          },
        ],
      },
      catalog,
      store: DEFAULT_STORE,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.result.subtotalCents, unit);
    assert.equal(r.result.taxCents, 128);
    assert.equal(r.result.totalCents, unit + 128);
  });

  it("multi-line mix with quantities and preset tip", () => {
    // line0: wings×2 + fries = (879+449)*2 = 2656
    // line1: half×1 + cheese = 1268
    // line2: plain×3 = 2637
    // sub = 2656+1268+2637 = 6561
    const sub = 6561;
    const tax = applyBasisPoints(sub, 1010);
    const tip = applyBasisPoints(sub + tax, 1800); // preset index 1
    const r = quoteCart({
      cart: {
        lines: [
          {
            itemId: ITEM_WINGS,
            quantity: 2,
            selectedOptionIds: [OPT_MILD, OPT_FRIES],
          },
          {
            itemId: ITEM_HALF_CHICKEN,
            quantity: 1,
            selectedOptionIds: [OPT_CHEESE],
          },
          { itemId: ITEM_PLAIN, quantity: 3, selectedOptionIds: [] },
        ],
        tip: { type: "preset", presetIndex: 1 },
      },
      catalog,
      store: DEFAULT_STORE,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.result.subtotalCents, sub);
    assert.equal(r.result.taxCents, tax);
    assert.equal(r.result.tip.tipCents, tip);
    assert.equal(r.result.totalCents, sub + tax + tip);
  });

  it("catering large end 6499", () => {
    const r = quoteCart({
      cart: { lines: [{ itemId: ITEM_CATERING, quantity: 1, selectedOptionIds: [] }] },
      catalog,
      store: DEFAULT_STORE,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.result.subtotalCents, 6499);
    assert.equal(r.result.taxCents, 656);
    assert.equal(r.result.totalCents, 7155);
  });

  it("cheapest item small-end rounding (199)", () => {
    const r = quoteCart({
      cart: { lines: [{ itemId: ITEM_CHEAP, quantity: 1, selectedOptionIds: [] }] },
      catalog,
      store: DEFAULT_STORE,
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.result.subtotalCents, 199);
    assert.equal(r.result.taxCents, 20);
    assert.equal(r.result.totalCents, 219);
  });

  it("store closed + not accepting → priced but unorderable with both reasons", () => {
    const r = quoteCart({
      cart: { lines: [{ itemId: ITEM_PLAIN, quantity: 1, selectedOptionIds: [] }] },
      catalog,
      store: { ...DEFAULT_STORE, isOpen: false, acceptingOrders: false },
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.result.totalCents, 968);
    assert.equal(r.result.orderable, false);
    assert.deepEqual(r.result.blockingReasons, [
      ApiErrorCode.STORE_CLOSED,
      ApiErrorCode.STORE_NOT_ACCEPTING_ORDERS,
    ]);
  });
});
