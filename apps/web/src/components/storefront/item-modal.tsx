"use client";

// SPRINT-14: the item modal (design.md §7.6).
//
// Most menu items still have provisional or absent modifier bindings — accepted at cutover — so
// the zero-group case is the COMMON case and is treated as a first-class layout, not a fallback.
//
// The footer price is computed in the browser and that is correct: §7.6 requires "Add to cart ·
// $14.99 … updates live" from menu data. §7.7's prohibition is on the CART and CHECKOUT totals,
// which must come from the server quote. The two are different figures with different sources.
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { MenuItemDetail, MenuItemSummary, MenuModifierGroup } from "@harolds/types";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/field";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { MenuImage } from "@/components/storefront/menu-image";
import { formatCents } from "@/lib/money";
import { useCart } from "@/lib/cart-context";
import { getMenuItem } from "@/lib/storefront-api";
import { cn } from "@/lib/utils";

/** §7.6: every group states its rule in the header. */
function groupRule(group: MenuModifierGroup): string {
  if (!group.isRequired && group.minSelect === 0) {
    return group.maxSelect === 1 ? "Optional" : `Optional · up to ${group.maxSelect}`;
  }
  return group.maxSelect === 1 ? "Choose 1" : `Choose up to ${group.maxSelect}`;
}

export function ItemModal({ item, onClose }: { item: MenuItemSummary | null; onClose: () => void }) {
  const { addLine } = useCart();
  const [detail, setDetail] = useState<MenuItemDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState("");
  // §7.6: the rule turns red only after a first attempt to submit, never on open. A form that is
  // red before it has been touched teaches people to ignore red.
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!item) return;
    setDetail(null);
    setLoadError(null);
    setQuantity(1);
    setSelected({});
    setNote("");
    setAttempted(false);
    setLoading(true);
    getMenuItem(item.id)
      .then(setDetail)
      .catch(() => setLoadError("We couldn't load this item's options. Try again."))
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

  const missingRequired = useMemo(
    () => groups.filter((g) => g.isRequired && (selected[g.id]?.length ?? 0) < g.minSelect),
    [groups, selected],
  );

  const firstMissing = missingRequired[0];

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
    if (!detail) return;
    setAttempted(true);
    if (missingRequired.length > 0) return;
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
    onClose();
  };

  return (
    <Dialog open={Boolean(item)} onClose={onClose} labelledBy="item-modal-title">
      {!item ? null : (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 pb-5 pt-4 md:px-5">
              <MenuImage
                name={item.name}
                derivatives={item.imageDerivatives}
                imageUrl={item.imageUrl}
                priority
              />
              <h2 id="item-modal-title" className="t-display-md mt-4 pr-12 text-ink">
                {item.name}
              </h2>
              {item.description ? (
                <p className="t-body mt-1 text-ink-muted">{item.description}</p>
              ) : null}
            </div>

            {loading ? (
              <div className="space-y-3 border-t border-line px-4 py-5 md:px-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : null}

            {loadError ? (
              <ErrorState message={loadError} onRetry={() => item && setDetail(null)} />
            ) : null}

            {detail && !loading ? (
              <div className="space-y-6 border-t border-line px-4 py-5 md:px-5">
                {groups.map((group) => {
                  const unsatisfied =
                    group.isRequired && (selected[group.id]?.length ?? 0) < group.minSelect;
                  return (
                    <fieldset key={group.id}>
                      <legend className="mb-2 flex w-full items-baseline justify-between gap-3">
                        <span className="t-label text-ink">{group.prompt}</span>
                        <span
                          className={cn(
                            "t-body-sm",
                            attempted && unsatisfied ? "text-danger" : "text-ink-muted",
                          )}
                        >
                          {groupRule(group)}
                        </span>
                      </legend>

                      <div className="space-y-2">
                        {group.options.map((opt) => {
                          const checked = (selected[group.id] ?? []).includes(opt.id);
                          return (
                            <label
                              key={opt.id}
                              className={cn(
                                "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-sm border px-3 py-2 motion-fast transition-colors",
                                opt.isSoldOut
                                  ? "cursor-not-allowed border-line bg-paper-sunk text-ink-faint"
                                  : checked
                                    ? "border-brand bg-brand-tint"
                                    : "border-line-strong hover:bg-paper-sunk",
                              )}
                            >
                              <span className="t-body flex items-center gap-3 text-ink">
                                <input
                                  type={group.maxSelect === 1 ? "radio" : "checkbox"}
                                  name={group.id}
                                  checked={checked}
                                  disabled={opt.isSoldOut}
                                  onChange={() => toggleOption(group, opt.id)}
                                  className="h-4 w-4 accent-brand"
                                />
                                {opt.name}
                                {opt.isSoldOut ? (
                                  <span className="t-body-sm text-ink-faint">Sold out</span>
                                ) : null}
                              </span>
                              {/* §7.6: priced modifiers show their surcharge on the right. */}
                              {opt.priceDeltaCents !== 0 ? (
                                <span className="t-body t-nums text-ink-muted">
                                  {opt.priceDeltaCents > 0 ? "+" : ""}
                                  {formatCents(opt.priceDeltaCents)}
                                </span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}

                <div>
                  <Label htmlFor="item-note" className="mb-1">
                    Special instructions
                  </Label>
                  <Textarea
                    id="item-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 200))}
                    maxLength={200}
                    rows={2}
                    placeholder="Optional, for example extra crispy"
                  />
                </div>
              </div>
            ) : null}
          </div>

          {detail && !loading ? (
            <div className="border-t border-line bg-surface px-4 py-4 md:px-5">
              <div className="mb-3 flex items-center justify-center gap-4">
                <StepperButton label="Decrease quantity" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </StepperButton>
                <span className="t-display-sm t-nums w-8 text-center text-ink">{quantity}</span>
                <StepperButton label="Increase quantity" onClick={() => setQuantity((q) => Math.min(50, q + 1))}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </StepperButton>
              </div>
              <Button
                size="lg"
                className="w-full"
                disabled={attempted && missingRequired.length > 0}
                onClick={handleAdd}
              >
                Add to cart · {formatCents(unitPriceCents * quantity)}
              </Button>
              {attempted && firstMissing ? (
                <p className="t-body-sm mt-2 text-center text-danger">
                  {firstMissing.prompt}: {groupRule(firstMissing).toLowerCase()}.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Dialog>
  );
}

function StepperButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-pill border border-line-strong text-ink motion-fast transition-colors hover:bg-paper-sunk"
    >
      {children}
    </button>
  );
}
