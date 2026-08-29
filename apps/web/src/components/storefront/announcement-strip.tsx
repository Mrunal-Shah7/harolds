"use client";

// SPRINT-14: the announcement strip (design.md §7.5). Present only when an announcement is
// active; ABSENT ENTIRELY otherwise — not a zero-height element, not a reserved row, not a
// placeholder. The pre-Sprint-14 banner reserved an empty row; that is the defect this fixes.
//
// Dismissal is per session, so an announcement that changes or reappears in a new session is
// seen again. Expiry is decided by the server: the strip renders `status.announcement` and
// nothing else, so a lapsed announcement disappears on the next response that omits it.
import { useEffect, useState } from "react";

const DISMISS_KEY = "harolds.announcement.dismissed.v1";

export function AnnouncementStrip({ announcement }: { announcement?: string | null }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!announcement) return;
    try {
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === announcement);
    } catch {
      // Session storage unavailable (private mode) — show the announcement.
    }
  }, [announcement]);

  if (!announcement || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, announcement);
    } catch {
      // Non-fatal: the strip still hides for this render.
    }
  };

  // Design v1.1 §announce: one centred line on the flame wash, with a worded dismiss beside it.
  return (
    <div className="announce">
      {announcement}
      <button type="button" onClick={dismiss} aria-label="Dismiss announcement">
        Dismiss
      </button>
    </div>
  );
}
