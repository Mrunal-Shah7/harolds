"use client";

import { cn } from "@/lib/utils";

export function CategoryNav({
  categories,
  activeId,
  onSelect,
}: {
  categories: { id: string; name: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Menu categories"
      className="sticky top-[57px] z-20 -mx-4 overflow-x-auto border-b border-border bg-background px-4 py-2"
    >
      <div className="flex gap-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              activeId === cat.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground hover:bg-muted",
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </nav>
  );
}
