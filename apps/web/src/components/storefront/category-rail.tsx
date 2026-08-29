"use client";

// Design v1.1 — the category rail and the sticky tab bar.
// Home variant: a scrolling row of circular initial tiles with an uppercase label, no visible
// scrollbar. Menu variant: sticky tabs on a surface band under the header, scroll-spy driven,
// with the active tab auto-scrolled into view horizontally.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MD_BREAKPOINT } from "@/components/storefront/sticky-metrics";

export type RailCategory = { id: string; name: string; slug?: string };

/** Home variant. */
export function CategoryRail({ categories }: { categories: RailCategory[] }) {
  return (
    <div className="cat-rail">
      {categories.map((cat) => (
        <Link key={cat.id} href={`/menu#cat-${cat.id}`} className="cat-tile">
          <span className="circle" aria-hidden="true">
            {cat.name.trim().charAt(0)}
          </span>
          <span className="lbl">{cat.name}</span>
        </Link>
      ))}
    </div>
  );
}

/** Menu variant — the sticky tab bar. */
export function CategoryTabs({
  categories,
  activeId,
  onSelect,
  topMobile,
  topDesktop,
}: {
  categories: RailCategory[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Pin offsets, derived once in sticky-metrics.ts so they cannot drift from the scroll offset. */
  topMobile: number;
  topDesktop: number;
}) {
  const [top, setTop] = useState(topMobile);

  useEffect(() => {
    const media = window.matchMedia(`(min-width: ${MD_BREAKPOINT}px)`);
    const apply = () => setTop(media.matches ? topDesktop : topMobile);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [topMobile, topDesktop]);

  const scroller = useRef<HTMLDivElement | null>(null);
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});

  // The active tab scrolls itself into view horizontally.
  useEffect(() => {
    if (!activeId) return;
    const el = tabs.current[activeId];
    const box = scroller.current;
    if (!el || !box) return;
    const left = el.offsetLeft - box.offsetWidth / 2 + el.offsetWidth / 2;
    box.scrollTo({ left, behavior: "smooth" });
  }, [activeId]);

  return (
    <div className="sticky-tabs" style={{ top }}>
      <div ref={scroller} className="row" role="tablist" aria-label="Menu categories">
        {categories.map((cat) => (
          <button
            key={cat.id}
            ref={(el) => {
              tabs.current[cat.id] = el;
            }}
            type="button"
            role="tab"
            className="mtab"
            aria-selected={cat.id === activeId}
            onClick={() => onSelect(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </div>
  );
}
