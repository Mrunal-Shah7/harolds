// SPRINT-4 / SPRINT-17: the cents <-> decimal-dollar boundary.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromGatewayAmount, toGatewayAmount, MoneyError } from "./money";

describe("toGatewayAmount", () => {
  it("formats cents as dollars with exactly two decimals", () => {
    assert.equal(toGatewayAmount(1), "0.01");
    assert.equal(toGatewayAmount(50), "0.50");
    assert.equal(toGatewayAmount(100), "1.00");
    assert.equal(toGatewayAmount(1234), "12.34");
    assert.equal(toGatewayAmount(100000), "1000.00");
  });

  it("does not lose a cent on values a float would round wrong", () => {
    // 2015 / 100 is 20.149999999999998 in binary floating point. A naive implementation
    // formats this as "20.14" and undercharges.
    assert.equal(toGatewayAmount(2015), "20.15");
    assert.equal(toGatewayAmount(8895), "88.95");
    assert.equal(toGatewayAmount(70007), "700.07");
  });

  it("rejects non-integer, zero and negative amounts", () => {
    assert.throws(() => toGatewayAmount(10.5), MoneyError);
    assert.throws(() => toGatewayAmount(0), MoneyError);
    assert.throws(() => toGatewayAmount(-100), MoneyError);
  });
});

describe("fromGatewayAmount", () => {
  it("parses dollars back to integer cents", () => {
    assert.equal(fromGatewayAmount("12.34"), 1234);
    assert.equal(fromGatewayAmount("0.01"), 1);
    assert.equal(fromGatewayAmount("1000.00"), 100000);
    assert.equal(fromGatewayAmount("20.15"), 2015);
  });

  it("accepts a whole-dollar or single-decimal amount", () => {
    assert.equal(fromGatewayAmount("7"), 700);
    assert.equal(fromGatewayAmount("7.5"), 750);
  });

  it("returns the MAGNITUDE of a reversal amount", () => {
    // NMI reports a refund action as "-12.34" because it is signed against the merchant's
    // balance. Callers hold unsigned quantities (refundedCents), so a negative here would
    // land a negative refund total in the database.
    assert.equal(fromGatewayAmount("-12.34"), 1234);
  });

  it("rejects missing and malformed amounts rather than defaulting to zero", () => {
    assert.throws(() => fromGatewayAmount(undefined), MoneyError);
    assert.throws(() => fromGatewayAmount(null), MoneyError);
    assert.throws(() => fromGatewayAmount(""), MoneyError);
    assert.throws(() => fromGatewayAmount("abc"), MoneyError);
    // Sub-cent precision is rejected, never rounded.
    assert.throws(() => fromGatewayAmount("12.345"), MoneyError);
  });

  it("round-trips every cent value across a dollar boundary", () => {
    for (let cents = 1; cents <= 250; cents += 1) {
      assert.equal(fromGatewayAmount(toGatewayAmount(cents)), cents);
    }
  });
});
