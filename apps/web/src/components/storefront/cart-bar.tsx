"use client";

// Design v1.1 — the mobile cart bar. A brand pill floating clear of the bottom edge, present
// only when the cart is non-empty, hidden at 768px and above where the cart is a sheet.
//
// The bar shows the item count, the running item total, and the action.
//
// That total is a CLIENT estimate — items only, no tax and no tip — and it is the one place the
// storefront shows money it did not get from a server quote. The rule it bends is real: the
// server is the only authority on price. It is bent deliberately and narrowly, because a cart
// bar that cannot say what the food costs until checkout is a cart bar that makes people open
// the cart to find out. The estimate is labelled as items-only, is superseded by the quote the
// moment checkout renders one, and is never sent back to the server -- `toCartRequest` omits it.
//
// It is `position: fixed`, so it renders a SPACER of its own height alongside itself. Without
// that the bar sits on top of the last card and the footer's first rows — and because the bar
// only exists when the cart does, so does the space it needs.
import { useCart } from "@/lib/cart-context";
import { formatCents } from "@/lib/money";

export function CartBar({ onOpen }: { onOpen: () => void }) {
  const { totalItems, subtotalCents } = useCart();

  if (totalItems === 0) return null;

  return (
    <>
      <div className="cart-bar-spacer" aria-hidden="true" />
      <button type="button" className="cart-bar on" onClick={onOpen}>
        <span className="cart-bar-count">
          {totalItems} {totalItems === 1 ? "item" : "items"}
          <span className="cart-bar-sub t-nums">{formatCents(subtotalCents)}</span>
        </span>
        <span>View cart</span>
      </button>
    </>
  );
}
