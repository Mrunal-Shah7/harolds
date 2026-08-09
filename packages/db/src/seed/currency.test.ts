// SPRINT-1: currency conversion unit tests — values drawn from the reconciliation workbook
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dollarsToCents } from "./currency";

describe("dollarsToCents", () => {
  it("converts .79 ending (e.g. $8.79 whole dinner)", () => {
    assert.equal(dollarsToCents("$8.79"), 879);
    assert.equal(dollarsToCents("8.79"), 879);
  });

  it("converts .29 ending (e.g. $0.29 mayo packet)", () => {
    assert.equal(dollarsToCents("$0.29"), 29);
    assert.equal(dollarsToCents("0.29"), 29);
  });

  it("converts .49 ending (e.g. $11.49 half chicken / $4.49 add fries)", () => {
    assert.equal(dollarsToCents("$11.49"), 1149);
    assert.equal(dollarsToCents("$4.49"), 449);
  });

  it("converts .99 ending (e.g. $15.99 / $19.99)", () => {
    assert.equal(dollarsToCents("$15.99"), 1599);
    assert.equal(dollarsToCents("$19.99"), 1999);
  });

  it("converts whole-dollar values (e.g. $1.00 can pop placeholder)", () => {
    assert.equal(dollarsToCents("$1.00"), 100);
    assert.equal(dollarsToCents("1"), 100);
    assert.equal(dollarsToCents("$4.00"), 400);
  });

  it("converts .19 ending (e.g. $1.19 add cheese / $2.19 sauce)", () => {
    assert.equal(dollarsToCents("$1.19"), 119);
    assert.equal(dollarsToCents("$2.19"), 219);
  });

  it("rejects unparseable input", () => {
    assert.throws(() => dollarsToCents(""), /Cannot parse/);
    assert.throws(() => dollarsToCents("abc"), /Cannot parse/);
  });
});
