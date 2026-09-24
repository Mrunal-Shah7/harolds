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
// The short "OPEN" pill stays on the logo's row. The long "ready in 20 min" sentence is what
// used to drop under it on a phone; that sentence still lives in the hours sheet, one tap away.
import Link from "next/link";
import type { StoreStatus } from "@harolds/types";
import { useCart } from "@/lib/cart-context";
import { StoreStatusPill } from "@/components/storefront/store-status-pill";

export function StorefrontHeader({
  status,
  onCartClick,
  compactStatus = false,
  showCart = true,
}: {
  status?: StoreStatus | null;
  onCartClick?: () => void;
  /**
   * One word ("OPEN") on the logo's row, instead of the long "ready in 20 min" sentence. The
   * complete state is still one tap away in the hours sheet.
   */
  compactStatus?: boolean;
  /** Checkout hides the cart button: the cart is the page, so a control that reopens it is noise. */
  showCart?: boolean;
}) {
  const { totalItems } = useCart();

  return (
    <header className="sf-header" role="banner">
      <div className="container">
        <Link href="/" className="wordmark" aria-label="Harold's Chicken Burnham, home">
          {/* Intrinsic size given so the row reserves its space before the image decodes. */}
          <img src="/logo.png" alt="Harold's Chicken" width={1314} height={580} />
        </Link>

        {status ? <StoreStatusPill status={status} compact={compactStatus} /> : null}

        {showCart ? (
          <button
            type="button"
            className="cart-btn"
            onClick={onCartClick}
            aria-label={totalItems > 0 ? `Cart, ${totalItems} items` : "Cart"}
          >
            Cart
            {totalItems > 0 ? <span className="cart-count">{totalItems}</span> : null}
          </button>
        ) : null}
      </div>

      {status && !compactStatus ? (
        <div className="subrow">
          <StoreStatusPill status={status} />
        </div>
      ) : null}
    </header>
  );
}
