"use client";

// The storefront's polite live region and the undo toast.
//
// One region announces cart changes so a screen-reader user hears the result of an action
// instead of inferring it. The undo toast is the ONE permitted actionable toast — removal must be
// undoable rather than confirmed. Nothing is lost if it is ignored: the line stays removed.
// It sits on the roast surface with the flame action, so it reads as the system speaking rather
// than as part of the page.
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart-context";

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
          <div
            className="animate-slide-in-bottom pointer-events-auto mb-20 flex items-center gap-4 md:mb-4"
            style={{
              background: "var(--roast)",
              color: "var(--ink-on-roast)",
              borderRadius: "var(--r-md)",
              boxShadow: "var(--ev-overlay)",
              padding: "12px 16px",
            }}
          >
            <p>Removed {lastRemoved.line.item.name}.</p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={undoRemove}
              style={{ color: "var(--flame)" }}
            >
              Undo
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
