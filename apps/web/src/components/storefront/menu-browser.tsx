"use client";

// SPRINT-14: the menu browser (design.md §9.2, §7.3).
// Scroll-spy sets the active tab; tapping a tab scrolls to the section WITH THE STICKY OFFSET
// ACCOUNTED FOR, so the section header is never hidden under the tab bar.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FullMenu, MenuItemSummary, StoreStatus } from "@harolds/types";
import { StorefrontHeader } from "@/components/storefront/header";
import { AnnouncementStrip } from "@/components/storefront/announcement-strip";
import { StorefrontFooter } from "@/components/storefront/footer";
import { CategoryTabs } from "@/components/storefront/category-rail";
import { ItemCard, hasRequiredGroups } from "@/components/storefront/item-card";
import { ItemModal } from "@/components/storefront/item-modal";
import { CartSheet } from "@/components/storefront/cart-sheet";
import { CartBar } from "@/components/storefront/cart-bar";
import { CartAnnouncer } from "@/components/storefront/cart-announcer";
import { EmptyState, ErrorState, ItemCardSkeleton } from "@/components/ui/feedback";
import { useCart } from "@/lib/cart-context";

import {
  MD_BREAKPOINT,
  SCROLL_OFFSET_DESKTOP,
  SCROLL_OFFSET_MOBILE,
  TABS_TOP_DESKTOP,
  TABS_TOP_MOBILE,
} from "@/components/storefront/sticky-metrics";

export function MenuBrowser({ menu, status }: { menu: FullMenu | null; status: StoreStatus | null }) {
  const { addLine } = useCart();
  const [selected, setSelected] = useState<MenuItemSummary | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const categories = useMemo(
    () => (menu ? menu.categories.filter((c) => c.items.length > 0) : []),
    [menu],
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setActiveId((current) => current ?? categories[0]?.id ?? null);
  }, [categories]);

  useEffect(() => {
    if (categories.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
        );
        setActiveId(top.target.id.replace("cat-", ""));
      },
      // The top margin is the same sticky offset the scroll handler uses, so scroll-spy and
      // scroll-to agree about where a section "starts".
      { rootMargin: `-${SCROLL_OFFSET_MOBILE}px 0px -70% 0px` },
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [categories]);

  const scrollToCategory = useCallback((id: string) => {
    setActiveId(id);
    const el = sectionRefs.current[id];
    if (!el) return;
    const offset = window.innerWidth >= MD_BREAKPOINT ? SCROLL_OFFSET_DESKTOP : SCROLL_OFFSET_MOBILE;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

  const quickAdd = (item: MenuItemSummary) => {
    addLine({ item, quantity: 1, selectedOptionIds: [], optionLabels: [], customerNote: null });
  };

  if (!menu || !status) {
    return (
      <div className="min-h-dvh">
        <StorefrontHeader status={status} onCartClick={() => setCartOpen(true)} />
        {/* §12 Loading/Error share the same box so nothing shifts between them. */}
        <div className="mx-auto max-w-[1200px] px-4 py-10">
          <ErrorState
            message="We couldn't load the menu. Try again."
            onRetry={() => window.location.reload()}
          />
          <div className="sr-only">
            <ItemCardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-24 md:pb-0">
      <StorefrontHeader status={status} onCartClick={() => setCartOpen(true)} />
      <AnnouncementStrip announcement={status.announcement} />

      <main className="mx-auto max-w-[1200px] px-4">
        <CategoryTabs
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          activeId={activeId}
          onSelect={scrollToCategory}
          topMobile={TABS_TOP_MOBILE}
          topDesktop={TABS_TOP_DESKTOP}
        />

        {categories.length === 0 ? (
          <EmptyState message="The menu isn't available right now. Please check back soon." />
        ) : (
          categories.map((category) => (
            <section
              key={category.id}
              id={`cat-${category.id}`}
              ref={(el) => {
                sectionRefs.current[category.id] = el;
              }}
              className="py-10 md:py-16"
            >
              <h2 className="t-display-lg text-ink">{category.name}</h2>
              {category.description ? (
                <p className="t-body mt-1 text-ink-muted">{category.description}</p>
              ) : null}

              <div className="mt-5 grid gap-3 sm:grid-cols-2 md:gap-5 lg:grid-cols-3">
                {category.items.map((item, i) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    priority={i === 0 && category.id === categories[0]?.id}
                    onOpen={setSelected}
                    onQuickAdd={hasRequiredGroups(item) ? undefined : quickAdd}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <StorefrontFooter status={status} />

      <ItemModal item={selected} onClose={() => setSelected(null)} />
      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} />
      <CartBar onOpen={() => setCartOpen(true)} />
      <CartAnnouncer />
    </div>
  );
}
