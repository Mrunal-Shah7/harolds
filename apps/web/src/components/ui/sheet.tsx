"use client";

// Design v1.1 — the sheet. Slides in from the right (the cart); the "bottom" variant is the
// store-hours sheet on a phone. Head, scrolling body, foot. Focus is trapped and returned on
// close. The head's close control is the ghost button with a word on it, not an icon.
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useOverlay } from "@/components/ui/use-overlay";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  /** Rendered inside `.sheet-foot`, below the scrolling body. */
  footer?: React.ReactNode;
  /** "right" is the cart; "bottom" is the store-hours sheet on a phone. */
  side?: "right" | "bottom";
};

const EXIT_MS = 320;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Sheet({ open, onClose, children, title, footer, side = "right" }: SheetProps) {
  const [presented, setPresented] = React.useState(open);
  const [phase, setPhase] = React.useState<"open" | "closing">("open");
  const { mounted, panelRef } = useOverlay(presented, onClose);

  React.useEffect(() => {
    if (open) {
      setPresented(true);
      setPhase("open");
      return;
    }
    if (!presented) return;
    setPhase("closing");
    const wait = prefersReducedMotion() ? 0 : EXIT_MS;
    const t = window.setTimeout(() => setPresented(false), wait);
    return () => window.clearTimeout(t);
  }, [open, presented]);

  if (!mounted || !presented) return null;

  const closing = phase === "closing";

  return createPortal(
    // `sf-root` travels with the portal: this panel is mounted on document.body, OUTSIDE the
    // storefront layout, so without the class the storefront's own tokens — including the dark
    // scheme — would not reach anything inside it.
    <div className="sf-root">
      <div
        className={cn("overlay on", closing && "is-closing")}
        onPointerDown={(e) => {
          if (closing) return;
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          onClose();
        }}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "sheet on",
          side === "bottom" && "sheet-bottom",
          closing && "is-closing",
        )}
      >
        <div className="sheet-head">
          <h3>{title}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={closing}>
            Close
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
