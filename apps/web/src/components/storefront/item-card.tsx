"use client";

// Design v1.1 — the product card. A surface card whose 4:3 frame carries either the photograph
// or the paper-sunk initial tile, then name, two-line description, modifier hint, and a foot
// holding the price in ink beside the secondary "Add +".
//
// The two reused slots are the substance of the adaptation from the reference site:
//   - the corner badge carries SOLD OUT (or NEW), not a dietary marker;
//   - the third line carries a MODIFIER HINT, not a calorie count.
// Those are the facts our items actually hold.
import type { MenuItemSummary, MenuItemWithModifiers } from "@harolds/types";
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
   * sauce silently is how the wrong food gets made.
   */
  onQuickAdd?: (item: MenuItemSummary) => void;
  priority?: boolean;
}) {
  const soldOut = item.isSoldOut;
  const hint = modifierHint(item);

  const frame = (
    <div className="img">
      <MenuImage
        name={item.name}
        derivatives={item.imageDerivatives}
        imageUrl={item.imageUrl}
        priority={priority}
      />
      {soldOut ? <span className="corner-badge">Sold out</span> : null}
    </div>
  );

  const copy = (
    <>
      <h3>{item.name}</h3>
      {item.description ? <p className="desc">{item.description}</p> : null}
      {hint ? <p className="hint">{hint}</p> : null}
    </>
  );

  if (soldOut) {
    // Not tappable, but it stays in the grid — someone looking for a thing that isn't there
    // should find out rather than wonder.
    return (
      <div className="pcard card soldout">
        {frame}
        <div className="body">
          {copy}
          <div className="foot">
            <span className="price">{formatCents(item.basePriceCents)}</span>
            <span className="unavail">Unavailable</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    // The outer element is VISUAL ONLY — no click handler. "The whole card is the tap target"
    // is satisfied by the button below, which wraps the image, name and description and is
    // reachable by pointer and keyboard alike. A click handler on the div would be dead to the
    // keyboard and would double-fire on every mouse click as the button's event bubbles.
    <div className="pcard card">
      <button
        type="button"
        className="tap"
        onClick={() => onOpen(item)}
        aria-label={`${item.name}, ${formatCents(item.basePriceCents)}. Open item options`}
      >
        {frame}
      </button>

      <div className="body">
        {/* The copy block is the same tap target as the image. On a phone an item with no
            description is a single 25px line, so the mobile layer gives it a 44px floor. */}
        <button type="button" className="tap" tabIndex={-1} onClick={() => onOpen(item)}>
          {copy}
        </button>

        <div className="foot">
          <span className="price">{formatCents(item.basePriceCents)}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (onQuickAdd) onQuickAdd(item);
              else onOpen(item);
            }}
            aria-label={onQuickAdd ? `Add ${item.name} to cart` : `Choose options for ${item.name}`}
          >
            Add +
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The third line — the slot the reference site spends on a calorie count. The full-menu payload
 * nests `modifierGroups` on each item (MenuItemWithModifiers), so the hint is real data, not a
 * guess, and no contract field was added for it.
 */
function modifierHint(item: MenuItemSummary): string | null {
  const groups = (item as MenuItemWithModifiers).modifierGroups;
  if (!groups || groups.length === 0) return null;
  const required = groups.find((g) => g.isRequired);
  return required ? required.prompt : "Choose your options";
}

/** Direct add is permitted only when nothing is required. Exported for the menu page. */
export function hasRequiredGroups(item: MenuItemSummary): boolean {
  const groups = (item as MenuItemWithModifiers).modifierGroups;
  return Boolean(groups?.some((g) => g.isRequired));
}
