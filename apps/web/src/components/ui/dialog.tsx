"use client";

// SPRINT-14: dialog (design.md §7.6, §14). A centred dialog at md and above, a bottom sheet
// below. No backdrop blur — §16 item 2. Focus is trapped and returned on close.
import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOverlay } from "@/components/ui/use-overlay";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
};

export function Dialog({ open, onClose, children, className, labelledBy }: DialogProps) {
  const { mounted, panelRef } = useOverlay(open, onClose);

  if (!mounted || !open) return null;

  return createPortal(
    // `sf-root` travels with the portal: this panel is mounted on document.body, OUTSIDE the
    // storefront layout, so without the class the base :focus-visible ring and the default
    // border colour from globals.css would not reach anything inside the modal.
    <div className="sf-root fixed inset-0 z-overlay flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-ink/60 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "relative z-overlay flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface shadow-overlay",
          "rounded-t-lg md:max-w-[560px] md:rounded-md",
          "animate-slide-in-bottom",
          className,
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-overlay flex h-11 w-11 items-center justify-center rounded-pill bg-surface/90 text-ink motion-fast transition-colors hover:bg-paper-sunk"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
