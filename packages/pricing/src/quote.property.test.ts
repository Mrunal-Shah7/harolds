// SPRINT-3: property tests across a generated range of carts (≥100 cases).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CartRequest } from "@harolds/types";
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
  buildTestCatalog,
} from "./test-fixtures";

const catalog = buildTestCatalog();

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Template = {
  itemId: string;
  optionSets: string[][];
};

const TEMPLATES: Template[] = [
  { itemId: ITEM_PLAIN, optionSets: [[]] },
  { itemId: ITEM_CATERING, optionSets: [[]] },
  { itemId: ITEM_CHEAP, optionSets: [[]] },
  {
    itemId: ITEM_WINGS,
    optionSets: [[OPT_MILD], [OPT_HOT], [OPT_MILD, OPT_FRIES], [OPT_HOT, OPT_CHEESE]],
  },
  {
    itemId: ITEM_HALF_CHICKEN,
    optionSets: [[], [OPT_FRIES], [OPT_CHEESE], [OPT_FRIES, OPT_CHEESE]],
  },
];

function randomCart(rng: () => number): CartRequest {
  const lineCount = 1 + Math.floor(rng() * 4);
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    const t = TEMPLATES[Math.floor(rng() * TEMPLATES.length)]!;
    const opts = t.optionSets[Math.floor(rng() * t.optionSets.length)]!;
    lines.push({
      itemId: t.itemId,
      quantity: 1 + Math.floor(rng() * 5),
      selectedOptionIds: [...opts],
    });
  }
  const tipRoll = rng();
  if (tipRoll < 0.25) return { lines };
  if (tipRoll < 0.5) return { lines, tip: { type: "amount", amountCents: Math.floor(rng() * 500) } };
  if (tipRoll < 0.75) {
    return { lines, tip: { type: "rate", rateBps: [1000, 1500, 1800, 2000][Math.floor(rng() * 4)]! } };
  }
  return { lines, tip: { type: "preset", presetIndex: Math.floor(rng() * 4) } };
}

describe("quoteCart property suite", () => {
  it("invariants hold across ≥100 generated carts", () => {
    const rng = mulberry32(42);
    let okCount = 0;

    for (let i = 0; i < 120; i++) {
      const cart = randomCart(rng);
      const quoted = quoteCart({ cart, catalog, store: DEFAULT_STORE });
      assert.equal(quoted.ok, true, `cart ${i} should quote`);
      if (!quoted.ok) continue;
      okCount += 1;
      const { result } = quoted;

      // total === subtotal + tax + tip
      assert.equal(
        result.totalCents,
        result.subtotalCents + result.taxCents + result.tip.tipCents,
      );

      // subtotal === sum of line totals
      const lineSum = result.lines.reduce((s, l) => s + l.snapshot.lineTotalCents, 0);
      assert.equal(result.subtotalCents, lineSum);

      // every monetary value is a non-negative integer
      for (const v of [
        result.subtotalCents,
        result.taxCents,
        result.tip.tipCents,
        result.totalCents,
        ...result.lines.flatMap((l) => [
          l.snapshot.baseUnitPriceCents,
          l.snapshot.modifierTotalCents,
          l.snapshot.effectiveUnitPriceCents,
          l.snapshot.lineTotalCents,
        ]),
      ]) {
        assert.ok(Number.isInteger(v) && v >= 0);
      }

      // reordering lines does not change totals
      const reversed = {
        ...cart,
        lines: [...cart.lines].reverse(),
      };
      const reQuoted = quoteCart({ cart: reversed, catalog, store: DEFAULT_STORE });
      assert.equal(reQuoted.ok, true);
      if (reQuoted.ok) {
        assert.equal(reQuoted.result.subtotalCents, result.subtotalCents);
        assert.equal(reQuoted.result.taxCents, result.taxCents);
        assert.equal(reQuoted.result.tip.tipCents, result.tip.tipCents);
        assert.equal(reQuoted.result.totalCents, result.totalCents);
      }

      // doubling every quantity exactly doubles the subtotal
      const doubled = {
        ...cart,
        lines: cart.lines.map((l) => ({ ...l, quantity: l.quantity * 2 })),
        // keep tip amount fixed — only assert subtotal doubling (not tip/total)
      };
      const dQuoted = quoteCart({
        cart: { lines: doubled.lines },
        catalog,
        store: DEFAULT_STORE,
      });
      assert.equal(dQuoted.ok, true);
      if (dQuoted.ok) {
        assert.equal(dQuoted.result.subtotalCents, result.subtotalCents * 2);
      }
    }

    assert.ok(okCount >= 100, `expected ≥100 successful quotes, got ${okCount}`);
  });
});
