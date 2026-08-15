// SPRINT-3: cart request contract — identifiers and quantities only; never prices.
import type { ApiErrorCode } from "./errors";

/** Structural abuse-prevention limits (named in one place). */
export const CART_LIMITS = {
  maxLines: 30,
  maxQuantityPerLine: 50,
  maxTotalItems: 100,
  maxNoteLength: 200,
  /** Tip rate ceiling: 100% */
  maxTipRateBps: 10_000,
  /** Fixed tip ceiling: $500.00 */
  maxTipCents: 50_000,
} as const;

export type CartLineRequest = {
  itemId: string;
  quantity: number;
  /** Selected modifier option identifiers only — group id is derived server-side. */
  selectedOptionIds: string[];
  customerNote?: string | null;
};

/**
 * Tip may be expressed in exactly one form. Discriminated union makes two-at-once untypeable.
 * `absent` tip = omit tip entirely from the cart. Explicit zero is `{ type: "amount", amountCents: 0 }`.
 */
export type TipRequest =
  | { type: "preset"; presetIndex: number }
  | { type: "rate"; rateBps: number }
  | { type: "amount"; amountCents: number };

export type CartRequest = {
  lines: CartLineRequest[];
  tip?: TipRequest;
};

/** Machine-readable validation reasons — part of the frozen contract from Sprint 3. */
export const CartValidationReasonCode = {
  // Structural (Phase 3)
  EMPTY_CART: "EMPTY_CART",
  TOO_MANY_LINES: "TOO_MANY_LINES",
  INVALID_QUANTITY: "INVALID_QUANTITY",
  TOO_MANY_ITEMS: "TOO_MANY_ITEMS",
  NOTE_TOO_LONG: "NOTE_TOO_LONG",
  TIP_OUT_OF_RANGE: "TIP_OUT_OF_RANGE",
  TIP_DISABLED: "TIP_DISABLED",
  TIP_PRESET_INVALID: "TIP_PRESET_INVALID",
  PRICE_FIELD_FORBIDDEN: "PRICE_FIELD_FORBIDDEN",
  MALFORMED_BODY: "MALFORMED_BODY",

  // Modifier / item (Phase 4) — customer-fixable unless marked availability
  ITEM_NOT_FOUND: "ITEM_NOT_FOUND",
  ITEM_SOLD_OUT: "ITEM_SOLD_OUT",
  OPTION_NOT_FOUND: "OPTION_NOT_FOUND",
  OPTION_INACTIVE: "OPTION_INACTIVE",
  OPTION_SOLD_OUT: "OPTION_SOLD_OUT",
  OPTION_NOT_BOUND: "OPTION_NOT_BOUND",
  GROUP_INACTIVE: "GROUP_INACTIVE",
  DUPLICATE_OPTION: "DUPLICATE_OPTION",
  BELOW_MIN_SELECT: "BELOW_MIN_SELECT",
  ABOVE_MAX_SELECT: "ABOVE_MAX_SELECT",
} as const;

export type CartValidationReasonCode =
  (typeof CartValidationReasonCode)[keyof typeof CartValidationReasonCode];

/** Availability-driven reasons the storefront should present differently from selection mistakes. */
export const AVAILABILITY_REASON_CODES: ReadonlySet<CartValidationReasonCode> = new Set([
  CartValidationReasonCode.ITEM_SOLD_OUT,
  CartValidationReasonCode.OPTION_SOLD_OUT,
  CartValidationReasonCode.OPTION_INACTIVE,
  CartValidationReasonCode.GROUP_INACTIVE,
  CartValidationReasonCode.ITEM_NOT_FOUND, // includes inactive — do not leak existence
]);

export type CartValidationReason = {
  code: CartValidationReasonCode;
  message: string;
  lineIndex: number | null;
  itemId: string | null;
  groupId: string | null;
  optionId: string | null;
  /** true = caused by availability changing underneath the customer */
  isAvailability: boolean;
};

export type SelectedModifierSnapshot = {
  groupName: string;
  groupPrompt: string;
  optionName: string;
  priceDeltaCents: number;
};

export type PricedLineSnapshot = {
  itemName: string;
  boardLabel: string | null;
  baseUnitPriceCents: number;
  modifierTotalCents: number;
  effectiveUnitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  selectedModifiers: SelectedModifierSnapshot[];
  customerNote: string | null;
};

export type PricedLine = {
  itemId: string;
  snapshot: PricedLineSnapshot;
};

export type TipApplied =
  | { type: "none"; tipCents: 0 }
  | { type: "preset"; presetIndex: number; rateBps: number; tipCents: number }
  | { type: "rate"; rateBps: number; tipCents: number }
  | { type: "amount"; tipCents: number };

export type QuoteResult = {
  lines: PricedLine[];
  subtotalCents: number;
  taxCents: number;
  taxRateBps: number;
  taxAppliedPreDiscount: boolean;
  tip: TipApplied;
  totalCents: number;
  orderable: boolean;
  blockingReasons: ApiErrorCode[];
  estimatedReadyAt: string;
};

export const API_CONTRACT_VERSION_S3 = "1.1.0" as const;
