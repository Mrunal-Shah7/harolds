"use client";

// Design v1.1 — the storefront header. Four elements in one 64px row on a surface band:
// the poster wordmark with its mono subline, the store status pill, the labelled theme toggle,
// and the cart button with its mono count.
//
// The wordmark is the text placeholder pending the logo SVG, set in the poster face in
// Harold's Red. It is a deliberate placeholder, not a design choice.
//
// SCREEN FIT ONLY: below 768px the four elements cannot share one 64px row, so the status pill
// renders in a sub-row directly beneath. Same element, same styling — see globals.css.
import Link from "next/link";
import type { StoreStatus } from "@harolds/types";
import { useCart } from "@/lib/cart-context";
import { StoreStatusPill } from "@/components/storefront/store-status-pill";
import { ThemeToggle } from "@/components/storefront/theme-toggle";

export function StorefrontHeader({
  status,
  onCartClick,
}: {
  status?: StoreStatus | null;
  onCartClick?: () => void;
}) {
  const { totalItems } = useCart();

  return (
    <header className="sf-header" role="banner">
      <div className="container">
        <Link href="/" className="wordmark" aria-label="Harold's, home">
          Harold&apos;s<small>Chicken · Oak Lawn</small>
        </Link>

        {status ? <StoreStatusPill status={status} /> : null}

        <ThemeToggle />

        <button
          type="button"
          className="cart-btn"
          onClick={onCartClick}
          aria-label={totalItems > 0 ? `Cart, ${totalItems} items` : "Cart"}
        >
          Cart
          {totalItems > 0 ? <span className="cart-count">{totalItems}</span> : null}
        </button>
      </div>

      {status ? (
        <div className="subrow">
          <StoreStatusPill status={status} />
        </div>
      ) : null}
    </header>
  );
}
