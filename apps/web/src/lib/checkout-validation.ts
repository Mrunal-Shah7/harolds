// Checkout field validation.
// SPRINT-18.3: adds the billing ZIP, which belongs to the payment card, not to the contact block.
// SPRINT-19: the ZIP is required only when paying by card. A wallet supplies its own postal code.
//
// This is a COURTESY layer, not a security boundary: everything here is re-checked on the server
// (phone by normalizePhoneToE164, email by validateEmail, tip bounds by parseCartRequest against
// CART_LIMITS). Its job is to tell someone what is wrong before they are charged, not to decide
// whether the order is legal.
//
// Each function returns null when the value is acceptable, or the sentence to show under the
// field when it is not.
import { CART_LIMITS } from "@harolds/types";
import { BILLING_ZIP_MESSAGE, normalizeBillingZip } from "@/lib/billing-zip";

/** Digits only, so formatting the customer chose to type is never held against them. */
function digitsOf(value: string): string {
  return value.replace(/[^\d]/g, "");
}

export function validateName(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return `${label} is required.`;
  if (trimmed.length > 60) return `${label} is too long.`;
  return null;
}

/**
 * A US mobile number, which is what a pickup order from an Illinois storefront is.
 *
 * Ten digits, or eleven when the customer wrote the country code. Punctuation is ignored, so
 * "(708) 555-1234", "708-555-1234" and "7085551234" are the same number. The leading digit of
 * the area code and the exchange cannot be 0 or 1 under the North American numbering plan, and
 * rejecting those here catches a transposed or half-typed number before the payment attempt.
 */
export function validatePhone(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Mobile number is required.";
  let digits = digitsOf(trimmed);
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return "Enter a 10-digit US mobile number.";
  if (digits[0] === "0" || digits[0] === "1") return "That area code isn't valid.";
  if (digits[3] === "0" || digits[3] === "1") return "That number isn't valid.";
  return null;
}

/**
 * Deliberately permissive: one @, something either side, a dot in the domain, no whitespace.
 * A stricter pattern rejects real addresses, and the receipt bouncing is a smaller harm than
 * refusing a paying customer at the last step.
 */
export function validateEmailField(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Email is required.";
  if (trimmed.length > 254) return "That email is too long.";
  if (/\s/.test(trimmed)) return "Email cannot contain spaces.";
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) {
    return "Enter a valid email address.";
  }
  const domain = trimmed.slice(at + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return "Enter a valid email address.";
  }
  return null;
}

/**
 * The custom tip box. Must be a number, and must not exceed the ceiling the server enforces --
 * the two agree on purpose, so the field never accepts an amount the quote would then reject.
 * Blank is valid and means no tip.
 */
export function validateCustomTip(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return "Enter a tip amount as a number, like 5 or 5.50.";
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return "Enter a tip amount as a number, like 5 or 5.50.";
  if (amount < 0) return "A tip cannot be negative.";
  const maxDollars = CART_LIMITS.maxTipCents / 100;
  if (Math.round(amount * 100) > CART_LIMITS.maxTipCents) {
    return `Tips are capped at $${maxDollars.toFixed(2)}.`;
  }
  return null;
}

/**
 * The ZIP on the card's billing statement, for AVS. Required: every sale without it is a sale
 * the issuer sees with no address at all. Loose on format — see billing-zip.ts.
 */
export function validateBillingZip(value: string): string | null {
  if (value.trim().length === 0) return "Billing ZIP is required.";
  return normalizeBillingZip(value) ? null : BILLING_ZIP_MESSAGE;
}

/** Whole-order kitchen instruction. Optional; the server strips and caps it regardless. */
export function validateOrderNote(value: string): string | null {
  if (value.trim().length > CART_LIMITS.maxNoteLength) {
    return `Keep instructions under ${CART_LIMITS.maxNoteLength} characters.`;
  }
  return null;
}

export type CheckoutFieldErrors = {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  customTip: string | null;
  orderNote: string | null;
  billingZip: string | null;
};

export function validateCheckout(input: {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  customTip: string;
  orderNote: string;
  billingZip: string;
}, options: { requireBillingZip?: boolean } = {}): CheckoutFieldErrors {
  // SPRINT-19: defaults to required, so every existing caller is the card checkout it always was.
  const requireBillingZip = options.requireBillingZip ?? true;
  return {
    firstName: validateName(input.firstName, "First name"),
    lastName: validateName(input.lastName, "Last name"),
    phone: validatePhone(input.phone),
    email: validateEmailField(input.email),
    customTip: validateCustomTip(input.customTip),
    orderNote: validateOrderNote(input.orderNote),
    billingZip: requireBillingZip ? validateBillingZip(input.billingZip) : null,
  };
}

export function hasAnyError(errors: CheckoutFieldErrors): boolean {
  return Object.values(errors).some((message) => message !== null);
}
