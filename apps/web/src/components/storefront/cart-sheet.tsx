"use client";

// Design v1.1 — the cart sheet. Head with the item count, one `.cline` per line with its
// modifiers beneath the name and the quantity stepper on the right, and a foot stating that the
// total is quoted at checkout.
//
// NO MONEY IS COMPUTED HERE. Rendering `basePriceCents * quantity` per line would ignore every
// modifier surcharge — a customer could see one figure and be charged another. The lawful source
// of a total is the server quote, and the storefront quotes at checkout; adding a quote request
// here would be a new request per cart change. So the cart lists what is in it and checkout
// states what it costs.
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/feedback";
import { useCart } from "@/lib/cart-context";

export function CartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lines, updateQuantity, removeLine, totalItems } = useCart();

  const title =
    totalItems > 0
      ? `Your order · ${totalItems} ${totalItems === 1 ? "item" : "items"}`
      : "Your order";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        lines.length === 0 ? undefined : (
          <>
            <p className="note">
              Your total is quoted at checkout — no figure here is computed on this device.
            </p>
            <Link
              href="/checkout"
              onClick={onClose}
              className="btn btn-primary"
              style={{ width: "100%", height: 52 }}
            >
              Go to checkout
            </Link>
          </>
        )
      }
    >
      {lines.length === 0 ? (
        <EmptyState message="Your cart is empty." actionLabel="Browse the menu" onAction={onClose} />
      ) : (
        lines.map((line, index) => (
          <div
            key={line.key}
            className="cline"
            style={index === lines.length - 1 ? { borderBottom: "none" } : undefined}
          >
            <div>
              <p className="nm">{line.item.name}</p>
              {/* Modifiers render beneath their line. */}
              {line.optionLabels.length > 0 ? (
                <p className="mods">{line.optionLabels.join(" · ")}</p>
              ) : null}
              {line.customerNote ? <p className="mods">Note: {line.customerNote}</p> : null}
            </div>

            <div className="right">
              <div className="qty">
                <button
                  type="button"
                  aria-label={`Decrease quantity of ${line.item.name}`}
                  onClick={() => updateQuantity(line.key, line.quantity - 1)}
                >
                  −
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
