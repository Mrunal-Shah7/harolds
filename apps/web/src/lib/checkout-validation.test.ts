// Checkout field validation. Courtesy layer only -- the server re-checks all of it.
// SPRINT-18.3: billing ZIP — required, loose, ZIP+4 accepted.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeBillingZip } from "./billing-zip";
import {
  hasAnyError,
  validateBillingZip,
  validateCheckout,
  validateCustomTip,
  validateEmailField,
  validateName,
  validateOrderNote,
  validatePhone,
} from "./checkout-validation";

describe("required fields", () => {
  it("rejects blank and whitespace-only names", () => {
    assert.ok(validateName("", "First name"));
    assert.ok(validateName("   ", "First name"));
    assert.equal(validateName("Jamal", "First name"), null);
  });

  it("names the field in its own message", () => {
    assert.match(String(validateName("", "Last name")), /Last name/);
  });
});

describe("mobile number", () => {
  it("accepts the shapes people actually type", () => {
    for (const value of [
      "7085551234",
      "(708) 555-1234",
      "708-555-1234",
      "708.555.1234",
      "+1 708 555 1234",
      "1-708-555-1234",
    ]) {
      assert.equal(validatePhone(value), null, `should accept ${value}`);
    }
  });

  it("rejects wrong lengths", () => {
    assert.ok(validatePhone(""));
    assert.ok(validatePhone("708555123"));
    assert.ok(validatePhone("70855512345"));
  });

  it("rejects area codes and exchanges that cannot exist", () => {
    assert.ok(validatePhone("0085551234"), "area code cannot start 0");
    assert.ok(validatePhone("1085551234"), "area code cannot start 1");
    assert.ok(validatePhone("7080551234"), "exchange cannot start 0");
    assert.ok(validatePhone("7081551234"), "exchange cannot start 1");
  });

  it("ignores letters and punctuation around a valid number", () => {
    assert.equal(validatePhone("  (708) 555 1234  "), null);
  });
});

describe("email", () => {
  it("accepts ordinary addresses", () => {
    for (const value of ["a@b.co", "first.last@example.com", "x+tag@sub.domain.org"]) {
      assert.equal(validateEmailField(value), null, `should accept ${value}`);
    }
  });

  it("rejects the obvious shapes that are not addresses", () => {
    for (const value of ["", "nope", "a@", "@b.com", "a@b", "a b@c.com", "a@@b.com", "a@b."]) {
      assert.ok(validateEmailField(value), `should reject ${value}`);
    }
  });
});

describe("custom tip", () => {
  it("treats blank as no tip", () => {
    assert.equal(validateCustomTip(""), null);
    assert.equal(validateCustomTip("   "), null);
  });

  it("accepts whole dollars and cents", () => {
    assert.equal(validateCustomTip("5"), null);
    assert.equal(validateCustomTip("5.50"), null);
    assert.equal(validateCustomTip("0"), null);
  });

  it("rejects anything that is not a number", () => {
    for (const value of ["abc", "5abc", "$5", "5,50", "-5", "1e3", "5.", ".5"]) {
      assert.ok(validateCustomTip(value), `should reject ${value}`);
    }
  });

  // The client ceiling exists so the field never accepts what the server would reject.
  it("caps at the same figure the server enforces", () => {
    assert.equal(validateCustomTip("500.00"), null);
    assert.ok(validateCustomTip("500.01"));
    assert.ok(validateCustomTip("999"));
    assert.match(String(validateCustomTip("999")), /500/);
  });
});

describe("order note", () => {
  it("accepts a normal instruction and rejects an overlong one", () => {
    assert.equal(validateOrderNote("No cutlery please"), null);
    assert.ok(validateOrderNote("x".repeat(400)));
  });
});

describe("validateCheckout", () => {
  const good = {
    firstName: "Jamal",
    lastName: "Whitfield",
    phone: "(708) 555-1234",
    email: "jamal@example.com",
    customTip: "",
    orderNote: "",
    billingZip: "60633",
  };

  it("passes a complete, well-formed form", () => {
    assert.equal(hasAnyError(validateCheckout(good)), false);
  });

  it("reports every empty field at once rather than one at a time", () => {
    const errors = validateCheckout({
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      customTip: "",
      orderNote: "",
      billingZip: "",
    });
    assert.ok(errors.firstName);
    assert.ok(errors.lastName);
    assert.ok(errors.phone);
    assert.ok(errors.email);
    assert.ok(errors.billingZip);
    assert.equal(hasAnyError(errors), true);
  });

  it("fails on a bad tip even when every other field is right", () => {
    assert.equal(hasAnyError(validateCheckout({ ...good, customTip: "9999" })), true);
  });

  // SPRINT-18.3: the billing ZIP blocks submission when empty or malformed, like every field.
  it("blocks submission on a missing or malformed billing ZIP", () => {
    assert.equal(hasAnyError(validateCheckout({ ...good, billingZip: "" })), true);
    assert.equal(hasAnyError(validateCheckout({ ...good, billingZip: "606" })), true);
  });
});

describe("validateBillingZip (SPRINT-18.3)", () => {
  it("requires a value", () => {
    assert.equal(validateBillingZip(""), "Billing ZIP is required.");
    assert.equal(validateBillingZip("   "), "Billing ZIP is required.");
  });

  it("accepts five digits and ZIP+4 in every common spelling", () => {
    for (const zip of ["60633", " 60633 ", "60633-1234", "60633 1234", "606331234"]) {
      assert.equal(validateBillingZip(zip), null, zip);
    }
  });

  it("refuses a three-digit entry with a message that says what is wrong", () => {
    assert.match(validateBillingZip("606") ?? "", /5-digit ZIP code/);
  });

  it("refuses letters and wrong lengths", () => {
    // Dash and space placement is deliberately ignored (loose by design), so only digit COUNT
    // and non-digits can fail.
    for (const zip of ["6063A", "606331", "6063312", "ABCDE"]) {
      assert.ok(validateBillingZip(zip), zip);
    }
  });

  it("sends only the first five digits of a ZIP+4", () => {
    assert.equal(normalizeBillingZip("60633-1234"), "60633");
    assert.equal(normalizeBillingZip("606331234"), "60633");
    assert.equal(normalizeBillingZip("606"), null);
  });
});
