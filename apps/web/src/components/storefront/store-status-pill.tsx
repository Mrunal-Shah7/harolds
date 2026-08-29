"use client";

// SPRINT-14: the store status pill (design.md §7.4) — the element that replaces the reference
// site's delivery/dine-in toggle with state we actually have.
//
// The closure reason is ALWAYS the text the store-status response returns. Sprint 12 established
// the precedence (switch, then override, then schedule) and the response names which one applies
// in `closedReason` and carries the words in `closedMessage` / `notAcceptingMessage`. Nothing
// here recomputes a reason on the client, and there is no generic "Closed" fallback path that a
// configured message can lose to.
import { useState } from "react";
import type { StoreStatus } from "@harolds/types";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function storeStatusLabel(status: StoreStatus): { label: string; open: boolean } {
  if (status.isOpen && status.acceptingOrders) {
    const phrase = (status.prepEstimatePhrase ?? "about {minutes} min").replace(
      /\{minutes\}/g,
      String(status.prepMinutes),
    );
    return { label: `Open · ready in ${phrase}`, open: true };
  }
  if (status.isOpen && !status.acceptingOrders) {
    return { label: status.notAcceptingMessage ?? "Not taking orders right now", open: false };
  }
  return { label: status.closedMessage ?? "Not taking orders right now", open: false };
}

export function StoreStatusPill({ status }: { status: StoreStatus }) {
  const [open, setOpen] = useState(false);
  const { label, open: isOpen } = storeStatusLabel(status);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="t-body-sm inline-flex h-11 max-w-full items-center gap-2 rounded-pill bg-paper-sunk px-4 text-ink motion-fast transition-colors hover:bg-line"
      >
        <span
          aria-hidden="true"
          className={cn("h-2.5 w-2.5 shrink-0 rounded-pill", isOpen ? "bg-open" : "bg-danger")}
        />
        <span className="truncate">{label}</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Hours" side="bottom">
        <div className="space-y-6 p-4">
          <p className="t-body text-ink-muted">
            {status.storeName} · Pickup only
          </p>

          <div>
            <h3 className="t-label mb-2 text-ink-muted">This week</h3>
            <ul className="divide-y divide-line">
              {[...status.hours]
                .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                .map((row) => (
                  <li key={row.dayOfWeek} className="flex justify-between py-2">
                    <span className="t-body text-ink">{DAYS[row.dayOfWeek]}</span>
                    <span className="t-body t-nums text-ink-muted">
                      {row.isClosed || !row.openTime || !row.closeTime
                        ? "Closed"
                        : `${row.openTime} – ${row.closeTime}`}
                    </span>
                  </li>
                ))}
            </ul>
          </div>

          {status.announcement ? (
            <div>
              <h3 className="t-label mb-2 text-ink-muted">Announcement</h3>
              <p className="t-body-lg text-ink">{status.announcement}</p>
            </div>
          ) : null}

          {!isOpen ? <p className="t-body text-danger">{label}</p> : null}
        </div>
      </Sheet>
    </>
  );
}
