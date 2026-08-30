// SPRINT-2: public API contract types — independent of Prisma. Storefront imports these only.
// ApiErrorCode / API_ERROR_STATUS are exported from @harolds/types via ./api/errors.

import { API_CONTRACT_VERSION } from "./errors";
import type { ApiErrorCode } from "./errors";

/** Day-of-week for hours payloads — 0 = Sunday … 6 = Saturday */
export const DayOfWeek = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
} as const;
export type DayOfWeek = (typeof DayOfWeek)[keyof typeof DayOfWeek];

export type ResponseMeta = {
  /** Server UTC timestamp, ISO 8601 with zone designator */
  serverTime: string;
  /** Frozen contract version */
  version: typeof API_CONTRACT_VERSION | string;
};

export type ApiSuccess<T> = {
  data: T;
  meta: ResponseMeta;
};

export type ApiErrorBody = {
  code: ApiErrorCode;
  message: string;
  details: Record<string, unknown> | null;
};

export type ApiErrorResponse = {
  error: ApiErrorBody;
  meta: ResponseMeta;
};

// ── Menu contract ────────────────────────────────────────────────────────────

export type MenuModifierOption = {
  id: string;
  name: string;
  priceDeltaCents: number;
  isSoldOut: boolean;
  isDefaultSelected: boolean;
  sortOrder: number;
};

export type MenuModifierGroup = {
  id: string;
  prompt: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  options: MenuModifierOption[];
};

export type MenuItemImageDerivatives = {
  thumb: { webp: string; fallback: string };
  modal: { webp: string; fallback: string };
  preview: { webp: string; fallback: string };
};

export type MenuItemSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  imageUrl: string | null;
  /** SPRINT-12 additive: sized derivatives when an image is present. */
  imageDerivatives?: MenuItemImageDerivatives | null;
  isSoldOut: boolean;
  isFeatured: boolean;
  isMostOrdered: boolean;
  sortOrder: number;
};

export type MenuItemDetail = MenuItemSummary & {
  categoryId: string;
  categorySlug: string;
  modifierGroups: MenuModifierGroup[];
};

/** Item as nested under a category in the full-menu payload (groups included for modal). */
export type MenuItemWithModifiers = MenuItemSummary & {
  modifierGroups: MenuModifierGroup[];
};

export type MenuCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  /** Additive: operator-set rail image. Null falls back to the category's first initial. */
  imageUrl?: string | null;
  /** Additive: derivative URLs for `imageUrl`, same convention as a menu item's. */
  imageDerivatives?: MenuItemSummary["imageDerivatives"];
  items: MenuItemWithModifiers[];
};

/** Full menu — no pagination (catalogue < 100 items). */
export type FullMenu = {
  categories: MenuCategory[];
};

export type CategorySummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  activeItemCount: number;
  /** Additive: operator-set rail image. Null falls back to the category's first initial. */
  imageUrl?: string | null;
  /** Additive: derivative URLs for `imageUrl`, same convention as a menu item's. */
  imageDerivatives?: MenuItemSummary["imageDerivatives"];
};

export type CategoriesPayload = {
  categories: CategorySummary[];
};

export type CuratedItemsPayload = {
  items: MenuItemSummary[];
};

// ── Store status contract ────────────────────────────────────────────────────

export type StoreHoursRow = {
  dayOfWeek: number;
  openTime: string | null;
  closeTime: string | null;
  isClosed: boolean;
};

export type StoreClosureRow = {
  date: string;
  reason: string | null;
};

export type StoreStatus = {
  storeName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  contactPhone: string;
  timezone: string;
  hours: StoreHoursRow[];
  closures: StoreClosureRow[];
  isOpen: boolean;
  /** ISO 8601 UTC; null when currently open or no upcoming open time known */
  nextOpenAt: string | null;
  acceptingOrders: boolean;
  notAcceptingMessage: string | null;
  /** Resolved prep minutes (normal or busy) */
  prepMinutes: number;
  /** Advisory estimated ready timestamp (UTC ISO) */
  estimatedReadyAt: string;
  taxRateBps: number;
  taxAppliedPreDiscount: boolean;
  /** Additive: operator-set storefront hero background. Null renders the plain paper hero. */
  heroImageUrl?: string | null;
  tippingEnabled: boolean;
  tipPresetsBps: number[];
  defaultTipPresetIndex: number;
  /** SPRINT-12 additive: why the store is closed / paused; null when open and accepting. */
  closedReason?:
    | "ACCEPTING_ORDERS_OFF"
    | "OVERRIDE_CLOSED_REST_OF_DAY"
    | "OVERRIDE_CLOSE_EARLY"
    | "OVERRIDE_OPEN_LATE"
    | "SCHEDULE_CLOSED"
    | "CLOSURE_DATE"
    | null;
  /** SPRINT-12 additive: message when closed by schedule/override. */
  closedMessage?: string | null;
  /** SPRINT-12 additive: prep estimate phrasing; may contain "{minutes}". */
  prepEstimatePhrase?: string | null;
  /** SPRINT-12 additive: active announcement text (null when none / outside window). */
  announcement?: string | null;
};
