"use client";

// SPRINT-14: the cart (design.md §7.7). Sheet from the right on desktop, bottom sheet on mobile.
//
// NO MONEY IS COMPUTED HERE. The pre-Sprint-14 sheet rendered
// `line.item.basePriceCents * line.quantity` per line, which ignored every modifier surcharge —
// a customer could see one figure and be charged another. Phase 6.2 requires that removed. The
// lawful source of a total is the server quote, and the storefront quotes at checkout; adding a
// quote request here would be a new request per cart change, which Critical rule 5 forbids.
// So the cart lists what is in it and checkout states what it costs.
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { useCart } from "@/lib/cart-context";

export function CartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lines, updateQuantity, removeLine, totalItems } = useCart();

  return (
    <Sheet open={open} onClose={onClose} title="Your order">
      {lines.length === 0 ? (
        <EmptyState
          message="Your cart is empty."
          actionLabel="Browse the menu"
          onAction={onClose}
        />
      ) : (
        <div className="flex h-full flex-col">
          <ul className="flex-1 divide-y divide-line overflow-y-auto px-4">
            {lines.map((line) => (
              <li key={line.key} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="t-display-sm text-ink">{line.item.name}</p>
                  <button
                    type="button"
                    aria-label={`Remove ${line.item.name}`}
                    onClick={() => removeLine(line.key)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-ink-muted motion-fast transition-colors hover:bg-paper-sunk hover:text-danger"
                  >
                    <Trash2 className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                {/* §7.7: modifiers render beneath their line in body-sm. */}
                {line.optionLabels.length > 0 && (
                  <ul className="mt-1">
                    {line.optionLabels.map((label) => (
                      <li key={label} className="t-body-sm text-ink-muted">
                        {label}
                      </li>
                    ))}
                  </ul>
                )}
                {line.customerNote && (
                  <p className="t-body-sm mt-1 text-ink-muted">Note: {line.customerNote}</p>
                )}

                <div className="mt-3 flex items-center gap-2">
                  <StepperButton
                    label={`Decrease quantity of ${line.item.name}`}
                    onClick={() => updateQuantity(line.key, line.quantity - 1)}
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </StepperButton>
                  <span className="t-body t-nums w-8 text-center font-semibold text-ink">
                    {line.quantity}
                  </span>
                  <StepperButton
                    label={`Increase quantity of ${line.item.name}`}
                    onClick={() => updateQuantity(line.key, line.quantity + 1)}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </StepperButton>
                </div>
              </li>
            ))}
          </ul>

          <div className="border-t border-line bg-paper-sunk p-4">
            <p className="t-body-sm mb-3 text-ink-muted">
              {totalItems} {totalItems === 1 ? "item" : "items"}. Your total is calculated at
              checkout.
            </p>
            <Link href="/checkout" onClick={onClose} className="block">
              <Button size="lg" className="w-full">
                Go to checkout
              </Button>
            </Link>
          </div>
        </div>
      )}
    </Sheet>
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
