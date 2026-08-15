// SPRINT-3: structural cart parsing — identifiers/quantities only; reject client-supplied prices.
import {
  CART_LIMITS,
  CartValidationReasonCode,
  type CartLineRequest,
  type CartRequest,
  type CartValidationReason,
  type TipRequest,
} from "@harolds/types";

function reason(
  code: CartValidationReason["code"],
  message: string,
  partial: Partial<
    Pick<CartValidationReason, "lineIndex" | "itemId" | "groupId" | "optionId">
  > = {},
): CartValidationReason {
  return {
    code,
    message,
    lineIndex: partial.lineIndex ?? null,
    itemId: partial.itemId ?? null,
    groupId: partial.groupId ?? null,
    optionId: partial.optionId ?? null,
    isAvailability: false,
  };
}

const MONEY_EXACT_KEYS = new Set([
  "price",
  "total",
  "subtotal",
  "tax",
  "amount",
  "unitPrice",
  "basePrice",
  "lineTotal",
  "tipCents",
  "taxCents",
  "subtotalCents",
  "totalCents",
]);

/** True when a key name looks like a client-supplied money field. */
function isForbiddenMoneyKey(key: string): boolean {
  if (MONEY_EXACT_KEYS.has(key)) return true;
  if (key === "Cents" || key.endsWith("Cents")) return true;
  if (key === "Price" || key.endsWith("Price")) return true;
  // tip* money synonyms (tip itself is the allowed tip discriminator object)
  if (key !== "tip" && /^tip/i.test(key) && /(?:amount|cents|price|total)$/i.test(key)) {
    return true;
  }
  return false;
}

/**
 * Walk an object tree for forbidden money keys.
 * Exception: tip.amountCents is allowed only when tip.type === "amount".
 */
