// SPRINT-3: Phase 5 line pricing tests.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { priceLines } from "./price-lines";
import {
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

const catalog = buildTestCatalog();

describe("priceLines", () => {
  it("prices a line with no modifiers as base × qty", () => {
    const [line] = priceLines(
      { lines: [{ itemId: ITEM_PLAIN, quantity: 3, selectedOptionIds: [] }] },
      catalog,
    );
    assert.equal(line!.snapshot.baseUnitPriceCents, 879);
    assert.equal(line!.snapshot.modifierTotalCents, 0);
    assert.equal(line!.snapshot.effectiveUnitPriceCents, 879);
    assert.equal(line!.snapshot.lineTotalCents, 879 * 3);
  });

  it("zero-delta modifiers price identically to no modifiers", () => {
    const withZero = priceLines(
      {
        lines: [
          {
            itemId: ITEM_WINGS,
            quantity: 2,
            selectedOptionIds: [OPT_MILD, OPT_ZERO_A, OPT_ZERO_B],
          },
        ],
      },
      catalog,
    )[0]!;
    const sauceOnly = priceLines(
      {
        lines: [{ itemId: ITEM_WINGS, quantity: 2, selectedOptionIds: [OPT_MILD] }],
      },
      catalog,
    )[0]!;
    assert.equal(withZero.snapshot.effectiveUnitPriceCents, sauceOnly.snapshot.effectiveUnitPriceCents);
    assert.equal(withZero.snapshot.lineTotalCents, sauceOnly.snapshot.lineTotalCents);
    assert.equal(withZero.snapshot.lineTotalCents, 879 * 2);
  });

  it("Add Fries adds 449 per unit", () => {
    const [line] = priceLines(
      {
        lines: [
          {
            itemId: ITEM_WINGS,
            quantity: 2,
            selectedOptionIds: [OPT_HOT, OPT_FRIES],
          },
        ],
      },
      catalog,
    );
    assert.equal(line!.snapshot.modifierTotalCents, 449);
    assert.equal(line!.snapshot.effectiveUnitPriceCents, 879 + 449);
    assert.equal(line!.snapshot.lineTotalCents, (879 + 449) * 2);
  });

  it("Add Cheese adds 119; qty multiplies correctly for real board prices", () => {
    const cases: Array<{ itemId: string; opts: string[]; qty: number; unit: number }> = [
      { itemId: ITEM_PLAIN, opts: [], qty: 4, unit: 879 },
      { itemId: ITEM_HALF_CHICKEN, opts: [OPT_CHEESE], qty: 3, unit: 1149 + 119 },
      { itemId: ITEM_WINGS, opts: [OPT_MILD, OPT_FRIES], qty: 5, unit: 879 + 449 },
    ];
    for (const c of cases) {
      const [line] = priceLines(
        {
          lines: [{ itemId: c.itemId, quantity: c.qty, selectedOptionIds: c.opts }],
        },
        catalog,
      );
      assert.equal(line!.snapshot.effectiveUnitPriceCents, c.unit);
      assert.equal(line!.snapshot.lineTotalCents, c.unit * c.qty);
    }
  });

  it("snapshot modifiers follow group/option sort order, not client order", () => {
    // Client sends cheese before fries; on half-chicken extras, cheese sortOrder=0, fries=1.
    const [line] = priceLines(
      {
        lines: [
          {
            itemId: ITEM_HALF_CHICKEN,
            quantity: 1,
            selectedOptionIds: [OPT_FRIES, OPT_CHEESE],
            customerNote: "extra crispy",
          },
        ],
      },
      catalog,
    );
    assert.deepEqual(
      line!.snapshot.selectedModifiers.map((m) => m.optionName),
      ["Add Cheese", "Add Fries"],
    );
    assert.equal(line!.snapshot.boardLabel, "1/2 Chicken");
    assert.equal(line!.snapshot.customerNote, "extra crispy");
    assert.equal(line!.snapshot.selectedModifiers[0]!.groupName, "extras");
    assert.equal(line!.snapshot.selectedModifiers[0]!.groupPrompt, "Extras");
  });
});
