// SPRINT-3: adapt DB quote rows / fixture-like shapes into a MenuCatalog for the pure engine
import type { MenuCatalog, ResolvedItem } from "./menu-data";

export function toMenuCatalog(
  items: Array<{
    id: string;
    name: string;
    boardLabel: string | null;
    basePriceCents: number;
    isActive: boolean;
    isSoldOut: boolean;
    sortOrder: number;
    groups: ResolvedItem["groups"];
  }>,
): MenuCatalog {
  const itemsById = new Map<string, ResolvedItem>();
  for (const item of items) {
    itemsById.set(item.id, item);
  }
  return { itemsById };
}
