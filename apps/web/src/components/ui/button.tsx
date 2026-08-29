// SPRINT-14: the one button (design.md §7.1). Four variants, four heights, radius pill.
// Restyled here and never at a call site. The loading state disables, swaps the label for a
// spinner and a present-tense verb, and does not change width.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill",
    "t-body font-semibold motion-fast transition-colors",
    "disabled:pointer-events-none disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-brand text-surface hover:bg-brand-hover",
        secondary: "border-[1.5px] border-ink bg-transparent text-ink hover:bg-paper-sunk",
        ghost: "bg-transparent text-ink-muted hover:bg-paper-sunk hover:text-ink",
        danger: "border-[1.5px] border-danger bg-transparent text-danger hover:bg-brand-tint",
      },
      size: {
        sm: "h-9 px-4",
        base: "h-11 px-5",
        lg: "h-13 px-6",
        kds: "h-16 px-8",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "base",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /** Disables the button and shows the spinner. Width is unchanged. */
    loading?: boolean;
    /** Present-tense verb shown while loading — "Paying…", "Adding…". design.md §7.1. */
    loadingLabel?: string;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, loadingLabel, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {/* The resting label stays in the flow while loading so the width never moves. */}
        <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>{children}</span>
        {loading && (
          <span className="absolute inset-0 inline-flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            {loadingLabel ? <span className="truncate">{loadingLabel}</span> : null}
          </span>
        )}
      </button>
    );
  },
);
Button.displayName = "Button";
