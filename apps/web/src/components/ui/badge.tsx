// SPRINT-14: badges (design.md §7.9). Label type, radius-sm, 4/8 padding.
// Text always carries the meaning; colour never carries it alone.
import * as React from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  soldOut: "bg-paper-sunk text-ink-muted",
  paid: "bg-brand-tint text-open",
  refunded: "bg-paper-sunk text-ink-muted",
  failed: "bg-brand-tint text-danger",
  neu: "bg-surface text-brand",
  warn: "bg-paper-sunk text-warn",
} as const;

export type BadgeVariant = keyof typeof VARIANTS;

export function Badge({
  className,
  variant = "soldOut",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn("t-label inline-flex items-center rounded-sm px-2 py-1", VARIANTS[variant], className)}
      {...props}
    />
  );
}
