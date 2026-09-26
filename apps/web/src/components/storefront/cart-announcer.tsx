"use client";

// The storefront's polite live region for cart changes.
//
// One region announces cart changes so a screen-reader user hears the result of an action
// instead of inferring it.
//
// SPRINT-19: the "Removed X. Undo" toast is gone, at the operator's request. A removal from a
// stepper or the cart is now simply a removal. The line stays removed. The cart still records the
// last removal for its undo API, but nothing offers it, so the record is cleared straight away
// rather than left to linger.
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart-context";

export function CartAnnouncer() {
  const { totalItems, lastRemoved, dismissUndo } = useCart();
  const [message, setMessage] = useState("");
  const previousCount = useRef<number | null>(null);

  useEffect(() => {
    if (previousCount.current === null) {
      previousCount.current = totalItems;
      return;
    }
    if (totalItems === previousCount.current) return;
    const added = totalItems > previousCount.current;
    previousCount.current = totalItems;
    setMessage(
      totalItems === 0
        ? "Your cart is empty."
        : `${added ? "Added to cart" : "Removed from cart"}. ${totalItems} ${totalItems === 1 ? "item" : "items"} in your cart.`,
    );
  }, [totalItems]);

  useEffect(() => {
    if (lastRemoved) dismissUndo();
  }, [lastRemoved, dismissUndo]);

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
