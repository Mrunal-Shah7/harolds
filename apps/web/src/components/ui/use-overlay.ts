"use client";

// SPRINT-14: shared overlay behaviour for dialog and sheet (design.md §14).
// Escape closes, the body is locked, focus is trapped inside, and focus returns to the element
// that opened the overlay when it closes.
import * as React from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useOverlay(open: boolean, onClose: () => void) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const returnFocusTo = React.useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;

    returnFocusTo.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the panel so the keyboard path continues where the eye went.
    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      target.focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      returnFocusTo.current?.focus?.();
    };
  }, [open, onClose]);

  return { mounted, panelRef };
}
