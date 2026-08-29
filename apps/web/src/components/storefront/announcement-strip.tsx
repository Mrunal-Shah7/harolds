"use client";

// SPRINT-14: the announcement strip (design.md §7.5). Present only when an announcement is
// active; ABSENT ENTIRELY otherwise — not a zero-height element, not a reserved row, not a
// placeholder. The pre-Sprint-14 banner reserved an empty row; that is the defect this fixes.
//
// Dismissal is per session, so an announcement that changes or reappears in a new session is
// seen again. Expiry is decided by the server: the strip renders `status.announcement` and
// nothing else, so a lapsed announcement disappears on the next response that omits it.
import { useEffect, useState } from "react";
import { X } from "lucide-react";

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

  return (
    <div className="border-y border-gold bg-gold/[0.18]">
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2">
        <p className="t-body-lg flex-1 text-center text-ink">{announcement}</p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-ink motion-fast transition-colors hover:bg-paper-sunk"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
