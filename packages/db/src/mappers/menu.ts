// SPRINT-2: Prisma/DB menu shapes → public API contract types (no Prisma imports here — plain objects).
import type {
  CategorySummary,
  MenuCategory,
  MenuItemDetail,
  MenuItemSummary,
  MenuModifierGroup,
  MenuModifierOption,
} from "@harolds/types";

/** Minimal DB row shapes accepted by mappers (subset of Prisma selects). */
export type DbModifierOption = {
  id: string;
  name: string;
  priceDeltaCents: number;
  isSoldOut: boolean;
  isDefaultSelected: boolean;
  sortOrder: number;
};

export type DbModifierGroup = {
  id: string;
  prompt: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
};

export type DbMenuItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  imageUrl: string | null;
  isSoldOut: boolean;
  isFeatured: boolean;
  isMostOrdered: boolean;
  sortOrder: number;
};

export type DbCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
};

export function mapModifierOption(row: DbModifierOption): MenuModifierOption {
  return {
    id: row.id,
    name: row.name,
    priceDeltaCents: row.priceDeltaCents,
    isSoldOut: row.isSoldOut,
    isDefaultSelected: row.isDefaultSelected,
    sortOrder: row.sortOrder,
  };
}

/**
 * Map a modifier group bound to an item.
 * `sortOrder` is the ItemModifierGroup binding order (per-item), not the group's own sortOrder.
 */
export function mapModifierGroup(
  group: DbModifierGroup,
  bindingSortOrder: number,
  options: DbModifierOption[],
): MenuModifierGroup {
  return {
    id: group.id,
    prompt: group.prompt,
    isRequired: group.isRequired,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    sortOrder: bindingSortOrder,
    options: options.map(mapModifierOption),
  };
}

export function mapMenuItemSummary(row: DbMenuItem): MenuItemSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    basePriceCents: row.basePriceCents,
    imageUrl: row.imageUrl,
    isSoldOut: row.isSoldOut,
    isFeatured: row.isFeatured,
    isMostOrdered: row.isMostOrdered,
    sortOrder: row.sortOrder,
  };
}

export function mapMenuItemDetail(
  item: DbMenuItem,
  category: Pick<DbCategory, "id" | "slug">,
  modifierGroups: MenuModifierGroup[],
): MenuItemDetail {
  return {
    ...mapMenuItemSummary(item),
    categoryId: category.id,
    categorySlug: category.slug,
    modifierGroups,
  };
}

export function mapMenuCategory(
  category: DbCategory,
  items: Array<{ item: DbMenuItem; modifierGroups: MenuModifierGroup[] }>,
): MenuCategory {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    items: items.map(({ item, modifierGroups }) => ({
      ...mapMenuItemSummary(item),
      modifierGroups,
    })),
  };
}

export function mapCategorySummary(
  category: DbCategory,
  activeItemCount: number,
): CategorySummary {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    activeItemCount,
  };
}
