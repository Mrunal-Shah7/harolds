"use client";

// Design v1.1 — the storefront header. Three elements in one 64px row on a surface band:
// the logo, the store status pill, and the cart button with its mono count.
//
// The logo replaces the text wordmark that stood in for it. `.wordmark` is kept as the class
// so the header's layout rules (flex-none, the 44px tap floor, the mobile sizing) still apply
// to the link; only its contents changed from type to an image.
//
// The theme toggle that used to sit here is hidden — light only, for now. See app/layout.tsx.
//
// SCREEN FIT ONLY: below 768px the status pill renders in a sub-row beneath the logo and cart,
// because the three cannot share one 64px row at 390px. Same element, same styling.
import Link from "next/link";
import type { StoreStatus } from "@harolds/types";
import { useCart } from "@/lib/cart-context";
import { StoreStatusPill } from "@/components/storefront/store-status-pill";

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
        <Link href="/" className="wordmark" aria-label="Harold's Chicken Burnham, home">
          {/* Intrinsic size given so the row reserves its space before the image decodes. */}
          <img src="/logo.jpeg" alt="Harold's Chicken" width={1320} height={588} />
        </Link>

        {status ? <StoreStatusPill status={status} /> : null}

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
