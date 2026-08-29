"use client";

// SPRINT-14: the category rail and the sticky tab bar (design.md §7.3).
// Home variant: snap-scrolling pill tiles, chevrons on pointer devices only, no visible
// scrollbar. Menu variant: sticky tabs under the header, scroll-spy driven, with the active tab
// auto-scrolled into view horizontally.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MD_BREAKPOINT } from "@/components/storefront/sticky-metrics";

export type RailCategory = { id: string; name: string; slug?: string };

/** §7.3 home variant. */
export function CategoryRail({ categories }: { categories: RailCategory[] }) {
  const scroller = useRef<HTMLDivElement | null>(null);

  const nudge = (direction: -1 | 1) => {
    scroller.current?.scrollBy({ left: direction * 240, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={scroller}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 md:gap-5"
      >
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/menu#cat-${cat.id}`}
            className="flex w-24 shrink-0 snap-start flex-col items-center gap-2"
          >
            <span className="flex h-24 w-24 items-center justify-center rounded-pill bg-paper-sunk">
              <span className="t-display-md text-ink-faint">{cat.name.trim().charAt(0)}</span>
            </span>
            <span className="t-label text-center text-ink">{cat.name}</span>
          </Link>
        ))}
      </div>

      {/* §7.3: chevrons on pointer devices only. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden items-center justify-between [@media(pointer:fine)]:flex">
        <RailChevron direction="left" onClick={() => nudge(-1)} />
        <RailChevron direction="right" onClick={() => nudge(1)} />
      </div>
    </div>
  );
}

function RailChevron({ direction, onClick }: { direction: "left" | "right"; onClick: () => void }) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "left" ? "Scroll categories left" : "Scroll categories right"}
      className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-pill bg-surface text-ink shadow-card motion-fast transition-shadow hover:shadow-raised"
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/** §7.3 menu variant — the sticky tab bar. */
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

  // §7.3: the active tab scrolls itself into view horizontally.
  useEffect(() => {
    if (!activeId) return;
    const el = tabs.current[activeId];
    const box = scroller.current;
    if (!el || !box) return;
    const left = el.offsetLeft - box.offsetWidth / 2 + el.offsetWidth / 2;
    box.scrollTo({ left, behavior: "smooth" });
  }, [activeId]);

  return (
    <nav
      aria-label="Menu categories"
      style={{ top }}
      className="sticky z-sticky-tabs -mx-4 border-b border-line bg-paper px-4"
    >
      <div ref={scroller} className="no-scrollbar flex gap-6 overflow-x-auto">
        {categories.map((cat) => {
          const active = cat.id === activeId;
          return (
            <button
              key={cat.id}
              ref={(el) => {
                tabs.current[cat.id] = el;
              }}
              type="button"
              onClick={() => onSelect(cat.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "t-display-sm relative h-12 shrink-0 whitespace-nowrap motion-fast transition-colors",
                active ? "text-brand" : "text-ink-muted hover:text-ink",
              )}
            >
              {cat.name}
              {active ? (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-brand" />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
