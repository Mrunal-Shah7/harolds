"use client";

// Design v1.1 — the cart sheet. Slides in from the right; head with the item count, one `.cline`
// per line with its modifiers and instruction beneath the name and the quantity stepper on the
// right, then a foot carrying the running items total and the way onward.
//
// ABOUT THE MONEY. This sheet shows an items-only estimate computed on this device, and says so.
// The server remains the only authority on price and the checkout quote is what anybody is
// charged; see CartLine.unitPriceCents for why a client figure exists at all. What is shown here
// deliberately excludes tax and tip, which is why it is labelled "Items" and not "Total".
//
// Sliding the checkout rail all the way does not leave immediately: it swaps this sheet to a
// suggestions step first, so sides and drinks are offered where the order is being reviewed
// rather than on a page of their own.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { FullMenu, MenuItemSummary } from "@harolds/types";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/feedback";
import { SlideToAction } from "@/components/storefront/slide-to-action";
import { useCart } from "@/lib/cart-context";
import { formatCents } from "@/lib/money";
import { getFullMenu } from "@/lib/storefront-api";

/**
 * Categories the suggestions step draws from, in order. These are real category slugs, so a
 * category the store renames or deactivates simply stops being offered rather than breaking the
 * step. Nothing here is required: the step is skippable and adds no obligation to the order.
 */
const SUGGESTION_SLUGS = ["sides", "tasty-sides", "extras-and-dressings"] as const;
const MAX_SUGGESTIONS = 8;

/** One line's editable kitchen instruction, opened on demand rather than always present. */
function LineNote({
  lineKey,
  itemName,
  note,
  onSave,
}: {
  lineKey: string;
  itemName: string;
  note: string | null | undefined;
  onSave: (next: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? "");

  // A merge can rewrite this line's key underneath us; re-seed the draft when that happens.
  useEffect(() => {
    setDraft(note ?? "");
  }, [note, lineKey]);

  if (!editing) {
    return note ? (
      <button type="button" className="cline-note-btn" onClick={() => setEditing(true)}>
        Note: {note}
        <span className="cline-note-edit">Edit</span>
      </button>
    ) : (
      <button type="button" className="cline-note-btn add" onClick={() => setEditing(true)}>
        + Add instructions
      </button>
    );
  }

  const commit = () => {
    onSave(draft.trim().length > 0 ? draft.trim() : null);
    setEditing(false);
  };

  return (
    <div className="cline-note-edit-row">
      <label className="sr-only" htmlFor={`note-${lineKey}`}>
        Kitchen instructions for {itemName}
      </label>
      <input
        id={`note-${lineKey}`}
        className="cline-note-input"
        value={draft}
        maxLength={200}
        autoFocus
        placeholder="No pickles, extra crispy..."
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(note ?? "");
            setEditing(false);
          }
        }}
      />
      <button type="button" className="btn btn-secondary btn-sm" onClick={commit}>
        Save
      </button>
    </div>
  );
}