function collectForbiddenMoneyKeys(
  value: unknown,
  path: string,
  reasons: CartValidationReason[],
  ctx: { inTipObject: boolean; tipType: string | null },
): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectForbiddenMoneyKeys(value[i], `${path}[${i}]`, reasons, ctx);
    }
    return;
  }

  const obj = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(obj)) {
    const childPath = path ? `${path}.${key}` : key;
    const allowTipAmountCents =
      ctx.inTipObject && ctx.tipType === "amount" && key === "amountCents";

    if (isForbiddenMoneyKey(key) && !allowTipAmountCents) {
      reasons.push(
        reason(
          CartValidationReasonCode.PRICE_FIELD_FORBIDDEN,
          `Request must not include price field '${childPath}'`,
        ),
      );
      // still recurse to surface every forbidden key
    }

    const nextCtx =
      key === "tip" && !ctx.inTipObject && child !== null && typeof child === "object"
        ? {
            inTipObject: true,
            tipType:
              typeof (child as { type?: unknown }).type === "string"
                ? ((child as { type: string }).type ?? null)
                : null,
          }
        : ctx;

    collectForbiddenMoneyKeys(child, childPath, reasons, nextCtx);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseTip(
  tipRaw: unknown,
  reasons: CartValidationReason[],
): TipRequest | undefined {
  if (tipRaw === undefined) return undefined;
  if (!isPlainObject(tipRaw)) {
    reasons.push(
      reason(CartValidationReasonCode.MALFORMED_BODY, "tip must be an object when present"),
    );
    return undefined;
  }

  const type = tipRaw.type;
  if (type !== "preset" && type !== "rate" && type !== "amount") {
    reasons.push(
      reason(
        CartValidationReasonCode.MALFORMED_BODY,
        "tip.type must be 'preset' | 'rate' | 'amount'",
      ),
    );
    return undefined;
  }

  if (type === "preset") {
    const presetIndex = tipRaw.presetIndex;
    if (!Number.isInteger(presetIndex) || (presetIndex as number) < 0) {
      reasons.push(
        reason(
          CartValidationReasonCode.TIP_PRESET_INVALID,
          "tip.presetIndex must be a non-negative integer",
        ),
      );
      return undefined;
    }
    // Only one form allowed — reject foreign tip keys that are the other forms.
    if ("rateBps" in tipRaw || "amountCents" in tipRaw) {
      reasons.push(
        reason(
          CartValidationReasonCode.MALFORMED_BODY,
          "tip may express only one of preset, rate, or amount",
        ),
      );
      return undefined;
    }
    return { type: "preset", presetIndex: presetIndex as number };
  }

  if (type === "rate") {
    const rateBps = tipRaw.rateBps;
    if (!Number.isInteger(rateBps) || (rateBps as number) < 0) {
      reasons.push(
        reason(
          CartValidationReasonCode.TIP_OUT_OF_RANGE,
          "tip.rateBps must be a non-negative integer",
        ),
      );
      return undefined;
    }
    if ((rateBps as number) > CART_LIMITS.maxTipRateBps) {
      reasons.push(
        reason(
          CartValidationReasonCode.TIP_OUT_OF_RANGE,
          `tip.rateBps must be <= ${CART_LIMITS.maxTipRateBps}`,
        ),
      );
      return undefined;
    }
    if ("presetIndex" in tipRaw || "amountCents" in tipRaw) {
      reasons.push(
        reason(
          CartValidationReasonCode.MALFORMED_BODY,
          "tip may express only one of preset, rate, or amount",
        ),
      );
      return undefined;
    }
    return { type: "rate", rateBps: rateBps as number };
  }

  // type === "amount"
  const amountCents = tipRaw.amountCents;
  if (!Number.isInteger(amountCents) || (amountCents as number) < 0) {
    reasons.push(
      reason(
        CartValidationReasonCode.TIP_OUT_OF_RANGE,
        "tip.amountCents must be a non-negative integer",
      ),
    );
    return undefined;
  }
  if ((amountCents as number) > CART_LIMITS.maxTipCents) {
    reasons.push(
      reason(
        CartValidationReasonCode.TIP_OUT_OF_RANGE,
        `tip.amountCents must be <= ${CART_LIMITS.maxTipCents}`,
      ),
    );
    return undefined;
  }
  if ("presetIndex" in tipRaw || "rateBps" in tipRaw) {
    reasons.push(
      reason(
        CartValidationReasonCode.MALFORMED_BODY,
        "tip may express only one of preset, rate, or amount",
      ),
    );
    return undefined;
  }
  return { type: "amount", amountCents: amountCents as number };
}

function parseLine(
  raw: unknown,
  lineIndex: number,
  reasons: CartValidationReason[],
): CartLineRequest | null {
  if (!isPlainObject(raw)) {
    reasons.push(
      reason(CartValidationReasonCode.MALFORMED_BODY, `lines[${lineIndex}] must be an object`, {
        lineIndex,
      }),
    );
    return null;
  }

  const itemId = raw.itemId;
  if (typeof itemId !== "string" || itemId.length === 0) {
    reasons.push(
      reason(CartValidationReasonCode.MALFORMED_BODY, `lines[${lineIndex}].itemId must be a string`, {
        lineIndex,
      }),
    );
    return null;
  }

  const quantity = raw.quantity;
  if (!Number.isInteger(quantity)) {
    reasons.push(
      reason(
        CartValidationReasonCode.INVALID_QUANTITY,
        `lines[${lineIndex}].quantity must be an integer`,
        { lineIndex, itemId },
      ),
    );
    return null;
  }
  if ((quantity as number) < 1 || (quantity as number) > CART_LIMITS.maxQuantityPerLine) {
    reasons.push(
      reason(
        CartValidationReasonCode.INVALID_QUANTITY,
        `lines[${lineIndex}].quantity must be between 1 and ${CART_LIMITS.maxQuantityPerLine}`,
        { lineIndex, itemId },
      ),
    );
  }

  const selectedOptionIds = raw.selectedOptionIds;
  if (
    !Array.isArray(selectedOptionIds) ||
    !selectedOptionIds.every((id) => typeof id === "string")
  ) {
    reasons.push(
      reason(
        CartValidationReasonCode.MALFORMED_BODY,
        `lines[${lineIndex}].selectedOptionIds must be an array of strings`,
        { lineIndex, itemId },
      ),
    );
    return null;
  }

  let customerNote: string | null | undefined = undefined;
  if ("customerNote" in raw) {
    const note = raw.customerNote;
    if (note !== null && typeof note !== "string") {
      reasons.push(
        reason(
          CartValidationReasonCode.MALFORMED_BODY,
          `lines[${lineIndex}].customerNote must be a string or null`,
          { lineIndex, itemId },
        ),
      );
      return null;
    }
    if (typeof note === "string" && note.length > CART_LIMITS.maxNoteLength) {
      reasons.push(
        reason(
          CartValidationReasonCode.NOTE_TOO_LONG,
          `lines[${lineIndex}].customerNote exceeds ${CART_LIMITS.maxNoteLength} characters`,
          { lineIndex, itemId },
        ),
      );
    }
    customerNote = note as string | null;
  }

  const line: CartLineRequest = {
    itemId,
    quantity: quantity as number,
    selectedOptionIds: selectedOptionIds as string[],
  };
  if (customerNote !== undefined) {
    line.customerNote = customerNote;
  }
  return line;
}

/**
 * Parse an untrusted request body into a CartRequest, or return every structural reason.
 * Distinguishes absent tip (`tip` omitted) from `{ type: "amount", amountCents: 0 }`.
 */
export function parseCartRequest(
  body: unknown,
): { ok: true; cart: CartRequest } | { ok: false; reasons: CartValidationReason[] } {
  const reasons: CartValidationReason[] = [];

  if (!isPlainObject(body)) {
    return {
      ok: false,
      reasons: [
        reason(CartValidationReasonCode.MALFORMED_BODY, "Request body must be a JSON object"),
      ],
    };
  }

  collectForbiddenMoneyKeys(body, "", reasons, { inTipObject: false, tipType: null });

  if (!("lines" in body) || !Array.isArray(body.lines)) {
    reasons.push(
      reason(CartValidationReasonCode.MALFORMED_BODY, "cart.lines must be an array"),
    );
    return { ok: false, reasons };
  }

  if (body.lines.length === 0) {
    reasons.push(reason(CartValidationReasonCode.EMPTY_CART, "Cart must contain at least one line"));
  }

  if (body.lines.length > CART_LIMITS.maxLines) {
    reasons.push(
      reason(
        CartValidationReasonCode.TOO_MANY_LINES,
        `Cart may contain at most ${CART_LIMITS.maxLines} lines`,
      ),
    );
  }

  const lines: CartLineRequest[] = [];
  for (let i = 0; i < body.lines.length; i++) {
    const parsed = parseLine(body.lines[i], i, reasons);
    if (parsed) lines.push(parsed);
  }

  let totalItems = 0;
  for (const line of lines) {
    if (Number.isInteger(line.quantity) && line.quantity > 0) {
      totalItems += line.quantity;
    }
  }
  if (totalItems > CART_LIMITS.maxTotalItems) {
    reasons.push(
      reason(
        CartValidationReasonCode.TOO_MANY_ITEMS,
        `Cart may contain at most ${CART_LIMITS.maxTotalItems} items across all lines`,
      ),
    );
  }

  const tip = "tip" in body ? parseTip(body.tip, reasons) : undefined;

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  const cart: CartRequest = { lines };
  // Preserve absense vs explicit zero: only set tip when the key was present and parsed.
  if ("tip" in body && tip !== undefined) {
    cart.tip = tip;
  } else if ("tip" in body && tip === undefined) {
    // parseTip already recorded reasons
    return { ok: false, reasons };
  }

  return { ok: true, cart };
}
