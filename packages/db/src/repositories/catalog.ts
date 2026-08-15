// SPRINT-3: batch-load menu items + bound modifiers for quote resolution (constant queries).
import { prisma } from "../client";

export type QuoteItemRow = {
  id: string;
  name: string;
  boardLabel: string | null;
  basePriceCents: number;
  isActive: boolean;
  isSoldOut: boolean;
  sortOrder: number;
  groups: {
    id: string;
    name: string;
    prompt: string;
    isRequired: boolean;
    minSelect: number;
    maxSelect: number;
    isActive: boolean;
    sortOrder: number;
    options: {
      id: string;
      name: string;
      priceDeltaCents: number;
      isActive: boolean;
      isSoldOut: boolean;
      sortOrder: number;
    }[];
  }[];
};

/**
 * Resolve many items for a cart in 2 queries (items, then bindings+groups+options).
 * Includes inactive items so validation can treat them as NOT_FOUND identically.
 */
export async function fetchItemsForQuote(itemIds: string[]): Promise<QuoteItemRow[]> {
  const unique = [...new Set(itemIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const items = await prisma.menuItem.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      name: true,
      boardLabel: true,
      basePriceCents: true,
      isActive: true,
      isSoldOut: true,
      sortOrder: true,
    },
  });

  const bindings = await prisma.itemModifierGroup.findMany({
    where: { itemId: { in: items.map((i) => i.id) } },
    orderBy: { sortOrder: "asc" },
    include: {
      group: {
        include: {
          options: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  const byItem = new Map<string, typeof bindings>();
  for (const b of bindings) {
    const list = byItem.get(b.itemId) ?? [];
    list.push(b);
    byItem.set(b.itemId, list);
  }

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    boardLabel: item.boardLabel,
    basePriceCents: item.basePriceCents,
    isActive: item.isActive,
    isSoldOut: item.isSoldOut,
    sortOrder: item.sortOrder,
    groups: (byItem.get(item.id) ?? []).map((b) => ({
      id: b.group.id,
      name: b.group.name,
      prompt: b.group.prompt,
      isRequired: b.group.isRequired,
      minSelect: b.group.minSelect,
      maxSelect: b.group.maxSelect,
      isActive: b.group.isActive,
      sortOrder: b.sortOrder,
      options: b.group.options.map((o) => ({
        id: o.id,
        name: o.name,
        priceDeltaCents: o.priceDeltaCents,
        isActive: o.isActive,
        isSoldOut: o.isSoldOut,
        sortOrder: o.sortOrder,
      })),
    })),
  }));
}
