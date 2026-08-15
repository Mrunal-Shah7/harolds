// SPRINT-3: adversarial inputs — validation errors, never uncaught throws / 500-style failures.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CART_LIMITS, CartValidationReasonCode } from "@harolds/types";
import { parseCartRequest } from "./parse-cart";
import { quoteCart } from "./quote";
import { validateCart } from "./validate";
import {
  DEFAULT_STORE,
  ITEM_PLAIN,
  ITEM_WINGS,
  OPT_MILD,
  OPT_OTHER_ITEM,
  buildTestCatalog,
} from "./test-fixtures";

const catalog = buildTestCatalog();

function assertNoThrow(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    assert.fail(`should not throw, got ${(err as Error).message}`);
  }
}

describe("adversarial inputs", () => {
  it("rejects injected price fields", () => {
    assertNoThrow(() => {
      const r = parseCartRequest({
        lines: [{ itemId: ITEM_PLAIN, quantity: 1, selectedOptionIds: [], basePriceCents: 1 }],
        totalCents: 999,
        subtotal: 1,
        tax: 1,
      });
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.ok(
          r.reasons.some((x) => x.code === CartValidationReasonCode.PRICE_FIELD_FORBIDDEN),
        );
      }
    });
  });

  it("allows tip.amountCents when tip.type===amount, distinguishes absent vs zero", () => {
    const absent = parseCartRequest({
      lines: [{ itemId: ITEM_PLAIN, quantity: 1, selectedOptionIds: [] }],
    });
    assert.equal(absent.ok, true);
    if (absent.ok) assert.equal(absent.cart.tip, undefined);

    const zero = parseCartRequest({
      lines: [{ itemId: ITEM_PLAIN, quantity: 1, selectedOptionIds: [] }],
      tip: { type: "amount", amountCents: 0 },
    });
    assert.equal(zero.ok, true);
    if (zero.ok) {
      assert.deepEqual(zero.cart.tip, { type: "amount", amountCents: 0 });
    }
  });

  it("rejects negative, fractional, and string quantities", () => {
    assertNoThrow(() => {
      for (const quantity of [-1, 0, 1.5, "2"]) {
        const r = parseCartRequest({
          lines: [{ itemId: ITEM_PLAIN, quantity, selectedOptionIds: [] }],
        });
        assert.equal(r.ok, false);
      }
    });
  });

  it("rejects option bound to a different item", () => {
    assertNoThrow(() => {
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
    });
  });

  it("rejects option id that is another entity type (item id)", () => {
    assertNoThrow(() => {
      const reasons = validateCart(
        {
          lines: [
            {
              itemId: ITEM_WINGS,
              quantity: 1,
              selectedOptionIds: [OPT_MILD, ITEM_PLAIN],
            },
          ],
        },
        catalog,
      );
      assert.ok(reasons.some((r) => r.code === CartValidationReasonCode.OPTION_NOT_FOUND));
    });
  });

  it("rejects oversized carts at CART_LIMITS boundaries", () => {
    assertNoThrow(() => {
      const tooManyLines = parseCartRequest({
        lines: Array.from({ length: CART_LIMITS.maxLines + 1 }, () => ({
          itemId: ITEM_PLAIN,
          quantity: 1,
          selectedOptionIds: [],
        })),
      });
      assert.equal(tooManyLines.ok, false);
      if (!tooManyLines.ok) {
        assert.ok(
          tooManyLines.reasons.some((r) => r.code === CartValidationReasonCode.TOO_MANY_LINES),
        );
      }

      const atMaxQty = parseCartRequest({
        lines: [
          {
            itemId: ITEM_PLAIN,
            quantity: CART_LIMITS.maxQuantityPerLine,
            selectedOptionIds: [],
          },
        ],
      });
      assert.equal(atMaxQty.ok, true);

      const overQty = parseCartRequest({
        lines: [
          {
            itemId: ITEM_PLAIN,
            quantity: CART_LIMITS.maxQuantityPerLine + 1,
            selectedOptionIds: [],
          },
        ],
      });
      assert.equal(overQty.ok, false);

      const overTip = parseCartRequest({
        lines: [{ itemId: ITEM_PLAIN, quantity: 1, selectedOptionIds: [] }],
        tip: { type: "amount", amountCents: CART_LIMITS.maxTipCents + 1 },
      });
      assert.equal(overTip.ok, false);
      if (!overTip.ok) {
        assert.ok(
          overTip.reasons.some((r) => r.code === CartValidationReasonCode.TIP_OUT_OF_RANGE),
        );
      }

      const overRate = parseCartRequest({
        lines: [{ itemId: ITEM_PLAIN, quantity: 1, selectedOptionIds: [] }],
        tip: { type: "rate", rateBps: CART_LIMITS.maxTipRateBps + 1 },
      });
      assert.equal(overRate.ok, false);
    });
  });

  it("overflow tip rate returns validation-style failure from quote, not throw", () => {
    assertNoThrow(() => {
      // rate at ceiling is ok for parse; huge post-tax * rate may hit MAX_MONEY_CENTS
      const r = quoteCart({
        cart: {
          lines: [
            {
              itemId: ITEM_PLAIN,
              quantity: CART_LIMITS.maxQuantityPerLine,
              selectedOptionIds: [],
            },
          ],
          tip: { type: "rate", rateBps: CART_LIMITS.maxTipRateBps },
        },
        catalog,
        store: DEFAULT_STORE,
      });
      // Either succeeds within bounds or returns ok:false reasons — never throws.
      if (!r.ok) {
        assert.ok(r.reasons.length > 0);
        assert.ok(
          r.reasons.every((x) => typeof x.code === "string" && typeof x.message === "string"),
        );
      } else {
        assert.ok(Number.isInteger(r.result.totalCents));
      }
    });
  });

  it("deeply nested price injection is rejected", () => {
    assertNoThrow(() => {
      const r = parseCartRequest({
        lines: [
          {
            itemId: ITEM_PLAIN,
            quantity: 1,
            selectedOptionIds: [],
            nested: { unitPriceCents: 1 },
          },
        ],
      });
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.ok(
          r.reasons.some((x) => x.code === CartValidationReasonCode.PRICE_FIELD_FORBIDDEN),
        );
      }
    });
  });

  it("non-object body is MALFORMED_BODY", () => {
    assertNoThrow(() => {
      for (const body of [null, 1, "x", []]) {
        const r = parseCartRequest(body);
        assert.equal(r.ok, false);
        if (!r.ok) {
          assert.equal(r.reasons[0]!.code, CartValidationReasonCode.MALFORMED_BODY);
        }
      }
    });
  });
});
