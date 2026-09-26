// SPRINT-19: the payment-method tabs' decisions — which tabs exist, when a wallet sheet may open,
// what price it shows, and what a token was produced by. Pure; no DOM, no gateway.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  collectJsWalletOptions,
  nextTabIndex,
  paymentMethodFromTokenType,
  sheetBlockerMessage,
  showTabStrip,
  visiblePaymentMethods,
  walletPriceFromQuote,
  walletSheetBlockers,
  WALLET_MOUNT_ID,
  type SheetGateInput,
  type WalletAvailability,
} from "./payment-methods";
import { hasAnyError, validateCheckout } from "./checkout-validation";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("tab visibility: flags × availability", () => {
  const flagCases = [
    { applePay: false, googlePay: false },
    { applePay: true, googlePay: false },
    { applePay: false, googlePay: true },
    { applePay: true, googlePay: true },
  ];
  const answers: Array<boolean | null> = [null, false, true];

  for (const flags of flagCases) {
    for (const apple of answers) {
      for (const google of answers) {
        const availability: WalletAvailability = { applePay: apple, googlePay: google };
        it(`flags ${JSON.stringify(flags)}, device apple=${apple} google=${google}`, () => {
          const methods = visiblePaymentMethods(flags, availability);
          assert.equal(methods[0], "card", "Card is always first");
          assert.equal(methods.includes("apple_pay"), flags.applePay && apple === true);
          assert.equal(methods.includes("google_pay"), flags.googlePay && google === true);
          // One method is no choice at all: no strip, exactly the card-only form.
          assert.equal(showTabStrip(methods), methods.length > 1);
        });
      }
    }
  }

  it("both flags off: no strip, whatever the device says", () => {
    const methods = visiblePaymentMethods({ applePay: false, googlePay: false }, { applePay: true, googlePay: true });
    assert.deepEqual(methods, ["card"]);
    assert.equal(showTabStrip(methods), false);
  });

  it("orders the tabs Card | Apple Pay | Google Pay", () => {
    assert.deepEqual(
      visiblePaymentMethods({ applePay: true, googlePay: true }, { applePay: true, googlePay: true }),
      ["card", "apple_pay", "google_pay"],
    );
  });
});

describe("keyboard navigation across the tabs", () => {
  it("arrows move and wrap; Home and End jump; other keys do nothing", () => {
    assert.equal(nextTabIndex("ArrowRight", 0, 3), 1);
    assert.equal(nextTabIndex("ArrowRight", 2, 3), 0);
    assert.equal(nextTabIndex("ArrowLeft", 0, 3), 2);
    assert.equal(nextTabIndex("ArrowLeft", 1, 3), 0);
    assert.equal(nextTabIndex("Home", 2, 3), 0);
    assert.equal(nextTabIndex("End", 0, 3), 2);
    assert.equal(nextTabIndex("Tab", 0, 3), null);
    assert.equal(nextTabIndex("Enter", 0, 3), null);
    assert.equal(nextTabIndex("ArrowRight", 0, 0), null);
  });
});

describe("what produced the token comes from the callback, not the tab", () => {
  it("maps Collect.js tokenType values", () => {
    assert.equal(paymentMethodFromTokenType("applePay"), "apple_pay");
    assert.equal(paymentMethodFromTokenType("googlePay"), "google_pay");
    assert.equal(paymentMethodFromTokenType("inline"), "card");
    assert.equal(paymentMethodFromTokenType(undefined), "card");
    assert.equal(paymentMethodFromTokenType("somethingNew"), "card");
  });
});

describe("the wallet sheet opens only for an order the server will accept", () => {
  const OPEN: SheetGateInput = {
    fieldsValid: true,
    quoteOrderable: true,
    quoteLoading: false,
    submitting: false,
    lockoutSeconds: 0,
    looksAutomated: false,
    quotePrice: "18.40",
    configuredPrice: "18.40",
    walletInProgress: false,
  };

  it("opens when everything holds", () => {
    assert.deepEqual(walletSheetBlockers(OPEN), []);
  });

  it("an INVALID PICKUP FORM blocks the sheet, and says the same thing the card path does", () => {
    const pickup = validateCheckout(
      { firstName: "", lastName: "Doe", phone: "708", email: "a@example.com", customTip: "", orderNote: "", billingZip: "" },
      { requireBillingZip: false },
    );
    const blockers = walletSheetBlockers({ ...OPEN, fieldsValid: !hasAnyError(pickup) });
    assert.deepEqual(blockers, ["fields"]);
    assert.match(sheetBlockerMessage(blockers[0]!), /pickup details/);
    // And the field messages themselves are the card path's own.
    assert.equal(pickup.firstName, "First name is required.");
    assert.equal(pickup.phone, "Enter a 10-digit US mobile number.");
  });

  const cases: Array<[string, Partial<SheetGateInput>, string]> = [
    ["store not taking the order", { quoteOrderable: false }, "quote"],
    ["quote in flight", { quoteLoading: true }, "price"],
    ["no quote price yet", { quotePrice: null }, "price"],
    ["Collect.js still holds the OLD total", { configuredPrice: "15.10" }, "price"],
    ["Collect.js not configured yet", { configuredPrice: null }, "price"],
    ["an order request in flight", { submitting: true }, "busy"],
    ["a sheet already open", { walletInProgress: true }, "busy"],
    ["the retry lockout running", { lockoutSeconds: 9 }, "lockout"],
    ["the decoy or minimum-fill check tripped", { looksAutomated: true }, "automated"],
  ];
  for (const [name, change, expected] of cases) {
    it(`blocks on ${name}`, () => {
      assert.deepEqual(walletSheetBlockers({ ...OPEN, ...change }), [expected]);
    });
  }

  it("the ZIP is not an order field for a wallet: an empty ZIP does not block the sheet", () => {
    const fields = { firstName: "A", lastName: "B", phone: "7085551234", email: "a@example.com", customTip: "", orderNote: "" };
    assert.equal(hasAnyError(validateCheckout({ ...fields, billingZip: "" }, { requireBillingZip: false })), false);
    // …but it still is for a card, and the default is the card.
    assert.equal(hasAnyError(validateCheckout({ ...fields, billingZip: "" })), true);
    assert.equal(validateCheckout({ ...fields, billingZip: "" }).billingZip, "Billing ZIP is required.");
    // A half-typed ZIP left behind in the hidden Card panel cannot block a wallet either.
    assert.equal(validateCheckout({ ...fields, billingZip: "606" }, { requireBillingZip: false }).billingZip, null);
  });
});

