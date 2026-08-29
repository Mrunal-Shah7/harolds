// Design v1.1 — badges. Label type, pill radius, 4/10 padding, an optional leading dot.
// Text always carries the meaning; colour never carries it alone.
import * as React from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  open: "badge-open",
  warn: "badge-warn",
  danger: "badge-danger",
  neutral: "badge-neutral",
  /** Order states, mapped onto the four the design draws. */
  soldOut: "badge-neutral",
  paid: "badge-open",
  refunded: "badge-neutral",
  failed: "badge-danger",
  neu: "badge-neutral",
} as const;

export type BadgeVariant = keyof typeof VARIANTS;

export function Badge({
  className,
  variant = "neutral",
  dot = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant; dot?: boolean }) {
  return (
    <span className={cn("badge", VARIANTS[variant], className)} {...props}>
      {dot ? <span className="dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
