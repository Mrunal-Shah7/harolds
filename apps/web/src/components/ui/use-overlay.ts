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

type BodyLock = {
  htmlOverflow: string;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  scrollX: number;
  scrollY: number;
};

function lockPage(): BodyLock {
  const html = document.documentElement;
  const body = document.body;
  const lock: BodyLock = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${lock.scrollY}px`;
  body.style.left = `-${lock.scrollX}px`;
  body.style.right = "0";
  body.style.width = "100%";
  return lock;
}

function unlockPage(lock: BodyLock) {
  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = lock.htmlOverflow;
  body.style.overflow = lock.bodyOverflow;
  body.style.position = lock.bodyPosition;
  body.style.top = lock.bodyTop;
  body.style.left = lock.bodyLeft;
  body.style.right = lock.bodyRight;
  body.style.width = lock.bodyWidth;
  window.scrollTo(lock.scrollX, lock.scrollY);
}

export function useOverlay(open: boolean, onClose: () => void) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const returnFocusTo = React.useRef<HTMLElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;

    returnFocusTo.current = document.activeElement as HTMLElement | null;
    const lock = lockPage();

    // Focus the panel itself — never an input. Autofocusing the kitchen note (or any field)
    // opens the mobile keyboard and iOS/Chrome then scroll the page out from under the sheet.
    const focusPanel = () => {
      panelRef.current?.focus({ preventScroll: true });
    };
    const raf = requestAnimationFrame(focusPanel);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
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
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      const active = document.activeElement;
      if (active instanceof HTMLElement && panelRef.current?.contains(active)) {
        active.blur();
      }
      unlockPage(lock);
      returnFocusTo.current?.focus?.({ preventScroll: true });
    };
    // `onClose` is read from a ref so a new callback (common on swipe-close) cannot re-run
    // this effect, refocus a field, and jump the page.
  }, [open]);

  return { mounted, panelRef };
}
