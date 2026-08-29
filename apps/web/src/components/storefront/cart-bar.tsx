"use client";

// Design v1.1 — the mobile cart bar. A brand pill floating clear of the bottom edge, present
// only when the cart is non-empty, hidden at 768px and above where the cart is a sheet.
//
// The bar shows the item count and the action, NOT a total: the only lawful source for a money
// figure is the server quote, and the storefront does not quote until checkout. A
// client-computed total here is exactly the defect this design removes.
import { useCart } from "@/lib/cart-context";

export function CartBar({ onOpen }: { onOpen: () => void }) {
  const { totalItems } = useCart();

  if (totalItems === 0) return null;

  return (
    <button type="button" className="cart-bar on" onClick={onOpen}>
      <span>
        {totalItems} {totalItems === 1 ? "item" : "items"} in your order
      </span>
      <span>View cart</span>
    </button>
  );
}
