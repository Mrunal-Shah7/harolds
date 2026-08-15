// SPRINT-3: Phase 5 line pricing + receipt/kitchen snapshots.
// No rounding at line level: every input is already an integer number of cents, so rounding
// here could only introduce error, never remove it. Rounding enters only when a rate is
// applied, which happens once, in Phase 6 (computeTotals / applyBasisPoints).
import type { CartRequest, PricedLine, SelectedModifierSnapshot } from "@harolds/types";
import { multiplyCents, sumCents } from "./money";
import type { MenuCatalog, ResolvedItem } from "./menu-data";

/**
 * Price every line. Call only after validateCart returned no reasons.
 * Assumes every itemId resolves to an active item in the catalog.
 */
export function priceLines(cart: CartRequest, catalog: MenuCatalog): PricedLine[] {
  return cart.lines.map((line) => {
    const item = catalog.itemsById.get(line.itemId);
    if (!item || !item.isActive) {
      throw new Error(
        `priceLines called with unresolved item ${line.itemId} — validate the cart first`,
      );
    }
    return priceOneLine(line.itemId, line.quantity, line.selectedOptionIds, line.customerNote ?? null, item);
  });
}

function priceOneLine(
  itemId: string,
  quantity: number,
  selectedOptionIds: readonly string[],
  customerNote: string | null,
  item: ResolvedItem,
): PricedLine {
  const selected = new Set(selectedOptionIds);

  // Walk groups in per-item binding order; options in group sortOrder (catalog already ordered).
  const selectedModifiers: SelectedModifierSnapshot[] = [];
  const deltas: number[] = [];

  for (const group of item.groups) {
    // Options already in sortOrder in the resolved catalog; do not follow client order.
    const orderedOptions = [...group.options].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const option of orderedOptions) {
      if (!selected.has(option.id)) continue;
      deltas.push(option.priceDeltaCents);
      selectedModifiers.push({
        groupName: group.name,
        groupPrompt: group.prompt,
        optionName: option.name,
        priceDeltaCents: option.priceDeltaCents,
      });
    }
  }

  const baseUnitPriceCents = item.basePriceCents;
  const modifierTotalCents = sumCents(deltas);
  // Exact integer add — no rounding.
  const effectiveUnitPriceCents = baseUnitPriceCents + modifierTotalCents;
  const lineTotalCents = multiplyCents(effectiveUnitPriceCents, quantity);

  return {
    itemId,
    snapshot: {
      itemName: item.name,
      boardLabel: item.boardLabel,
      baseUnitPriceCents,
      modifierTotalCents,
      effectiveUnitPriceCents,
      quantity,
      lineTotalCents,
      selectedModifiers,
      customerNote,
    },
  };
}
