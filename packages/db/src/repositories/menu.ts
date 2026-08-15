// SPRINT-2: read-only menu repositories — active entities only; sold-out included with flag.
import type {
  CategorySummary,
  FullMenu,
  MenuItemDetail,
  MenuItemSummary,
  MenuModifierGroup,
} from "@harolds/types";
import { prisma } from "../client";
import {
  mapCategorySummary,
  mapMenuCategory,
  mapMenuItemDetail,
  mapMenuItemSummary,
  mapModifierGroup,
} from "../mappers/menu";

const activeItemWhere = { isActive: true } as const;
const activeGroupWhere = { isActive: true } as const;
const activeOptionWhere = { isActive: true } as const;

async function fetchBindingsForItemIds(itemIds: string[]) {
  if (itemIds.length === 0) return [];
  return prisma.itemModifierGroup.findMany({
    where: {
      itemId: { in: itemIds },
      group: activeGroupWhere,
    },
    orderBy: { sortOrder: "asc" },
    include: {
      group: {
        include: {
          options: {
            where: activeOptionWhere,
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
}

function groupsForItem(
  itemId: string,
  bindings: Awaited<ReturnType<typeof fetchBindingsForItemIds>>,
): MenuModifierGroup[] {
  return bindings
    .filter((b) => b.itemId === itemId)
    .map((b) => mapModifierGroup(b.group, b.sortOrder, b.group.options));
}

/**
 * Full menu in 2 queries:
 *  1) active categories with nested active items (`orderBy` sortOrder)
 *  2) ItemModifierGroup rows (+ active groups/options) for those item ids
 *
 * Assembled in memory; each item includes its modifier groups for the item modal.
 */
export async function getFullMenu(): Promise<FullMenu> {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: activeItemWhere,
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  const itemIds = categories.flatMap((c) => c.items.map((i) => i.id));
  const bindings = await fetchBindingsForItemIds(itemIds);

  return {
    categories: categories.map((cat) =>
      mapMenuCategory(
        cat,
        cat.items.map((item) => ({
          item,
          modifierGroups: groupsForItem(item.id, bindings),
        })),
      ),
    ),
  };
}

export async function getCategories(): Promise<CategorySummary[]> {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: {
        select: { items: { where: activeItemWhere } },
      },
    },
  });

  return categories.map((cat) => mapCategorySummary(cat, cat._count.items));
}

async function loadItemDetail(item: {
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
  isActive: boolean;
  category: { id: string; slug: string; isActive: boolean };
}): Promise<MenuItemDetail | null> {
  if (!item.isActive || !item.category.isActive) return null;
  const bindings = await fetchBindingsForItemIds([item.id]);
  return mapMenuItemDetail(item, item.category, groupsForItem(item.id, bindings));
}

export async function getItemById(id: string): Promise<MenuItemDetail | null> {
  const item = await prisma.menuItem.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, slug: true, isActive: true } },
    },
  });
  if (!item) return null;
  return loadItemDetail(item);
}

export async function getItemBySlugs(
  categorySlug: string,
  itemSlug: string,
): Promise<MenuItemDetail | null> {
  const item = await prisma.menuItem.findFirst({
    where: {
      slug: itemSlug,
      isActive: true,
      category: { slug: categorySlug, isActive: true },
    },
    include: {
      category: { select: { id: true, slug: true, isActive: true } },
    },
  });
  if (!item) return null;
  return loadItemDetail(item);
}

export async function getFeaturedItems(): Promise<MenuItemSummary[]> {
  const items = await prisma.menuItem.findMany({
    where: { isActive: true, isFeatured: true },
    orderBy: [{ featuredSortOrder: "asc" }, { sortOrder: "asc" }],
  });
  return items.map(mapMenuItemSummary);
}

export async function getMostOrderedItems(): Promise<MenuItemSummary[]> {
  const items = await prisma.menuItem.findMany({
    where: { isActive: true, isMostOrdered: true },
    orderBy: [{ mostOrderedSortOrder: "asc" }, { sortOrder: "asc" }],
  });
  return items.map(mapMenuItemSummary);
}

/** ETag string from max(updatedAt) across Category, MenuItem, ModifierGroup, ModifierOption, ItemModifierGroup. */
export async function getMenuEtag(): Promise<string> {
  const [cat, item, group, option, binding] = await Promise.all([
    prisma.category.aggregate({ _max: { updatedAt: true } }),
    prisma.menuItem.aggregate({ _max: { updatedAt: true } }),
    prisma.modifierGroup.aggregate({ _max: { updatedAt: true } }),
    prisma.modifierOption.aggregate({ _max: { updatedAt: true } }),
    prisma.itemModifierGroup.aggregate({ _max: { updatedAt: true } }),
  ]);

  const stamps = [
    cat._max.updatedAt,
    item._max.updatedAt,
    group._max.updatedAt,
    option._max.updatedAt,
    binding._max.updatedAt,
  ]
    .filter((d): d is Date => d != null)
    .map((d) => d.getTime());

  if (stamps.length === 0) return "menu-empty";
  return `menu-${Math.max(...stamps)}`;
}
