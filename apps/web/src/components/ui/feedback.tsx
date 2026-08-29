// The five loading/empty/error/offline/partial states as primitives, plus the separator and the
// inline alert. Every list and panel in the storefront composes these rather than inventing its
// own copy or dimensions. Drawn entirely out of design v1.1's own parts.
import * as React from "react";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A skeleton renders at the EXACT final dimensions. Callers pass the same height the loaded
 * content occupies, so nothing shifts on arrival.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("skel", className)} {...props} />;
}

/** The product card's skeleton. Mirrors the `.pcard` box model exactly — see item-card.tsx. */
export function ItemCardSkeleton() {
  return (
    <div className="pcard card" aria-hidden="true">
      <div className="img">
        <span className="skel" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
      </div>
      <div className="body">
        <div className="skel" style={{ height: 26, width: "66%" }} />
        <div className="skel" style={{ height: 22 }} />
        <div className="skel" style={{ height: 22, width: "80%" }} />
        <div className="foot">
          <span className="skel" style={{ height: 22, width: 64 }} />
          <span className="skel" style={{ height: 36, width: 80, borderRadius: 999 }} />
        </div>
      </div>
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line", className)} />;
}

/** Empty: one line saying what would be here, and one action. Never an illustration. */
export function EmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: "64px 16px",
        textAlign: "center",
      }}
    >
      <p style={{ color: "var(--ink-muted)" }}>{message}</p>
      {actionLabel && onAction ? (
        <button type="button" className="btn btn-secondary" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Error: what failed, in plain words, plus a retry that retries. No status codes. */
export function ErrorState({
  message,
  onRetry,
  retryLabel = "Try again",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: "64px 16px",
        textAlign: "center",
      }}
    >
      <p style={{ color: "var(--danger)" }}>{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Offline: a persistent bar. Last known data is retained; writes are disabled. */
export function OfflineBar() {
  return (
    <div role="status" className="announce">
      <WifiOff
        className="h-5 w-5"
        aria-hidden="true"
        style={{ display: "inline-block", verticalAlign: "-4px", marginRight: 8 }}
      />
      You are offline. The menu below is the last version we loaded, and ordering is paused.
    </div>
  );
}

/** Partial: stale data is labelled stale, with its age. Never silently mixed with fresh. */
export function StaleNotice({ ageLabel }: { ageLabel: string }) {
  return (
    <p style={{ fontSize: "var(--body-sm)", color: "var(--warn)" }}>
      Showing information from {ageLabel} ago.
    </p>
  );
}

/** The inline alert. Inline, never a toast. */
export function Alert({
  tone = "danger",
  title,
  children,
}: {
  tone?: "danger" | "warn" | "info";
  title?: string;
  children: React.ReactNode;
}) {
  const tones = {
    danger: { borderColor: "var(--danger)", background: "var(--brand-tint)", color: "var(--danger)" },
    warn: {
      borderColor: "var(--warn)",
      background: "rgb(156 84 8 / 0.12)",
      color: "var(--warn)",
    },
    info: {
      borderColor: "var(--line-strong)",
      background: "var(--paper-sunk)",
      color: "var(--ink)",
    },
  } as const;
  return (
    <div
      role="alert"
      style={{
        border: "1px solid",
        borderRadius: "var(--r-md)",
        padding: 16,
        ...tones[tone],
      }}
    >
      {title ? (
        <p className="eyebrow" style={{ color: "inherit", marginBottom: 4 }}>
          {title}
        </p>
      ) : null}
      <div>{children}</div>
    </div>
  );
}
