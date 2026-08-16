"use client";

import Link from "next/link";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import { formatCents } from "@/lib/money";
import { Minus, Plus, Trash2 } from "lucide-react";

export function CartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lines, updateQuantity, removeLine } = useCart();

  return (
    <Sheet open={open} onClose={onClose} title="Your order">
      {lines.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
          <p>Your cart is empty.</p>
          <Button variant="outline" className="mt-4" onClick={onClose}>
            Browse the menu
          </Button>
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <ul className="flex-1 divide-y divide-border overflow-y-auto px-4">
            {lines.map((line) => (
              <li key={line.key} className="flex gap-3 py-4">
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{line.item.name}</p>
                  {line.optionLabels.length > 0 && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {line.optionLabels.join(", ")}
                    </p>
                  )}
                  {line.customerNote && (
                    <p className="mt-0.5 text-sm italic text-muted-foreground">
                      Note: {line.customerNote}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => updateQuantity(line.key, line.quantity - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border hover:bg-muted"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-semibold">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => updateQuantity(line.key, line.quantity + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border hover:bg-muted"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${line.item.name}`}
                      onClick={() => removeLine(line.key)}
                      className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="whitespace-nowrap font-semibold text-foreground">
                  {formatCents(line.item.basePriceCents * line.quantity)}
                </p>
              </li>
            ))}
          </ul>
          <div className="border-t border-border p-4">
            <Link href="/checkout" onClick={onClose}>
              <Button className="w-full" size="lg">
                Go to checkout
              </Button>
            </Link>
          </div>
        </div>
      )}
    </Sheet>
  );
}
