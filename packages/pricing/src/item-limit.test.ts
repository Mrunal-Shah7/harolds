// Per-item purchase ceilings and kitchen-note sanitisation — the two server-side rules behind
// the admin's "max per order" field and the storefront's free-text instruction boxes.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CartValidationReasonCode, type CartRequest } from "@harolds/types";
import { validateCart } from "./validate";
import { sanitizeKitchenNote } from "./notes";
import { buildTestCatalog, ITEM_CHEAP, ITEM_PLAIN } from "./test-fixtures";

/** A catalog where ITEM_CHEAP may appear at most twice in one order. */
function catalogWithLimit(limit: number) {
  const catalog = buildTestCatalog();
  const item = catalog.itemsById.get(ITEM_CHEAP);
  assert.ok(item, "fixture must have ITEM_CHEAP");
  catalog.itemsById.set(ITEM_CHEAP, { ...item, maxQuantityPerOrder: limit });
  return catalog;
}

const line = (itemId: string, quantity: number) => ({
  itemId,
  quantity,
  selectedOptionIds: [] as string[],
});

describe("per-item purchase ceiling", () => {
  it("allows a cart exactly at the ceiling", () => {
    const cart: CartRequest = { lines: [line(ITEM_CHEAP, 2)] };
    const reasons = validateCart(cart, catalogWithLimit(2));
    assert.equal(
      reasons.filter((r) => r.code === CartValidationReasonCode.ITEM_QUANTITY_LIMIT).length,
      0,
    );
  });

  it("rejects a single line over the ceiling", () => {
    const cart: CartRequest = { lines: [line(ITEM_CHEAP, 3)] };
    const reasons = validateCart(cart, catalogWithLimit(2));
    const hit = reasons.filter((r) => r.code === CartValidationReasonCode.ITEM_QUANTITY_LIMIT);
    assert.equal(hit.length, 1);
    assert.equal(hit[0]?.itemId, ITEM_CHEAP);
  });

  // The bypass the UI cannot prevent: the same item split across lines.
  it("sums the same item across separate lines rather than checking each line alone", () => {
    const cart: CartRequest = { lines: [line(ITEM_CHEAP, 2), line(ITEM_CHEAP, 2)] };
    const reasons = validateCart(cart, catalogWithLimit(3));
    const hit = reasons.filter((r) => r.code === CartValidationReasonCode.ITEM_QUANTITY_LIMIT);
    assert.equal(hit.length, 1, "four of a three-limit item must be caught even when split");
  });

  it("reports the ceiling once per item, not once per line", () => {
    const cart: CartRequest = { lines: [line(ITEM_CHEAP, 5), line(ITEM_CHEAP, 5)] };
    const reasons = validateCart(cart, catalogWithLimit(1));
    assert.equal(
      reasons.filter((r) => r.code === CartValidationReasonCode.ITEM_QUANTITY_LIMIT).length,
      1,
    );
  });

  it("leaves items without a ceiling alone", () => {
    const cart: CartRequest = { lines: [line(ITEM_PLAIN, 40)] };
    const reasons = validateCart(cart, catalogWithLimit(1));
    assert.equal(
      reasons.filter((r) => r.code === CartValidationReasonCode.ITEM_QUANTITY_LIMIT).length,
      0,
    );
  });
});

describe("kitchen note sanitisation", () => {
  it("keeps ordinary text intact", () => {
    assert.equal(sanitizeKitchenNote("Extra crispy please"), "Extra crispy please");
  });

  it("returns null for absent, blank, or non-string input", () => {
    assert.equal(sanitizeKitchenNote(undefined), null);
    assert.equal(sanitizeKitchenNote(null), null);
    assert.equal(sanitizeKitchenNote("   "), null);
    assert.equal(sanitizeKitchenNote(42), null);
  });

  // ESC/POS is an in-band protocol: a raw ESC byte in a note is a printer command.
  it("strips control bytes that a receipt printer would execute", () => {
    const esc = String.fromCharCode(0x1b);
    const gs = String.fromCharCode(0x1d);
    const note = `Mild${esc}@ sauce${gs}V${String.fromCharCode(0)}`;
    const cleaned = sanitizeKitchenNote(note);
    assert.ok(cleaned);
    for (const ch of cleaned) {
      assert.ok(ch.codePointAt(0)! >= 0x20, `control byte survived: ${ch.codePointAt(0)}`);
    }
    assert.match(cleaned, /Mild/);
    assert.match(cleaned, /sauce/);
  });

  it("folds tabs and newlines to single spaces instead of dropping the words", () => {
    const note = ["no", "gizzards", "please"].join(String.fromCharCode(10));
    assert.equal(sanitizeKitchenNote(note), "no gizzards please");
    assert.equal(sanitizeKitchenNote(`a${String.fromCharCode(9)}${String.fromCharCode(9)}b`), "a b");
  });

  it("strips zero-width and bidi characters", () => {
    const zwsp = String.fromCharCode(0x200b);
    const rlo = String.fromCharCode(0x202e);
    const bom = String.fromCharCode(0xfeff);
    assert.equal(sanitizeKitchenNote(`ex${zwsp}tra${rlo}${bom}`), "extra");
  });

  it("truncates to the cap", () => {
    const cleaned = sanitizeKitchenNote("x".repeat(500), 200);
    assert.equal(cleaned?.length, 200);
  });
});
