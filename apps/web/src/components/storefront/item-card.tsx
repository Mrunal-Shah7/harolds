import Image from "next/image";
import type { MenuItemSummary } from "@harolds/types";
import { formatCents } from "@/lib/money";
import { Badge } from "@/components/ui/badge";

export function ItemCard({
  item,
  onSelect,
}: {
  item: MenuItemSummary;
  onSelect: (item: MenuItemSummary) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => !item.isSoldOut && onSelect(item)}
      disabled={item.isSoldOut}
      className={`flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-shadow ${
        item.isSoldOut ? "cursor-not-allowed opacity-60" : "hover:shadow-md active:scale-[0.99]"
      }`}
    >
      {item.imageUrl && (
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
          <Image src={item.imageUrl} alt="" fill sizes="64px" className="object-cover" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-foreground">{item.name}</p>
          {item.isSoldOut && (
            <Badge variant="muted" className="shrink-0">
              Sold out
            </Badge>
          )}
        </div>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
        )}
        <p className="mt-1 font-semibold text-primary">{formatCents(item.basePriceCents)}</p>
      </div>
    </button>
  );
}