describe("the wallet price is the server's total, untouched", () => {
  it("passes the quote's string through as-is — no arithmetic, no reformatting", () => {
    // Strings no browser-side arithmetic or formatting would reproduce: returned byte for byte.
    for (const s of ["18.40", "0007.10", "1.1", "12.345", "abc"]) {
      assert.equal(walletPriceFromQuote({ totalGatewayAmount: s }), s);
    }
    assert.equal(walletPriceFromQuote({ totalGatewayAmount: null }), null);
    assert.equal(walletPriceFromQuote({}), null);
    assert.equal(walletPriceFromQuote(null), null);
  });

  it("the code that carries the price does no money arithmetic", () => {
    const src = walletPriceFromQuote.toString() + collectJsWalletOptions.toString();
    assert.doesNotMatch(src, /\bMath\.|toFixed|parseFloat|parseInt|Number\(|\*|\/ ?100|\+ ?0?\.|totalCents|tipCents/);
    // Nor does the storefront anywhere compute a wallet price: the page reads it from the quote.
    const page = readFileSync(path.join(here, "../app/(storefront)/checkout/page.tsx"), "utf8");
    assert.match(page, /const walletPrice = walletPriceFromQuote\(quote\);/);
    const form = readFileSync(path.join(here, "../components/storefront/nmi-payment-form.tsx"), "utf8");
    assert.match(form, /collectJsWalletOptions\(wallets, walletPrice\)/);
  });

  it("a TIP CHANGE changes the price Collect.js is configured with (quote → config)", () => {
    const flags = { applePay: true, googlePay: true };
    // Two server quotes for the same cart, before and after choosing a 20% tip.
    const before = walletPriceFromQuote({ totalGatewayAmount: "16.50" })!;
    const after = walletPriceFromQuote({ totalGatewayAmount: "19.80" })!;
    assert.equal(collectJsWalletOptions(flags, before).price, "16.50");
    assert.equal(collectJsWalletOptions(flags, after).price, "19.80");
    // And the sheet cannot open on the old one: Collect.js still holding 16.50 blocks it.
    const gate = (configuredPrice: string): SheetGateInput => ({
      fieldsValid: true,
      quoteOrderable: true,
      quoteLoading: false,
      submitting: false,
      lockoutSeconds: 0,
      looksAutomated: false,
      quotePrice: after,
      configuredPrice,
      walletInProgress: false,
    });
    assert.deepEqual(walletSheetBlockers(gate(before)), ["price"]);
    assert.deepEqual(walletSheetBlockers(gate(after)), []);
  });
});

describe("the Collect.js wallet configuration", () => {
  it("configures only the flagged wallets", () => {
    assert.deepEqual(Object.keys(collectJsWalletOptions({ applePay: false, googlePay: false }, "1.00").fields), []);
    assert.deepEqual(Object.keys(collectJsWalletOptions({ applePay: true, googlePay: false }, "1.00").fields), ["applePay"]);
    assert.deepEqual(Object.keys(collectJsWalletOptions({ applePay: false, googlePay: true }, "1.00").fields), ["googlePay"]);
  });

  it("asks each wallet for the MINIMUM that yields the billing postal code, and nothing else", () => {
    const { fields } = collectJsWalletOptions({ applePay: true, googlePay: true }, "1.00");
    const apple = fields.applePay as Record<string, unknown>;
    const google = fields.googlePay as Record<string, unknown>;
    assert.equal(apple.selector, `#${WALLET_MOUNT_ID.apple_pay}`);
    assert.deepEqual(apple.requiredBillingContactFields, ["postalAddress"]);
    assert.equal(apple.contactFields, undefined, "no phone, no email");
    assert.equal(apple.requiredShippingContactFields, undefined, "no shipping");
    assert.equal(google.selector, `#${WALLET_MOUNT_ID.google_pay}`);
    assert.equal(google.billingAddressRequired, true);
    assert.deepEqual(google.billingAddressParameters, { format: "MIN" });
    assert.equal(google.emailRequired, undefined, "no email");
    assert.equal(google.shippingAddressRequired, undefined, "no shipping");
    // Apple's style keys are the three Collect.js accepts, and the style one its guidelines allow.
    assert.deepEqual(Object.keys(apple.style as object).sort(), ["border-radius", "button-style", "height"]);
    assert.ok(["black", "white", "white-outline"].includes((apple.style as Record<string, string>)["button-style"]!));
  });
});
