"use client";

// Design v1.1 — the menu. Sticky tabs on a surface band, a paper intro band, one section per
// category, and a roast band at the foot carrying the review-your-order call to action.
//
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
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { useCart } from "@/lib/cart-context";
import { TAB_BAR_HEIGHT, useHeaderHeight } from "@/components/storefront/use-header-height";

export function MenuBrowser({ menu, status }: { menu: FullMenu | null; status: StoreStatus | null }) {
  const { addLine, totalItems } = useCart();
  const [selected, setSelected] = useState<MenuItemSummary | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  // The header's real height. The tab bar pins to it (via --sf-header-h) and the scroll handler
  // stops short by it, so scroll-spy and scroll-to can never disagree about where a section
  // starts — which is exactly what two hand-kept constants let happen.
  const headerHeight = useHeaderHeight();
  const scrollOffset = headerHeight + TAB_BAR_HEIGHT;

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
      { rootMargin: `-${scrollOffset}px 0px -70% 0px` },
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [categories, scrollOffset]);

  const scrollToCategory = useCallback(
    (id: string) => {
      setActiveId(id);
      const el = sectionRefs.current[id];
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - scrollOffset;
      window.scrollTo({ top, behavior: "smooth" });
    },
    [scrollOffset],
  );

  const quickAdd = (item: MenuItemSummary) => {
    addLine({ item, quantity: 1, selectedOptionIds: [], optionLabels: [], customerNote: null });
  };

  if (!menu || !status) {
    return (
      <div className="sf-page">
        <StorefrontHeader status={status} onCartClick={() => setCartOpen(true)} />
        <main>
          <ErrorState
            message="We couldn't load the menu. Try again."
            onRetry={() => window.location.reload()}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="sf-page">
      <StorefrontHeader status={status} onCartClick={() => setCartOpen(true)} />
      <AnnouncementStrip announcement={status.announcement} />

      <main>
        <CategoryTabs
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          activeId={activeId}
          onSelect={scrollToCategory}
        />

        <div className="band b-paper textured" style={{ paddingTop: 32, paddingBottom: 24 }}>
          <div className="container">
            <h2 className="poster">Our menu</h2>
            <p style={{ color: "var(--ink-muted)", marginTop: 8 }}>
              Every dinner comes with fries under, sauce over, and white bread on top — unless you
              say otherwise.
            </p>
          </div>
        </div>

        {categories.length === 0 ? (
          <EmptyState message="The menu isn't available right now. Please check back soon." />
        ) : (
          categories.map((category, index) => (
            <section
              key={category.id}
              id={`cat-${category.id}`}
              ref={(el) => {
                sectionRefs.current[category.id] = el;
              }}
              className="menu-section"
              style={index === categories.length - 1 ? { paddingBottom: 48 } : undefined}
            >
              <div className="container">
                <h2>{category.name}</h2>
                {category.description ? <p className="sub">{category.description}</p> : null}

                <div className="grid-products">
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
              </div>
            </section>
          ))
        )}

        <section className="band b-roast" style={{ padding: "48px 0" }}>
          <div className="container" style={{ textAlign: "center" }}>
            <button type="button" className="btn btn-poster" onClick={() => setCartOpen(true)}>
              {totalItems > 0
                ? `Review your order · ${totalItems} ${totalItems === 1 ? "item" : "items"}`
                : "Review your order"}
            </button>
          </div>
        </section>
      </main>

      <StorefrontFooter status={status} />

      <ItemModal item={selected} onClose={() => setSelected(null)} />
      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} />
      <CartBar onOpen={() => setCartOpen(true)} />
      <CartAnnouncer />
    </div>
  );
}
