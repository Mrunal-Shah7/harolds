"use client";

// SPRINT-14: the storefront's polite live region and the undo toast (design.md §12, §14, §7.7).
//
// One region announces cart changes so a screen-reader user hears the result of an action
// instead of inferring it. The undo toast is the ONE permitted actionable toast: §16 item 8
// forbids toasts for things the person must act on, and Phase 6.3 explicitly requires removal to
// be undoable rather than confirmed. Nothing is lost if it is ignored — the line stays removed.
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart-context";
import { Button } from "@/components/ui/button";

const UNDO_WINDOW_MS = 8000;

export function CartAnnouncer() {
  const { totalItems, lastRemoved, undoRemove, dismissUndo } = useCart();
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
    if (!lastRemoved) return;
    const timer = setTimeout(dismissUndo, UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [lastRemoved, dismissUndo]);

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </div>

      {lastRemoved ? (
        <div className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-toast flex justify-center px-4">
          <div className="animate-slide-in-bottom pointer-events-auto mb-20 flex items-center gap-4 rounded-md bg-ink px-4 py-3 shadow-overlay md:mb-4">
            <p className="t-body text-paper">Removed {lastRemoved.line.item.name}.</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={undoRemove}
              className="text-gold hover:bg-ink hover:text-gold"
            >
              Undo
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
