"use client";

// Design v1.1 — the mobile cart bar. A brand pill floating clear of the bottom edge, present
// only when the cart is non-empty, hidden at 768px and above where the cart is a sheet.
//
// The bar shows the item count and the action, NOT a total: the only lawful source for a money
// figure is the server quote, and the storefront does not quote until checkout. A
// client-computed total here is exactly the defect this design removes.
//
// It is `position: fixed`, so it renders a SPACER of its own height alongside itself. Without
// that the bar sits on top of the last card and the footer's first rows — and because the bar
// only exists when the cart does, so does the space it needs.
import { useCart } from "@/lib/cart-context";

export function CartBar({ onOpen }: { onOpen: () => void }) {
  const { totalItems } = useCart();

  if (totalItems === 0) return null;

  return (
    <>
      <div className="cart-bar-spacer" aria-hidden="true" />
      <button type="button" className="cart-bar on" onClick={onOpen}>
        <span>
          {totalItems} {totalItems === 1 ? "item" : "items"} in your order
        </span>
        <span>View cart</span>
      </button>
    </>
  );
}
