"use client";

// SPRINT-14: the header (design.md §7.4). Wordmark, store status pill, cart —
// and, since SPRINT-17, a FOURTH element: the theme toggle. §7.4 was amended in the same change
// that added it. On mobile it sits in the sub-row beside the status pill rather than crowding
// the top row at 390px, and it keeps a visible text label per §16.4.
// No login, no search, no locator, no deals — those features do not exist and building UI for
// them is the failure §16 item 10 prohibits.
//
// The wordmark is the §2.1 text placeholder, in Display 800 in Harold's Red. It is a deliberate
// placeholder pending the logo SVG, not a design choice.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import type { StoreStatus } from "@harolds/types";
import { useCart } from "@/lib/cart-context";
import { StoreStatusPill } from "@/components/storefront/store-status-pill";
import { ThemeToggle } from "@/components/storefront/theme-toggle";
import { cn } from "@/lib/utils";

export function StorefrontHeader({
  status,
  onCartClick,
}: {
  status?: StoreStatus | null;
  onCartClick?: () => void;
}) {
  const { totalItems } = useCart();
  const [scrolled, setScrolled] = useState(false);

  // §7.4: the shadow appears only once scrolled past 8px.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-sticky-header bg-surface motion-base transition-shadow",
        scrolled && "shadow-raised",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 md:h-18">
        <Link href="/" className="t-display-md shrink-0 text-brand" aria-label="Harold's, home">
          <span className="uppercase tracking-[-0.02em]">Harold&apos;s</span>
        </Link>

        <div className="hidden min-w-0 flex-1 justify-center md:flex">
          {status ? <StoreStatusPill status={status} /> : null}
        </div>

        <ThemeToggle className="hidden md:inline-flex" />

        <button
          type="button"
          onClick={onCartClick}
          aria-label={totalItems > 0 ? `Open cart, ${totalItems} items` : "Open cart"}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-ink motion-fast transition-colors hover:bg-paper-sunk"
        >
          <ShoppingBag className="h-5 w-5" aria-hidden="true" />
          {totalItems > 0 && (
            <span className="t-label absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-pill bg-brand px-1 text-surface">
              {totalItems}
            </span>
          )}
        </button>
      </div>

      {/* §7.4: on mobile the pill and the toggle sit below the row rather than being squeezed
          into it. The row renders even when the status failed to load, so the toggle does not
          disappear on the error state. */}
      <div className="flex items-center justify-center gap-2 px-4 pb-2 md:hidden">
        {status ? <StoreStatusPill status={status} /> : null}
        <ThemeToggle />
      </div>
    </header>
  );
}
