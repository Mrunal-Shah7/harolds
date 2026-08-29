// Design v1.1 — the one button. Four variants, four heights, radius pill, display face.
// Restyled in globals.css (.btn / .btn-*) and never at a call site. The loading state disables,
// swaps the label for a spinner and a present-tense verb, and does not change width.
import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
  /** The roast-band call to action: full width, poster face, uppercase. */
  poster: "btn-poster",
} as const;

const SIZES = {
  sm: "btn-sm",
  base: "",
  lg: "btn-lg",
  kds: "btn-lg",
} as const;

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Disables the button and shows the spinner. Width is unchanged. */
  loading?: boolean;
  /** Present-tense verb shown while loading — "Paying…", "Adding…". */
  loadingLabel?: string;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "base",
      loading = false,
      loadingLabel,
      children,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn("btn", VARIANTS[variant], SIZES[size], "relative", className)}
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
