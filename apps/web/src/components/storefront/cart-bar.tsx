"use client";

// SPRINT-14: the mobile cart bar (design.md §7.7). Appears only when the cart is non-empty,
// clears the device safe area, and is hidden on desktop where the cart is a sheet.
//
// DEVIATION FROM §7.7, RECORDED: the bar shows the item count and the action, NOT a total.
// design.md §7.7 puts the total in the centre of this bar, but the only lawful source for a
// money figure is the server quote (§7.7 itself, and Phase 6.2), and the storefront does not
// quote until checkout. Adding a quote request here would be a new request on every cart change
// from the menu page — a behaviour change, which Critical rule 5 forbids outright. Showing a
// client-computed total instead is exactly the defect this sprint removes. So the bar carries no
// money, and design.md §7.7 is amended to say so.
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart-context";

export function CartBar({ onOpen }: { onOpen: () => void }) {
  const { totalItems } = useCart();

  if (totalItems === 0) return null;

  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-cart-bar px-4 pt-3 md:hidden">
      <button
        type="button"
        onClick={onOpen}
        className="t-body animate-slide-in-bottom flex h-13 w-full items-center justify-between rounded-pill bg-brand px-5 font-semibold text-surface shadow-raised motion-fast transition-colors hover:bg-brand-hover"
      >
        <span className="inline-flex items-center gap-2">
          <ShoppingBag className="h-5 w-5" aria-hidden="true" />
          {totalItems} {totalItems === 1 ? "item" : "items"}
        </span>
        <span>View cart</span>
      </button>
    </div>
  );
}
