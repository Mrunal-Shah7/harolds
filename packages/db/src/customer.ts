// SPRINT-4: guest-checkout customer input normalisation — phone to E.164, basic email shape check.
import { parsePhoneNumberWithError, type CountryCode } from "libphonenumber-js";

/**
 * Normalise a customer-supplied phone number to E.164 (e.g. "+17085551234").
 * Returns null for anything that cannot be parsed as a valid number for `defaultCountry`
 * — callers should treat null as a validation failure, not throw.
 */
export function normalizePhoneToE164(input: string, defaultCountry: string = "US"): string | null {
  if (typeof input !== "string" || input.trim().length === 0) {
    return null;
  }

  try {
    const parsed = parsePhoneNumberWithError(input, defaultCountry as CountryCode);
    if (!parsed.isValid()) {
      return null;
    }
    return parsed.number; // already E.164 format
  } catch {
    return null;
  }
}

// RFC 5322 is far too permissive to be a useful gate; this is the pragmatic subset every
// real mail provider actually enforces — one "@", a non-empty local part, and a domain with
// at least one dot and no whitespace.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Simple pragmatic email shape check — not full RFC 5322, deliberately. */
export function validateEmail(input: string): boolean {
  if (typeof input !== "string") return false;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return EMAIL_PATTERN.test(trimmed);
}
