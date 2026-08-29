"use client";

// SPRINT-14: the item card (design.md §7.2), rebuilt to the specified anatomy.
//
// The two reused slots are the substance of the adaptation from the reference site:
//   - the badge slot carries SOLD OUT, not a dietary marker;
//   - the third line carries a MODIFIER HINT, not a calorie count.
// Those are the facts our items actually hold.
import type { MenuItemSummary, MenuItemWithModifiers } from "@harolds/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MenuImage } from "@/components/storefront/menu-image";
import { formatCents } from "@/lib/money";

export function ItemCard({
  item,
  onOpen,
  onQuickAdd,
  priority = false,
}: {
  item: MenuItemSummary;
  /** Opens the modal. The whole card is this tap target. */
  onOpen: (item: MenuItemSummary) => void;
  /**
   * Adds directly. Only wired when the item has NO required modifier groups — adding a default
   * sauce silently is how the wrong food gets made (§7.2).
   */
  onQuickAdd?: (item: MenuItemSummary) => void;
  priority?: boolean;
}) {
  const soldOut = item.isSoldOut;
  const hint = modifierHint(item);

  const body = (
    <>
      <div className={soldOut ? "opacity-45" : undefined}>
        <MenuImage
          name={item.name}
          derivatives={item.imageDerivatives}
          imageUrl={item.imageUrl}
          priority={priority}
        />
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <h3 className="t-display-md text-ink">{item.name}</h3>
        {soldOut ? <Badge variant="soldOut">Sold out</Badge> : null}
      </div>

      {item.description ? (
        <p className="t-body mt-1 line-clamp-2 text-ink-muted">{item.description}</p>
      ) : null}

      {hint ? <p className="t-body-sm mt-1 text-ink-faint">{hint}</p> : null}
    </>
  );

  if (soldOut) {
    // §7.2: not tappable, but it stays in the grid — someone looking for a thing that isn't
    // there should find out rather than wonder.
    return (
      <div className="rounded-md border border-line bg-surface p-4 shadow-card md:p-5">
        {body}
        <div className="mt-4 flex items-center justify-between">
          <p className="t-display-sm t-nums text-ink">{formatCents(item.basePriceCents)}</p>
          <span className="t-body font-semibold text-ink-faint">Unavailable</span>
        </div>
      </div>
    );
  }

  return (
    // The outer element is VISUAL ONLY — no click handler. §7.2's "whole card is the tap
    // target" is satisfied by the button below, which wraps the image, name and description and
    // is reachable by pointer and keyboard alike. A click handler on the div would be dead to
    // the keyboard and would double-fire on every mouse click as the button's event bubbles.
    <div className="motion-base group rounded-md border border-line bg-surface p-4 shadow-card transition-shadow hover:-translate-y-0.5 hover:shadow-raised md:p-5">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="block w-full text-left"
        aria-label={`${item.name}, ${formatCents(item.basePriceCents)}. Open item options`}
      >
        {body}
      </button>

      <div className="mt-4 flex items-center justify-between">
        <p className="t-display-sm t-nums text-ink">{formatCents(item.basePriceCents)}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (onQuickAdd) onQuickAdd(item);
            else onOpen(item);
          }}
          aria-label={onQuickAdd ? `Add ${item.name} to cart` : `Choose options for ${item.name}`}
        >
          Add +
        </Button>
      </div>
    </div>
  );
}

/**
 * §7.2 third line — the slot the reference site spends on a calorie count. The full-menu payload
 * nests `modifierGroups` on each item (MenuItemWithModifiers), so the hint is real data, not a
 * guess, and no contract field was added for it.
 */
function modifierHint(item: MenuItemSummary): string | null {
  const groups = (item as MenuItemWithModifiers).modifierGroups;
  if (!groups || groups.length === 0) return null;
  const required = groups.find((g) => g.isRequired);
  return required ? required.prompt : "Choose your options";
}

/** §7.2: direct add is permitted only when nothing is required. Exported for the menu page. */
export function hasRequiredGroups(item: MenuItemSummary): boolean {
  const groups = (item as MenuItemWithModifiers).modifierGroups;
  return Boolean(groups?.some((g) => g.isRequired));
}
