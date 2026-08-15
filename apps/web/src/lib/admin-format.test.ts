// SPRINT-8: timestamps render in the store zone, not the browser zone.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatStoreDateTime } from "./admin-format";
import { parseCurrencyInput } from "@harolds/db";

describe("formatStoreDateTime", () => {
  it("formats a known UTC instant in America/Chicago", () => {
    const text = formatStoreDateTime("2026-08-15T18:00:00.000Z", "America/Chicago");
    assert.match(text, /Aug/);
    assert.match(text, /2026/);
    assert.match(text, /1:00/);
    assert.equal(text.includes("Z"), false);
  });
});

describe("admin currency conversion", () => {
  it("stores .29 .49 .79 .99 as exact cents", () => {
    assert.equal(parseCurrencyInput("8.29"), 829);
    assert.equal(parseCurrencyInput("8.49"), 849);
    assert.equal(parseCurrencyInput("8.79"), 879);
    assert.equal(parseCurrencyInput("8.99"), 899);
  });
});
