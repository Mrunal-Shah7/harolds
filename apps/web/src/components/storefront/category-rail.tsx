"use client";

// Design v1.1 — the category rail and the sticky tab bar.
// Home variant: a scrolling row of circular initial tiles with an uppercase label, no visible
// scrollbar. Menu variant: sticky tabs on a surface band under the header, scroll-spy driven,
// with the active tab auto-scrolled into view horizontally.
import { useEffect, useRef } from "react";
import Link from "next/link";

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
}: {
  categories: RailCategory[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
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
    <div className="sticky-tabs">
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
