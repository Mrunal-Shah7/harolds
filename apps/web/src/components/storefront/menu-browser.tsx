"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FullMenu, MenuItemSummary, StoreStatus } from "@harolds/types";
import { StorefrontHeader } from "@/components/storefront/header";
import { StoreStatusBanner } from "@/components/storefront/store-status-banner";
import { CategoryNav } from "@/components/storefront/category-nav";
import { ItemCard } from "@/components/storefront/item-card";
import { ItemModal } from "@/components/storefront/item-modal";
import { CartSheet } from "@/components/storefront/cart-sheet";

export function MenuBrowser({ menu, status }: { menu: FullMenu; status: StoreStatus }) {
  const categories = useMemo(() => menu.categories.filter((c) => c.items.length > 0), [menu]);
  const [activeId, setActiveId] = useState<string | null>(categories[0]?.id ?? null);
  const [selectedItem, setSelectedItem] = useState<MenuItemSummary | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
          setActiveId(top.target.id.replace("cat-", ""));
        }
      },
      { rootMargin: "-140px 0px -70% 0px" },
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [categories]);

  const scrollToCategory = (id: string) => {
    setActiveId(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <StorefrontHeader onCartClick={() => setCartOpen(true)} />
      <StoreStatusBanner status={status} />

      <main className="mx-auto max-w-3xl px-4">
        <CategoryNav
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          activeId={activeId}
          onSelect={scrollToCategory}
        />

        {categories.map((category) => (
          <section
            key={category.id}
            id={`cat-${category.id}`}
            ref={(el) => {
              sectionRefs.current[category.id] = el;
            }}
            className="scroll-mt-32 py-6"
          >
            <h2 className="mb-1 text-xl font-bold text-foreground">{category.name}</h2>
            {category.description && (
              <p className="mb-3 text-sm text-muted-foreground">{category.description}</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {category.items.map((item) => (
                <ItemCard key={item.id} item={item} onSelect={setSelectedItem} />
              ))}
            </div>
          </section>
        ))}

        {categories.length === 0 && (
          <p className="py-16 text-center text-muted-foreground">
            The menu isn&apos;t available right now. Please check back soon.
          </p>
        )}
      </main>

      <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
