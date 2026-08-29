"use client";

// Design v1.1 — the dialog. A bottom sheet below 768px, a centred 560px modal above it.
// No backdrop blur. Focus is trapped and returned on close.
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useOverlay } from "@/components/ui/use-overlay";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
  label?: string;
};

export function Dialog({ open, onClose, children, className, labelledBy, label }: DialogProps) {
  const { mounted, panelRef } = useOverlay(open, onClose);

  if (!mounted || !open) return null;

  return createPortal(
    // `sf-root` travels with the portal: this panel is mounted on document.body, OUTSIDE the
    // storefront layout, so without the class the storefront's own tokens — including the dark
    // scheme — would not reach anything inside the modal.
    <div className="sf-root">
      <div
        className="overlay on"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-label={labelledBy ? undefined : label}
          className={cn("modal", className)}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
