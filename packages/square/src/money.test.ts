// SPRINT-4: money boundary tests — integer cents in, bigint Money out, and back.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fromSquareMoney, SquareMoneyError, toSquareMoney } from "./money";

describe("toSquareMoney", () => {
  it("converts positive integer cents to a bigint USD Money value", () => {
    assert.deepEqual(toSquareMoney(1234), { amount: 1234n, currency: "USD" });
  });

  it("rejects zero, negative, and non-integer amounts", () => {
    assert.throws(() => toSquareMoney(0), SquareMoneyError);
    assert.throws(() => toSquareMoney(-5), SquareMoneyError);
    assert.throws(() => toSquareMoney(1.5), SquareMoneyError);
  });
});

describe("fromSquareMoney", () => {
  it("converts a Square Money value back to integer cents", () => {
    assert.equal(fromSquareMoney({ amount: 4200n, currency: "USD" }), 4200);
  });

  it("rejects missing amounts and non-USD currencies", () => {
    assert.throws(() => fromSquareMoney(undefined), SquareMoneyError);
    assert.throws(() => fromSquareMoney({ amount: undefined }), SquareMoneyError);
    assert.throws(() => fromSquareMoney({ amount: 100n, currency: "EUR" }), SquareMoneyError);
  });
});
