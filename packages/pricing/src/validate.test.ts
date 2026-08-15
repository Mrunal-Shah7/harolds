// SPRINT-3: Phase 4 validation — every rule, all reasons returned, availability flags.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CartValidationReasonCode, type CartRequest } from "@harolds/types";
import { validateCart } from "./validate";
import {
  ITEM_CHEAP,
  ITEM_INACTIVE,
  ITEM_SOLD_OUT,
  ITEM_WINGS,
  OPT_FRIES,
  OPT_HOT,
  OPT_INACTIVE,
  OPT_MILD,
  OPT_ON_INACTIVE_GROUP,
  OPT_OTHER_ITEM,
  OPT_PAIR_1,
  OPT_SOLD_OUT,
  GROUP_OPTIONAL_MIN2,
  GROUP_SAUCE,
  GROUP_SIDES,
  buildTestCatalog,
} from "./test-fixtures";

const catalog = buildTestCatalog();

function codes(cart: CartRequest) {
  return validateCart(cart, catalog).map((r) => r.code);
}

describe("validateCart Phase 4 rules", () => {
  it("ITEM_NOT_FOUND for missing id", () => {
    const reasons = validateCart(
      { lines: [{ itemId: "nope", quantity: 1, selectedOptionIds: [] }] },
      catalog,
    );
    assert.deepEqual(
      reasons.map((r) => r.code),
      [CartValidationReasonCode.ITEM_NOT_FOUND],
    );
    assert.equal(reasons[0]!.isAvailability, true);
  });

  it("inactive item produces identical ITEM_NOT_FOUND to missing (byte-for-byte shape)", () => {
    const missing = validateCart(
      { lines: [{ itemId: "does-not-exist", quantity: 1, selectedOptionIds: [] }] },
      catalog,
    );
    const inactive = validateCart(
      { lines: [{ itemId: ITEM_INACTIVE, quantity: 1, selectedOptionIds: [] }] },
      catalog,
    );
    assert.equal(missing.length, 1);
    assert.equal(inactive.length, 1);
    assert.equal(missing[0]!.code, inactive[0]!.code);
    assert.equal(missing[0]!.message, inactive[0]!.message);
    assert.equal(missing[0]!.isAvailability, inactive[0]!.isAvailability);
    assert.equal(missing[0]!.groupId, inactive[0]!.groupId);
    assert.equal(missing[0]!.optionId, inactive[0]!.optionId);
    // itemId differs (requested id) — code+message+flags are identical
  });

  it("ITEM_SOLD_OUT", () => {
    assert.ok(codes({ lines: [{ itemId: ITEM_SOLD_OUT, quantity: 1, selectedOptionIds: [] }] }).includes(
      CartValidationReasonCode.ITEM_SOLD_OUT,
    ));
  });

  it("OPTION_NOT_FOUND", () => {
    assert.ok(
      codes({
        lines: [{ itemId: ITEM_WINGS, quantity: 1, selectedOptionIds: [OPT_MILD, "opt-ghost"] }],
      }).includes(CartValidationReasonCode.OPTION_NOT_FOUND),
    );
  });

  it("OPTION_INACTIVE", () => {
    assert.ok(
      codes({
        lines: [{ itemId: ITEM_WINGS, quantity: 1, selectedOptionIds: [OPT_INACTIVE] }],
      }).includes(CartValidationReasonCode.OPTION_INACTIVE),
    );
  });

  it("OPTION_SOLD_OUT", () => {
    assert.ok(
      codes({
        lines: [{ itemId: ITEM_WINGS, quantity: 1, selectedOptionIds: [OPT_SOLD_OUT] }],
      }).includes(CartValidationReasonCode.OPTION_SOLD_OUT),
    );
  });

  it("OPTION_NOT_BOUND — option from another item's group", () => {
    const reasons = validateCart(
      {
        lines: [
          {
            itemId: ITEM_WINGS,
            quantity: 1,
            selectedOptionIds: [OPT_MILD, OPT_OTHER_ITEM],
          },
        ],
      },
      catalog,
    );
    assert.ok(reasons.some((r) => r.code === CartValidationReasonCode.OPTION_NOT_BOUND));
    assert.equal(reasons.find((r) => r.code === CartValidationReasonCode.OPTION_NOT_BOUND)!.optionId, OPT_OTHER_ITEM);
  });

  it("GROUP_INACTIVE", () => {
    assert.ok(
      codes({
        lines: [
          {
            itemId: ITEM_WINGS,
            quantity: 1,
            selectedOptionIds: [OPT_MILD, OPT_ON_INACTIVE_GROUP],
          },
        ],
      }).includes(CartValidationReasonCode.GROUP_INACTIVE),
    );
  });

  it("DUPLICATE_OPTION", () => {
    assert.ok(
      codes({
        lines: [{ itemId: ITEM_WINGS, quantity: 1, selectedOptionIds: [OPT_MILD, OPT_MILD] }],
      }).includes(CartValidationReasonCode.DUPLICATE_OPTION),
    );
  });

  it("BELOW_MIN_SELECT for required group", () => {
    const reasons = validateCart(
      { lines: [{ itemId: ITEM_WINGS, quantity: 1, selectedOptionIds: [] }] },
      catalog,
    );
    const hit = reasons.find((r) => r.code === CartValidationReasonCode.BELOW_MIN_SELECT);
    assert.ok(hit);
    assert.equal(hit!.groupId, GROUP_SAUCE);
  });

  it("ABOVE_MAX_SELECT", () => {
    const reasons = validateCart(
      {
        lines: [
          {
            itemId: ITEM_WINGS,
            quantity: 1,
            selectedOptionIds: [OPT_MILD, OPT_HOT],
          },
        ],
      },
      catalog,
    );
    assert.ok(reasons.some((r) => r.code === CartValidationReasonCode.ABOVE_MAX_SELECT));
    assert.equal(
      reasons.find((r) => r.code === CartValidationReasonCode.ABOVE_MAX_SELECT)!.groupId,
      GROUP_SAUCE,
    );
  });

  it("BELOW_MIN_SELECT for optional group started but unfinished", () => {
    const reasons = validateCart(
      {
        lines: [
          {
            itemId: ITEM_CHEAP,
            quantity: 1,
            selectedOptionIds: [OPT_PAIR_1],
          },
        ],
      },
      catalog,
    );
    const hit = reasons.find((r) => r.code === CartValidationReasonCode.BELOW_MIN_SELECT);
    assert.ok(hit);
    assert.equal(hit!.groupId, GROUP_OPTIONAL_MIN2);
  });

  it("returns every problem in a multi-issue cart (not just the first)", () => {
    const reasons = validateCart(
      {
        lines: [
          {
            itemId: ITEM_WINGS,
            quantity: 1,
            selectedOptionIds: [OPT_SOLD_OUT, OPT_OTHER_ITEM, OPT_FRIES, OPT_FRIES],
          },
          { itemId: "missing", quantity: 1, selectedOptionIds: [] },
          { itemId: ITEM_SOLD_OUT, quantity: 1, selectedOptionIds: [] },
        ],
      },
      catalog,
    );
    assert.ok(reasons.length >= 3);
    const set = new Set(reasons.map((r) => r.code));
    assert.ok(set.has(CartValidationReasonCode.OPTION_SOLD_OUT));
    assert.ok(set.has(CartValidationReasonCode.OPTION_NOT_BOUND));
    assert.ok(set.has(CartValidationReasonCode.DUPLICATE_OPTION));
    assert.ok(set.has(CartValidationReasonCode.ITEM_NOT_FOUND));
    assert.ok(set.has(CartValidationReasonCode.ITEM_SOLD_OUT));
  });

  it("accepts a legal wings line", () => {
    const reasons = validateCart(
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
    assert.deepEqual(reasons, []);
  });

  it("marks availability reasons via isAvailability", () => {
    const reasons = validateCart(
      {
        lines: [
          { itemId: ITEM_SOLD_OUT, quantity: 1, selectedOptionIds: [] },
          {
            itemId: ITEM_WINGS,
            quantity: 1,
            selectedOptionIds: [OPT_SOLD_OUT],
          },
        ],
      },
      catalog,
    );
    for (const r of reasons) {
      if (
        r.code === CartValidationReasonCode.ITEM_SOLD_OUT ||
        r.code === CartValidationReasonCode.OPTION_SOLD_OUT
      ) {
        assert.equal(r.isAvailability, true);
      }
    }
  });

  it("SIDE group max allows fries alone with sauce", () => {
    assert.deepEqual(
      validateCart(
        {
          lines: [
            {
              itemId: ITEM_WINGS,
              quantity: 1,
              selectedOptionIds: [OPT_MILD, OPT_FRIES],
            },
          ],
        },
        catalog,
      ),
      [],
    );
    void GROUP_SIDES;
  });
});
