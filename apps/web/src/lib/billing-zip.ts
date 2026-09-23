// SPRINT-18.3: the billing ZIP — one normaliser for the checkout form and the server.
//
// Deliberately loose. AVS compares the numeric ZIP only, and a validator that rejects a real ZIP
// blocks a real sale, which is worse than passing an odd value to the issuer. Accepts five
// digits, or ZIP+4 in any common spelling ("60633-1234", "60633 1234", "606331234"), and keeps
// the first five. Anything else is refused with a sentence that says what is wrong.

export const BILLING_ZIP_MESSAGE = "Enter the 5-digit ZIP code of your card's billing address.";

/** The five-digit ZIP to send to the gateway, or null when the value is not a ZIP. */
export function normalizeBillingZip(value: string): string | null {
  const compact = value.trim().replace(/[\s-]/g, "");
  return /^\d{5}(?:\d{4})?$/.test(compact) ? compact.slice(0, 5) : null;
}
