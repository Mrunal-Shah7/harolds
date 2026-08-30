"use client";

// Publishes the storefront header's REAL height as `--sf-header-h` on <html>.
//
// The sticky tab bar pins directly beneath the header, and the scroll-to-section handler has to
// stop that same distance short or the section heading lands underneath the tabs. Those two
// numbers used to be hand-kept constants (header 64 mobile / 72 desktop, status pill 44). The
// design changed the header to 64 at every width and the pill to 36, the constants did not, and
// the tab bar ended up pinned ~10px low on a phone — a strip of the page scrolled through the
// gap above it.
//
// Measuring the element removes the class of bug entirely: there is one number, the browser
// computes it, and it re-measures when the header reflows (the status pill wraps to its own row
// below 768px, and its text is store-configured so its height is not knowable in advance).
import { useEffect, useState } from "react";

const VAR = "--sf-header-h";
/** Matches the header's `min-height` in globals.css — used only before the first measurement. */
export const HEADER_FALLBACK = 64;
/** The sticky tab bar's own height, for the scroll-to-section offset. */
export const TAB_BAR_HEIGHT = 52;

/**
 * Measures `.sf-header` and keeps `--sf-header-h` in sync with it.
 * Returns the height so callers can compute a scroll offset from the same number.
 */
export function useHeaderHeight(): number {
  const [height, setHeight] = useState(HEADER_FALLBACK);

  useEffect(() => {
    const header = document.querySelector(".sf-header");
    if (!header) return;

    const apply = () => {
      const next = Math.round(header.getBoundingClientRect().height);
      if (next <= 0) return;
      setHeight(next);
      document.documentElement.style.setProperty(VAR, `${next}px`);
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(VAR);
    };
  }, []);

  return height;
}
