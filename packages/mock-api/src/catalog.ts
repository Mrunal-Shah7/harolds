// SPRINT-3: build MenuCatalog from mock menu fixtures for the shared pure pricing engine
import type { FullMenu, MenuItemWithModifiers } from "@harolds/types";
import { toMenuCatalog, type MenuCatalog, type ResolvedItem } from "@harolds/pricing";
import { boardLabelsFixture, groupNamesFixture, menuFixture } from "./fixtures";

/**
 * Mock catalog treats fixture items as active unless meta marks sold-out.
 * Board labels and internal group names come from Sprint 3/4 side fixtures so
 * quote/order snapshots match the real API without expanding the public menu contract.
 */
export function buildCatalogFromFixtures(
  menu: FullMenu = menuFixture,
  overrides?: {
    soldOutItemIds?: Set<string>;
    soldOutOptionIds?: Set<string>;
  },
): MenuCatalog {
  const soldOutItems = overrides?.soldOutItemIds ?? new Set<string>();
  const soldOutOptions = overrides?.soldOutOptionIds ?? new Set<string>();
  const items: ResolvedItem[] = [];

  for (const cat of menu.categories) {
    for (const item of cat.items) {
      items.push(toResolvedItem(item, soldOutItems, soldOutOptions));
    }
  }

  return toMenuCatalog(items);
}

function toResolvedItem(
  item: MenuItemWithModifiers,
  soldOutItems: Set<string>,
  soldOutOptions: Set<string>,
): ResolvedItem {
  return {
    id: item.id,
    name: item.name,
    boardLabel: boardLabelsFixture[item.id] ?? null,
    basePriceCents: item.basePriceCents,
    isActive: true,
    isSoldOut: item.isSoldOut || soldOutItems.has(item.id),
    sortOrder: item.sortOrder,
    groups: item.modifierGroups.map((g) => ({
      id: g.id,
      name: groupNamesFixture[g.id] ?? g.prompt,
      prompt: g.prompt,
      isRequired: g.isRequired,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      isActive: true,
      sortOrder: g.sortOrder,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        priceDeltaCents: o.priceDeltaCents,
        isActive: true,
        isSoldOut: o.isSoldOut || soldOutOptions.has(o.id),
        sortOrder: o.sortOrder,
      })),
    })),
  };
}
