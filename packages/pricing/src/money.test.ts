// SPRINT-3: money primitive tests — half-up tax, order-independent sums, bounds.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_MONEY_CENTS,
  MoneyError,
  applyBasisPoints,
  multiplyCents,
  sumCents,
} from "./money";

/** Hand-verified: tax = round_half_up(amount * 1010 / 10000) */
const TAX_1010_CASES: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [50, 5],
  [100, 10],
  [199, 20],
  [449, 45],
  [500, 51], // exact half: 50.5 → 51
  [879, 89],
  [999, 101],
  [1149, 116],
  [1500, 152], // exact half: 151.5 → 152
  [6499, 656],
  [10_000, 1010],
];

describe("applyBasisPoints", () => {
  it("matches hand-verified 1010 bps tax cases including exact halves", () => {
    for (const [amount, expected] of TAX_1010_CASES) {
      assert.equal(
        applyBasisPoints(amount, 1010),
        expected,
        `tax on ${amount} should be ${expected}`,
      );
    }
  });

  it("finds exact-half amounts where (n*1010) % 10000 === 5000", () => {
    const halves: number[] = [];
    for (let n = 1; n <= 5000; n++) {
      if ((n * 1010) % 10000 === 5000) halves.push(n);
    }
    assert.ok(halves.length >= 2, "need at least two exact-half amounts");
    // 500 → 50.5, 1500 → 151.5
    assert.ok(halves.includes(500));
    assert.ok(halves.includes(1500));
    for (const n of halves.slice(0, 5)) {
      const product = n * 1010;
      assert.equal(product % 10000, 5000);
      const expected = Math.floor(product / 10000) + 1; // half-up away from floor
      assert.equal(applyBasisPoints(n, 1010), expected);
    }
  });

  it("returns 0 for zero rate or zero amount", () => {
    assert.equal(applyBasisPoints(0, 1010), 0);
    assert.equal(applyBasisPoints(879, 0), 0);
    assert.equal(applyBasisPoints(0, 0), 0);
  });

  it("rejects negatives and non-integers", () => {
    assert.throws(() => applyBasisPoints(-1, 1010), MoneyError);
    assert.throws(() => applyBasisPoints(1.5, 1010), MoneyError);
    assert.throws(() => applyBasisPoints(100, -1), MoneyError);
  });

  it("enforces MAX_MONEY_CENTS on input", () => {
    assert.equal(applyBasisPoints(MAX_MONEY_CENTS, 0), 0);
    assert.throws(() => applyBasisPoints(MAX_MONEY_CENTS + 1, 0), MoneyError);
  });
});

describe("sumCents", () => {
  it("is order-independent", () => {
    const a = [1, 2, 3, 100, 879, 1149];
    const b = [...a].reverse();
    const c = [879, 1, 1149, 3, 100, 2];
    assert.equal(sumCents(a), sumCents(b));
    assert.equal(sumCents(a), sumCents(c));
  });

  it("rejects negatives and enforces running bound", () => {
    assert.throws(() => sumCents([-1]), MoneyError);
    assert.throws(() => sumCents([MAX_MONEY_CENTS, 1]), MoneyError);
  });

  it("sums empty list to 0", () => {
    assert.equal(sumCents([]), 0);
  });
});

describe("multiplyCents", () => {
  it("multiplies exactly with no rounding", () => {
    assert.equal(multiplyCents(879, 3), 2637);
    assert.equal(multiplyCents(1149 + 449, 2), 3196);
    assert.equal(multiplyCents(0, 10), 0);
    assert.equal(multiplyCents(100, 0), 0);
  });

  it("rejects negatives and overflow past MAX_MONEY_CENTS", () => {
    assert.throws(() => multiplyCents(-1, 1), MoneyError);
    assert.throws(() => multiplyCents(1, -1), MoneyError);
    assert.throws(() => multiplyCents(MAX_MONEY_CENTS, 2), MoneyError);
  });
});
