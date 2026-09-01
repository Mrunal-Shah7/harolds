"use client";

// Design v1.1 — the store status pill. Sunk-paper pill, dot plus one line of state.
//
// The closure reason is ALWAYS the text the store-status response returns: the response names
// which rule applies in `closedReason` and carries the words in `closedMessage` /
// `notAcceptingMessage`. Nothing here recomputes a reason on the client, and there is no
// generic "Closed" fallback path that a configured message can lose to.
import { useState } from "react";
import type { StoreStatus } from "@harolds/types";
import { Sheet } from "@/components/ui/sheet";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function storeStatusLabel(status: StoreStatus): { label: string; open: boolean } {
  if (status.isOpen && status.acceptingOrders) {
    const phrase = (status.prepEstimatePhrase ?? "about {minutes} min").replace(
      /\{minutes\}/g,
      String(status.prepMinutes),
    );
    // The configured phrase hedges ("about 20 min"). On the pill the hedge is noise -- the
    // number is already an estimate -- so it is dropped here rather than in store config, which
    // other surfaces still read verbatim.
    const tight = phrase.replace(/^about /i, "");
    return { label: `Open · ready in ${tight}`, open: true };
  }
  if (status.isOpen && !status.acceptingOrders) {
    return { label: status.notAcceptingMessage ?? "Not taking orders right now", open: false };
  }
  return { label: status.closedMessage ?? "Not taking orders right now", open: false };
}

export function StoreStatusPill({
  status,
  compact = false,
}: {
  status: StoreStatus;
  /**
   * One word and the dot, nothing else. The menu page's header has to hold the logo, the state
   * and the cart on a single row, and the full sentence is what pushes it onto a second line.
   * The complete state is still one tap away in the sheet.
   */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { label, open: isOpen } = storeStatusLabel(status);
  const shown = compact ? (isOpen ? "Open" : "Closed") : label;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={compact ? "status-pill compact" : "status-pill"}
        aria-label={label}
      >
        <span className={isOpen ? "dot" : "dot closed"} aria-hidden="true" />
        <span className="tx">{shown}</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Hours" side="bottom">
        <p style={{ color: "var(--ink-muted)", padding: "16px 0 8px" }}>
          {status.storeName} · Pickup only
        </p>

        <h4 className="eyebrow" style={{ marginBottom: 8 }}>
          This week
        </h4>
        <div>
          {[...status.hours]
            .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
            .map((row) => (
              <div key={row.dayOfWeek} className="leader" style={{ padding: "8px 0" }}>
                <span>{DAYS[row.dayOfWeek]}</span>
                <span className="dots" />
                <span className="amt">
                  {row.isClosed || !row.openTime || !row.closeTime
                    ? "Closed"
                    : `${row.openTime} – ${row.closeTime}`}
                </span>
              </div>
            ))}
        </div>

        {status.announcement ? (
          <div style={{ marginTop: 24 }}>
            <h4 className="eyebrow" style={{ marginBottom: 8 }}>
              Announcement
            </h4>
            <p style={{ fontSize: "var(--body-lg)" }}>{status.announcement}</p>
          </div>
        ) : null}

        {!isOpen ? (
          <p style={{ marginTop: 24, color: "var(--danger)" }}>{label}</p>
        ) : null}
      </Sheet>
    </>
  );
}
