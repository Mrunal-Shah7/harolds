"use client";

// SPRINT-14: sheet (design.md §7.7, §14). Slides from the right on desktop, from the bottom on
// mobile. radius-lg per §5.5. Focus is trapped and returned on close.
import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOverlay } from "@/components/ui/use-overlay";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  /** "right" is the cart; "bottom" is the store-hours sheet on a phone. */
  side?: "right" | "bottom";
};

export function Sheet({ open, onClose, children, title, side = "right" }: SheetProps) {
  const { mounted, panelRef } = useOverlay(open, onClose);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      // `sf-root` travels with the portal — see the note in dialog.tsx.
      className={cn(
        "sf-root fixed inset-0 z-overlay flex",
        side === "right" ? "justify-end" : "items-end justify-center",
      )}
    >
      <div className="absolute inset-0 bg-ink/60 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-overlay flex flex-col bg-surface shadow-overlay",
          side === "right"
            ? "h-full w-full max-w-md animate-slide-in-right"
            : "max-h-[85dvh] w-full rounded-t-lg animate-slide-in-bottom",
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="t-display-md text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-pill text-ink motion-fast transition-colors hover:bg-paper-sunk"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
