// SPRINT-14: the five states of design.md §12 as primitives — skeleton, empty, error, offline,
// partial — plus the separator and the alert. Every list and panel in the storefront composes
// these rather than inventing its own copy or dimensions.
import * as React from "react";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * §12: a skeleton renders at the EXACT final dimensions. Callers pass the same height the
 * loaded content occupies, so nothing shifts on arrival.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-paper-sunk", className)}
      {...props}
    />
  );
}

/** The item card's skeleton. Mirrors ItemCard's box model exactly — see item-card.tsx. */
export function ItemCardSkeleton() {
  return (
    <div className="rounded-md border border-line bg-surface p-4 shadow-card md:p-5">
      <Skeleton className="aspect-[4/3] w-full" />
      <Skeleton className="mt-3 h-[26px] w-2/3" />
      <Skeleton className="mt-2 h-[22px] w-full" />
      <Skeleton className="mt-1 h-[22px] w-4/5" />
      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-[22px] w-16" />
        <Skeleton className="h-9 w-20 rounded-pill" />
      </div>
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line", className)} />;
}

/** §12 Empty: one line saying what would be here, and one action. Never an illustration. */
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
    <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
      <p className="t-body text-ink-muted">{message}</p>
      {actionLabel && onAction ? (
        <Button variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** §12 Error: what failed, in plain words, plus a retry that retries. No status codes. */
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
    <div role="alert" className="flex flex-col items-center gap-4 px-4 py-16 text-center">
      <p className="t-body text-danger">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** §12 Offline: a persistent bar. Last known data is retained; writes are disabled. */
export function OfflineBar() {
  return (
    <div
      role="status"
      className="t-body-sm flex items-center justify-center gap-2 bg-warn px-4 py-2 text-surface"
    >
      <WifiOff className="h-5 w-5" aria-hidden="true" />
      You are offline. The menu below is the last version we loaded, and ordering is paused.
    </div>
  );
}

/** §12 Partial: stale data is labelled stale, with its age. Never silently mixed with fresh. */
export function StaleNotice({ ageLabel }: { ageLabel: string }) {
  return (
    <p className="t-body-sm text-warn">Showing information from {ageLabel} ago.</p>
  );
}

/** shadcn `alert`, restyled once. Inline, never a toast — §16 item 8. */
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
    danger: "border-danger bg-brand-tint text-danger",
    warn: "border-warn bg-paper-sunk text-warn",
    info: "border-line-strong bg-paper-sunk text-ink",
  } as const;
  return (
    <div role="alert" className={cn("rounded-md border p-4", tones[tone])}>
      {title ? <p className="t-label mb-1">{title}</p> : null}
      <div className="t-body">{children}</div>
    </div>
  );
}
