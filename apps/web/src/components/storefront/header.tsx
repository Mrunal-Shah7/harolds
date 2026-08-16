"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart-context";

export function StorefrontHeader({ onCartClick }: { onCartClick: () => void }) {
  const { totalItems } = useCart();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-brand-dark text-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-display text-2xl font-bold italic tracking-tight text-white">
            Harold&apos;s <span className="text-primary-foreground/90" style={{ color: "var(--gold)" }}>Chicken</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={onCartClick}
          aria-label="Open cart"
          className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
        >
          <ShoppingBag className="h-6 w-6" />
          {totalItems > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
              {totalItems}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
