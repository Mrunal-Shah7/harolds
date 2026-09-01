// SPRINT-3: plain menu catalog shapes for the pricing engine — no Prisma / no @harolds/db.

/** Modifier option as resolved for pricing/validation. */
export type ResolvedOption = {
  id: string;
  name: string;
  priceDeltaCents: number;
  isActive: boolean;
  isSoldOut: boolean;
  sortOrder: number;
};

/** Modifier group bound to an item, with options already filtered/ordered for that binding. */
export type ResolvedGroup = {
  id: string;
  /** Internal staff-facing name — persisted on line snapshots. */
  name: string;
  prompt: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  isActive: boolean;
  sortOrder: number;
  options: ResolvedOption[];
};

/** Menu item with modifier groups in per-item binding order. */
export type ResolvedItem = {
  id: string;
  name: string;
  boardLabel: string | null;
  basePriceCents: number;
  isActive: boolean;
  isSoldOut: boolean;
  sortOrder: number;
  /**
   * Admin-set ceiling for this item in one order. Absent or null means no item-specific limit,
   * which is the common case, so callers that predate the field stay valid.
   */
  maxQuantityPerOrder?: number | null;
  groups: ResolvedGroup[];
};

/** In-memory catalog keyed by item id. Callers assemble this from repositories / fixtures. */
export type MenuCatalog = {
  itemsById: Map<string, ResolvedItem>;
};
