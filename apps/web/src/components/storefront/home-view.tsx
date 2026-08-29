"use client";

// SPRINT-14: home (design.md §9.1). Hero, category rail, most-ordered, footer.
import { useState } from "react";
import Link from "next/link";
import type { FullMenu, MenuItemSummary, StoreStatus } from "@harolds/types";
import { StorefrontHeader } from "@/components/storefront/header";
import { AnnouncementStrip } from "@/components/storefront/announcement-strip";
import { StorefrontFooter } from "@/components/storefront/footer";
import { CategoryRail } from "@/components/storefront/category-rail";
import { ItemCard, hasRequiredGroups } from "@/components/storefront/item-card";
import { ItemModal } from "@/components/storefront/item-modal";
import { CartSheet } from "@/components/storefront/cart-sheet";
import { CartBar } from "@/components/storefront/cart-bar";
import { CartAnnouncer } from "@/components/storefront/cart-announcer";
import { ErrorState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { storeStatusLabel } from "@/components/storefront/store-status-pill";
import { useCart } from "@/lib/cart-context";

export function HomeView({
  menu,
  status,
  mostOrdered,
}: {
  menu: FullMenu | null;
  status: StoreStatus | null;
  mostOrdered: MenuItemSummary[];
}) {
  const { addLine } = useCart();
  const [selected, setSelected] = useState<MenuItemSummary | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  // §12 Error: what failed, in plain words, plus a retry that retries. No status codes.
  if (!menu || !status) {
    return (
      <div className="min-h-dvh">
        <StorefrontHeader status={status} onCartClick={() => setCartOpen(true)} />
        <ErrorState
          message="We couldn't load the menu. Try again."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  const categories = menu.categories.filter((c) => c.items.length > 0);
  const closed = !status.isOpen || !status.acceptingOrders;
  const { label: statusLabel } = storeStatusLabel(status);

  const quickAdd = (item: MenuItemSummary) => {
    addLine({
      item,
      quantity: 1,
      selectedOptionIds: [],
      optionLabels: [],
      customerNote: null,
    });
  };

  return (
    <div className="min-h-dvh pb-24 md:pb-0">
      <StorefrontHeader status={status} onCartClick={() => setCartOpen(true)} />
      <AnnouncementStrip announcement={status.announcement} />

      <main className="mx-auto max-w-[1200px] px-4">
        {/* §9.1 static hero. */}
        <section className="grid items-center gap-6 py-10 md:grid-cols-2 md:gap-10 md:py-16">
          <div className="order-2 md:order-1">
            <h1 className="t-display-xl text-ink">
              Order pickup
              <br />
              from Oak Lawn
            </h1>
            <p className="t-body-lg mt-3 text-ink-muted">
              Ready in about {status.prepMinutes} minutes.
            </p>
            <div className="mt-6">
              <Link href="/menu">
                <Button size="lg">See the menu</Button>
              </Link>
            </div>
            {/* §9.1: browsing stays available when closed; only checkout is blocked, and it is
                blocked at the point of blocking with an explanation. */}
            {closed ? <p className="t-body mt-3 text-danger">{statusLabel}</p> : null}
          </div>

          <div className="order-1 rounded-lg bg-paper-sunk md:order-2">
            <div
              className="flex aspect-[4/3] w-full items-center justify-center"
              aria-hidden="true"
            >
              <span className="t-display-lg text-ink-faint opacity-40">Harold&apos;s</span>
            </div>
          </div>
        </section>

        {categories.length > 0 ? (
          <section className="py-10 md:py-16">
            <div className="mb-5 flex items-baseline justify-between gap-4">
              <h2 className="t-display-lg text-ink">Our menu</h2>
              <Link href="/menu" className="t-body font-semibold text-brand underline-offset-4 hover:underline">
                See all
              </Link>
            </div>
            <CategoryRail categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
          </section>
        ) : null}

        {/* §9.1: hidden ENTIRELY when the curated list is empty. */}
        {mostOrdered.length > 0 ? (
          <section className="py-10 md:py-16">
            <h2 className="t-display-lg mb-5 text-ink">Most ordered</h2>
            <div className="grid gap-3 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
              {mostOrdered.map((item, i) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  priority={i === 0}
                  onOpen={setSelected}
                  onQuickAdd={hasRequiredGroups(item) ? undefined : quickAdd}
                />
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <StorefrontFooter status={status} />

      <ItemModal item={selected} onClose={() => setSelected(null)} />
      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} />
      <CartBar onOpen={() => setCartOpen(true)} />
      <CartAnnouncer />
    </div>
  );
}
