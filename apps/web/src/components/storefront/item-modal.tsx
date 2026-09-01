"use client";

// Design v1.1 — the item modal. A 4:3 frame, name and description, then one `.mgroup` per
// modifier group with its rule stated under the heading, the kitchen note, and a sticky foot
// carrying the quantity stepper beside the primary add button.
//
// Most menu items still have provisional or absent modifier bindings — accepted at cutover — so
// the zero-group case is the COMMON case and is treated as a first-class layout, not a fallback.
//
// The footer price is computed in the browser and that is correct: the modal's "Add to cart ·
// $14.99" updates live from menu data. The prohibition is on the CART and CHECKOUT totals, which
// must come from the server quote. The two are different figures with different sources.
import { useEffect, useMemo, useState } from "react";
import type { MenuItemDetail, MenuItemSummary, MenuModifierGroup } from "@harolds/types";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/feedback";
import { MenuImage } from "@/components/storefront/menu-image";
import { formatCents } from "@/lib/money";
import { useCart } from "@/lib/cart-context";
import { getMenuItem } from "@/lib/storefront-api";

/** Every group states its rule under the heading. */
function groupRule(group: MenuModifierGroup): string {
  if (!group.isRequired && group.minSelect === 0) {
    return group.maxSelect === 1 ? "Optional" : `Optional · choose up to ${group.maxSelect}`;
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
  // The rule turns red only after a first attempt to submit, never on open. A form that is red
  // before it has been touched teaches people to ignore red.
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
      // The modal already knows the option deltas, so the cart gets an accurate display price
      // rather than falling back to the bare base price.
      unitPriceCents,
    });
    onClose();
  };

  return (
    <Dialog open={Boolean(item)} onClose={onClose} labelledBy="item-modal-title">
      {!item ? null : (
        <>
          <div className="img">
            <MenuImage
              name={item.name}
              derivatives={item.imageDerivatives}
              imageUrl={item.imageUrl}
              priority
            />
          </div>

          <div className="inner">
            <h3 id="item-modal-title">{item.name}</h3>
            {item.description ? <p className="desc">{item.description}</p> : null}

            {loading ? (
              <div className="mgroup">
                <div className="skel" style={{ height: 20, width: 120, marginBottom: 12 }} />
                <div className="skel" style={{ height: 44, marginBottom: 8 }} />
                <div className="skel" style={{ height: 44 }} />
              </div>
            ) : null}

            {loadError ? (
              <ErrorState message={loadError} onRetry={() => item && setDetail(null)} />
            ) : null}

            {detail && !loading
              ? groups.map((group) => {
                  const unsatisfied =
                    group.isRequired && (selected[group.id]?.length ?? 0) < group.minSelect;
                  return (
                    <fieldset className="mgroup" key={group.id}>
                      <legend>
                        <h4>{group.prompt}</h4>
                      </legend>
                      <p
                        className="rule"
                        style={
                          attempted && unsatisfied ? { color: "var(--danger)" } : undefined
                        }
                      >
                        {groupRule(group)}
                      </p>

                      {group.options.map((opt) => {
                        const checked = (selected[group.id] ?? []).includes(opt.id);
                        return (
                          <label
                            key={opt.id}
                            className={opt.isSoldOut ? "mrow disabled" : "mrow"}
                          >
                            <input
                              type={group.maxSelect === 1 ? "radio" : "checkbox"}
                              name={group.id}
                              checked={checked}
                              disabled={opt.isSoldOut}
                              onChange={() => toggleOption(group, opt.id)}
                            />
                            <span className="nm">
                              {opt.name}
                              {opt.isSoldOut ? " · Sold out" : ""}
                            </span>
                            {/* Priced modifiers show their surcharge on the right. */}
                            {opt.priceDeltaCents !== 0 ? (
                              <span className="pr">
                                {opt.priceDeltaCents > 0 ? "+" : ""}
                                {formatCents(opt.priceDeltaCents)}
                              </span>
                            ) : null}
                          </label>
                        );
                      })}
                    </fieldset>
                  );
                })
              : null}

            {detail && !loading ? (
              <div className="mgroup">
                <h4>Note for the kitchen</h4>
                <p className="rule">Optional</p>
                <textarea
                  id="item-note"
                  className="note-field"
                  aria-label="Note for the kitchen"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 200))}
                  maxLength={200}
                  placeholder="Fried hard, salt &amp; pepper…"
                />
              </div>
            ) : null}
          </div>

          {detail && !loading ? (
            <div className="modal-foot">
              <div className="qty" aria-label="Quantity">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  −
                </button>
                <span className="n">{quantity}</span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setQuantity((q) => Math.min(50, q + 1))}
                >
                  +
                </button>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={attempted && missingRequired.length > 0}
                onClick={handleAdd}
              >
                Add to cart · {formatCents(unitPriceCents * quantity)}
              </button>
            </div>
          ) : null}

          {attempted && firstMissing ? (
            <p
              style={{
                padding: "0 24px 16px",
                textAlign: "center",
                fontSize: "var(--body-sm)",
                color: "var(--danger)",
              }}
            >
              {firstMissing.prompt}: {groupRule(firstMissing).toLowerCase()}.
            </p>
          ) : null}
        </>
      )}
    </Dialog>
  );
}
