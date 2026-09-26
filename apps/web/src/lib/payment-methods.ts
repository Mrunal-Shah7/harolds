// SPRINT-19: payment-method tabs (Card | Apple Pay | Google Pay) — the decisions, as pure functions.
//
// The checkout page and the Collect.js form are React and have no DOM test harness here, so every
// rule that matters is decided in this file and tested on its own (payment-methods.test.ts):
// which tabs exist, when a wallet sheet may open, what price the sheet shows, and what the
// callback's token was produced by. The components only render what these return.
import type { PaymentMethod } from "@harolds/types";

export type { PaymentMethod };

/** Server-side flags, as the checkout layout handed them down. */
export type WalletFlags = { applePay: boolean; googlePay: boolean };

/**
 * What this device and browser can do. `null` is "not known yet", which is treated exactly like
 * "no": a tab that appears and then vanishes is worse than one that appears a moment late.
 */
export type WalletAvailability = { applePay: boolean | null; googlePay: boolean | null };

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  card: "Card",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
};

/** DOM ids Collect.js mounts each wallet's button into. */
export const WALLET_MOUNT_ID = { apple_pay: "nmi-applepay", google_pay: "nmi-googlepay" } as const;

/**
 * The tabs to show, Card first and always present. A wallet appears only when its flag is on AND
 * the device has said yes. An unavailable wallet is HIDDEN, not disabled: a disabled "Apple Pay"
 * on an Android phone advertises a method the customer cannot use and adds a dead control.
 */
export function visiblePaymentMethods(flags: WalletFlags, availability: WalletAvailability): PaymentMethod[] {
  const methods: PaymentMethod[] = ["card"];
  if (flags.applePay && availability.applePay === true) methods.push("apple_pay");
  if (flags.googlePay && availability.googlePay === true) methods.push("google_pay");
  return methods;
}

/** The strip only exists when there is a choice. Card alone renders exactly the pre-wallet form. */
export function showTabStrip(methods: readonly PaymentMethod[]): boolean {
  return methods.length > 1;
}

/**
 * The method a Collect.js callback's token came from. Taken from the RESPONSE (`tokenType`), not
 * from the selected tab: one callback serves every method, and the token is what gets charged.
 * "inline" (and anything unrecognised) is a card.
 */
export function paymentMethodFromTokenType(tokenType: unknown): PaymentMethod {
  if (tokenType === "applePay") return "apple_pay";
  if (tokenType === "googlePay") return "google_pay";
  return "card";
}

/**
 * Roving focus across the tab strip (WAI-ARIA tabs pattern): arrows wrap, Home and End jump.
 * Returns the index to move to, or null when the key is not a navigation key.
 */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * The price the wallet sheet shows: the server's own `totalGatewayAmount`, passed through
 * UNTOUCHED. No sum, multiplication, rounding or formatting happens in the browser — the string
 * was made by the same server formatter that formats the sale, so the server can later compare
 * what the sheet showed with what it charges, byte for byte.
 */
export function walletPriceFromQuote(quote: { totalGatewayAmount?: string | null } | null): string | null {
  return quote?.totalGatewayAmount ?? null;
}

export type SheetGateInput = {
  /** Every order field valid (the billing ZIP is not an order field for a wallet). */
  fieldsValid: boolean;
  quoteOrderable: boolean;
  quoteLoading: boolean;
  submitting: boolean;
  lockoutSeconds: number;
  /** The decoy field was filled, or the form was completed faster than a person can. */
  looksAutomated: boolean;
  /** The current quote's price, and the price Collect.js is configured with right now. */
  quotePrice: string | null;
  configuredPrice: string | null;
};

/** Why a wallet sheet may not open. In priority order: the first is what the customer is told. */
export type SheetBlocker = "fields" | "quote" | "price" | "busy" | "lockout" | "automated";

/**
 * Critical rule 5: the customer must never approve a payment the server will reject for a reason
 * knowable beforehand. So the sheet opens only when the order is valid, the store will take it,
 * the quote is current, nothing is in flight, the 18.x retry lockout is over, the anti-automation
 * checks pass, and Collect.js is configured with EXACTLY the current quote's price (so the sheet
 * cannot show a stale total). Empty means the sheet may open.
 */
export function walletSheetBlockers(input: SheetGateInput): SheetBlocker[] {
  const blockers: SheetBlocker[] = [];
  if (!input.fieldsValid) blockers.push("fields");
  if (!input.quoteOrderable) blockers.push("quote");
  if (input.quoteLoading || input.quotePrice === null || input.configuredPrice !== input.quotePrice) {
    blockers.push("price");
  }
  // NOT "a sheet is open": the press that opens a sheet sets that, and a gate that closed on it
  // would make the wallet button inert under the customer's own finger, before the click that
  // Apple and Google need lands. An open sheet freezes the tip, cart and tabs instead (checkout page).
  if (input.submitting) blockers.push("busy");
  if (input.lockoutSeconds > 0) blockers.push("lockout");
  if (input.looksAutomated) blockers.push("automated");
  return blockers;
}

/** What the gate tells a customer who presses a blocked wallet button. Neutral for "automated". */
export function sheetBlockerMessage(blocker: SheetBlocker): string {
  switch (blocker) {
    case "fields":
      return "Please complete your pickup details above first.";
    case "quote":
      return "This order can't be placed right now.";
    case "price":
      return "Updating your total — one moment.";
    case "busy":
      return "Your payment is in progress.";
    case "lockout":
      return "Please wait before trying again.";
    case "automated":
      return "We couldn't process that. Please review your details and try again.";
  }
}

/**
 * The wallet part of `CollectJS.configure` (property names verified against the Collect.js build
 * and NMI's attribute tables; docs/SPRINT-19-NOTES.md §0.9). Only flagged wallets are configured.
 *
 * Contact data is the MINIMUM that yields the billing postal code for AVS, and nothing else:
 * Apple offers no ZIP-only field, so `postalAddress`; Google's `MIN` format is ZIP, country and
 * name. No phone, no email, no shipping — the order uses the pickup name and phone typed on the
 * page, and nothing the sheet returns is sent to our server.
 */
export function collectJsWalletOptions(flags: WalletFlags, price: string): {
  price: string;
  fields: Record<string, Record<string, unknown>>;
} {
  const fields: Record<string, Record<string, unknown>> = {};
  if (flags.applePay) {
    fields.applePay = {
      selector: `#${WALLET_MOUNT_ID.apple_pay}`,
      requiredBillingContactFields: ["postalAddress"],
      totalLabel: "Harold's Chicken Burnham",
      type: "buy",
      // Apple's own button, in one of the three styles its guidelines allow.
      style: { "button-style": "black", height: "44px", "border-radius": "8px" },
    };
  }
  if (flags.googlePay) {
    fields.googlePay = {
      selector: `#${WALLET_MOUNT_ID.google_pay}`,
      billingAddressRequired: true,
      billingAddressParameters: { format: "MIN" },
      buttonType: "buy",
      buttonColor: "default",
      totalPriceStatus: "FINAL",
    };
  }
  return { price, fields };
}

/**
 * Google Pay's availability question (Collect.js reports none of its own). The networks and auth
 * methods are Google's standard card set for a gateway integration.
 */
export const GOOGLE_PAY_READY_REQUEST = {
  apiVersion: 2,
  apiVersionMinor: 0,
  allowedPaymentMethods: [
    {
      type: "CARD",
      parameters: {
        allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"],
        allowedCardNetworks: ["AMEX", "DISCOVER", "MASTERCARD", "VISA"],
      },
    },
  ],
} as const;
