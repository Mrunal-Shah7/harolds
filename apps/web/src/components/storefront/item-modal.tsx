"use client";

import { useEffect, useMemo, useState } from "react";
import type { MenuItemDetail, MenuItemSummary, MenuModifierGroup } from "@harolds/types";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { useCart } from "@/lib/cart-context";
import { getMenuItem } from "@/lib/storefront-api";
import { Minus, Plus } from "lucide-react";

type ItemModalProps = {
  item: MenuItemSummary | null;
  onClose: () => void;
};

export function ItemModal({ item, onClose }: ItemModalProps) {
  const { addLine } = useCart();
  const [detail, setDetail] = useState<MenuItemDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState("");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!item) return;
    setDetail(null);
    setLoadError(null);
    setQuantity(1);
    setSelected({});
    setNote("");
    setAdded(false);
    setLoading(true);
    getMenuItem(item.id)
      .then((d) => setDetail(d))
      .catch(() => setLoadError("Couldn't load this item's options. Please try again."))
      .finally(() => setLoading(false));
  }, [item]);

  const groups = useMemo(() => detail?.modifierGroups ?? [], [detail]);

  const toggleOption = (group: MenuModifierGroup, optionId: string) => {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      const isSelected = current.includes(optionId);
      let next: string[];
      if (group.maxSelect === 1) {
        next = isSelected ? [] : [optionId];
      } else if (isSelected) {
        next = current.filter((id) => id !== optionId);
      } else if (current.length >= group.maxSelect) {
        return prev;
      } else {
        next = [...current, optionId];
      }
      return { ...prev, [group.id]: next };
    });
  };

  const missingRequired = useMemo(() => {
    return groups.filter((g) => g.isRequired && (selected[g.id]?.length ?? 0) < g.minSelect);
  }, [groups, selected]);

  const unitPriceCents = useMemo(() => {
    if (!detail) return 0;
    let total = detail.basePriceCents;
    for (const group of groups) {
      const chosen = selected[group.id] ?? [];
      for (const opt of group.options) {
        if (chosen.includes(opt.id)) total += opt.priceDeltaCents;
      }
    }
    return total;
  }, [detail, groups, selected]);

  const handleAdd = () => {
    if (!detail || missingRequired.length > 0) return;
    const selectedOptionIds = Object.values(selected).flat();
    const optionLabels = groups.flatMap((g) =>
      g.options.filter((o) => selectedOptionIds.includes(o.id)).map((o) => o.name),
    );
    addLine({
      item: detail,
      quantity,
      selectedOptionIds,
      optionLabels,
      customerNote: note.trim() ? note.trim() : null,
    });
    setAdded(true);
    setTimeout(onClose, 550);
  };

  return (
    <Dialog open={!!item} onClose={onClose} labelledBy="item-modal-title">
      {!item ? null : (
        <div className="flex flex-col overflow-y-auto">
          <div className="border-b border-border px-5 pb-4 pt-6">
            <h2 id="item-modal-title" className="pr-8 text-xl font-bold text-foreground">
              {item.name}
            </h2>
            {item.description && (
              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            )}
            <p className="mt-2 text-lg font-bold text-primary">{formatCents(item.basePriceCents)}</p>
          </div>

          {loading && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">Loading options…</div>
          )}

          {loadError && (
            <div className="px-5 py-8 text-center text-sm text-destructive">{loadError}</div>
          )}

          {detail && !loading && (
            <div className="flex-1 space-y-6 px-5 py-4">
              {groups.map((group) => (
                <fieldset key={group.id}>
                  <legend className="mb-2 flex w-full items-baseline justify-between text-sm font-semibold text-foreground">
                    <span>
                      {group.prompt}
                      {group.isRequired && <span className="ml-1 text-primary">*</span>}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {group.maxSelect === 1
                        ? "Choose 1"
                        : `Choose up to ${group.maxSelect}`}
                    </span>
                  </legend>
                  <div className="space-y-2">
                    {group.options.map((opt) => {
                      const checked = (selected[group.id] ?? []).includes(opt.id);
                      const disabled = opt.isSoldOut;
                      return (
                        <label
                          key={opt.id}
                          className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                            disabled
                              ? "cursor-not-allowed border-border bg-muted text-muted-foreground"
                              : checked
                                ? "border-primary bg-accent"
                                : "border-border hover:bg-muted"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type={group.maxSelect === 1 ? "radio" : "checkbox"}
                              name={group.id}
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleOption(group, opt.id)}
                              className="h-4 w-4 accent-[oklch(0.47_0.19_25)]"
                            />
                            {opt.name}
                            {disabled && <span className="text-xs">(sold out)</span>}
                          </span>
                          {opt.priceDeltaCents !== 0 && (
                            <span className="text-muted-foreground">
                              {opt.priceDeltaCents > 0 ? "+" : ""}
                              {formatCents(opt.priceDeltaCents)}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}

              <div>
                <label htmlFor="item-note" className="mb-2 block text-sm font-semibold text-foreground">
                  Special instructions
                </label>
                <textarea
                  id="item-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 200))}
                  maxLength={200}
                  rows={2}
                  placeholder="Optional, e.g. extra crispy"
                  className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
          )}

          {detail && !loading && (
            <div className="sticky bottom-0 border-t border-border bg-background px-5 py-4">
              <div className="mb-3 flex items-center justify-center gap-4">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:bg-muted"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center text-base font-semibold">{quantity}</span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setQuantity((q) => Math.min(50, q + 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <Button
                className="w-full"
                size="lg"
                disabled={missingRequired.length > 0 || added}
                onClick={handleAdd}
              >
                {added
                  ? "Added!"
                  : missingRequired[0]
                    ? `Select ${missingRequired[0].prompt}`
                    : `Add ${quantity > 1 ? `${quantity} ` : ""}to order — ${formatCents(unitPriceCents * quantity)}`}
              </Button>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