/** The suggestions step: a skippable prompt for sides, extras and dressings. */
function Suggestions({
  onAdd,
  alreadyIn,
}: {
  onAdd: (item: MenuItemSummary) => void;
  alreadyIn: (itemId: string) => number;
}) {
  const [items, setItems] = useState<MenuItemSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFullMenu()
      .then((menu: FullMenu) => {
        if (cancelled) return;
        const categories = menu.categories ?? [];
        const picked: MenuItemSummary[] = [];
        for (const slug of SUGGESTION_SLUGS) {
          const category = categories.find((c) => c.slug === slug);
          if (!category) continue;
          for (const item of category.items) {
            if (item.isSoldOut) continue;
            picked.push(item);
          }
        }
        setItems(picked.slice(0, MAX_SUGGESTIONS));
      })
      .catch(() => {
        // The step is an offer, not a requirement: if the menu will not load, show nothing and
        // let the customer carry on to checkout.
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) {
    return <p className="sug-loading">Loading suggestions...</p>;
  }
  if (items.length === 0) {
    return <p className="sug-loading">Nothing to suggest right now.</p>;
  }

  return (
    <div className="sug-grid">
      {items.map((item) => {
        const held = alreadyIn(item.id);
        return (
          <div key={item.id} className="sug-card">
            <div className="sug-copy">
              <p className="nm">{item.name}</p>
              <p className="pr t-nums">{formatCents(item.basePriceCents)}</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onAdd(item)}
              aria-label={`Add ${item.name}`}
            >
              {held > 0 ? `Added (${held})` : "Add +"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function CartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    lines,
    updateQuantity,
    removeLine,
    totalItems,
    subtotalCents,
    updateLineNote,
    addLine,
    quantityForItem,
  } = useCart();
  const router = useRouter();
  const [step, setStep] = useState<"cart" | "suggest">("cart");

  // Every fresh opening starts at the cart, never on the step the last visit ended on.
  useEffect(() => {
    if (open) setStep("cart");
  }, [open]);

  // An emptied cart has nothing to suggest against.
  useEffect(() => {
    if (lines.length === 0) setStep("cart");
  }, [lines.length]);

  const title = useMemo(() => {
    if (step === "suggest") return "Anything else?";
    return totalItems > 0
      ? `Your order · ${totalItems} ${totalItems === 1 ? "item" : "items"}`
      : "Your order";
  }, [step, totalItems]);

  const goCheckout = () => {
    onClose();
    router.push("/checkout");
  };

  const footer =
    lines.length === 0 ? undefined : step === "cart" ? (
      <>
        <div className="cart-total-row">
          <span>Items</span>
          <span className="dots" />
          <span className="amt t-nums">{formatCents(subtotalCents)}</span>
        </div>
        <p className="note">Tax and any tip are added at checkout, where the store quotes it.</p>
        <SlideToAction label="Slide to checkout" onComplete={() => setStep("suggest")} />
      </>
    ) : (
      <>
        <div className="cart-total-row">
          <span>Items</span>
          <span className="dots" />
          <span className="amt t-nums">{formatCents(subtotalCents)}</span>
        </div>
        <div className="sug-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setStep("cart")}>
            Back
          </button>
          <SlideToAction label="Slide to checkout" onComplete={goCheckout} />
        </div>
      </>
    );

  return (
    <Sheet open={open} onClose={onClose} title={title} footer={footer}>
      {lines.length === 0 ? (
        <EmptyState
          message="Your cart is empty."
          actionLabel="Browse the menu"
          onAction={() => {
            onClose();
            router.push("/menu");
          }}
        />
      ) : step === "suggest" ? (
        <>
          <p className="sug-lead">
            Sides, extras and dressings go well with what you have. Skip straight past if not.
          </p>
          <Suggestions
            alreadyIn={quantityForItem}
            onAdd={(item) =>
              addLine({
                item,
                quantity: 1,
                selectedOptionIds: [],
                optionLabels: [],
                customerNote: null,
                unitPriceCents: item.basePriceCents,
              })
            }
          />
        </>
      ) : (
        lines.map((line, index) => (
          <div
            key={line.key}
            className="cline"
            style={index === lines.length - 1 ? { borderBottom: "none" } : undefined}
          >
            <div className="cline-main">
              <p className="nm">{line.item.name}</p>
              {line.optionLabels.length > 0 ? (
                <p className="mods">{line.optionLabels.join(" · ")}</p>
              ) : null}
              <LineNote
                lineKey={line.key}
                itemName={line.item.name}
                note={line.customerNote}
                onSave={(next) => updateLineNote(line.key, next)}
              />
            </div>

            <div className="right">
              <span className="cline-price t-nums">
                {formatCents(line.unitPriceCents * line.quantity)}
              </span>
              <div className="qty">
                <button
                  type="button"
                  aria-label={`Decrease quantity of ${line.item.name}`}
                  onClick={() => updateQuantity(line.key, line.quantity - 1)}
                >
                  &minus;
                </button>
                <span className="n">{line.quantity}</span>
                <button
                  type="button"
                  aria-label={`Increase quantity of ${line.item.name}`}
                  onClick={() => updateQuantity(line.key, line.quantity + 1)}
                >
                  +
                </button>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label={`Remove ${line.item.name}`}
                onClick={() => removeLine(line.key)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove
              </button>
            </div>
          </div>
        ))
      )}
    </Sheet>
  );
}
