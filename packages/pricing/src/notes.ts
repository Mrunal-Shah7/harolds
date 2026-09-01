// Kitchen-note sanitisation. Notes are free text typed by the public that ends up on a thermal
// printer and a kitchen screen, so they are cleaned once, here, on the way in.
//
// Length is capped by CART_LIMITS.maxNoteLength, which the cart parser already reports as
// NOTE_TOO_LONG for line notes. This module is the second half of that job: what the characters
// are allowed to BE. A receipt printer interprets control bytes as commands (ESC/POS is an
// in-band protocol), so a note carrying them could cut the paper mid-ticket, change the
// codepage, or push the rest of the order off the roll. They are removed rather than escaped
// because no legitimate order note contains one.
//
// The classes are expressed as code-point numbers rather than regex character classes on
// purpose: a literal control byte written into this source would be invisible to whoever reads
// it next, which is precisely the property that makes these characters worth stripping.
import { CART_LIMITS } from "@harolds/types";

/** Tab, line feed and carriage return: folded to a space rather than dropped. */
function isFoldedToSpace(code: number): boolean {
  return code === 9 || code === 10 || code === 13;
}

function isStrippable(code: number): boolean {
  if (code <= 0x1f) return true; // C0 controls (tab/CR/LF are folded before this runs)
  if (code === 0x7f) return true; // DEL
  if (code >= 0x80 && code <= 0x9f) return true; // C1 controls
  if (code >= 0x200b && code <= 0x200f) return true; // zero-width spaces and bidi marks
  if (code >= 0x202a && code <= 0x202e) return true; // bidi embedding and overrides
  if (code >= 0x2066 && code <= 0x2069) return true; // bidi isolates
  if (code === 0xfeff) return true; // zero-width no-break space / BOM
  return false;
}

/**
 * Clean a customer-supplied kitchen note, or return null when nothing usable is left.
 * Returns null for absent input so callers store a real NULL rather than an empty string.
 */
export function sanitizeKitchenNote(
  raw: unknown,
  maxLength: number = CART_LIMITS.maxNoteLength,
): string | null {
  if (typeof raw !== "string") return null;
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (isFoldedToSpace(code)) {
      out += " ";
      continue;
    }
    if (isStrippable(code)) continue;
    out += ch;
  }
  // Collapse runs of spaces without a regex, so this file stays free of escape sequences.
  const cleaned = out.split(" ").filter((part) => part.length > 0).join(" ").slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : null;
}
