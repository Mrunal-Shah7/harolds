// SPRINT-14: form primitives (design.md §7.10) — label, input, textarea, and the error line.
// Inputs are 44 high (52 in the KDS scope), 1px --color-line-strong, radius-sm, white fill.
// The focus ring is 2px --color-focus at 2px offset and is never removed.
import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("t-label block text-ink-muted", className)} {...props} />;
}

const CONTROL = [
  "w-full rounded-sm border border-line-strong bg-surface px-3 text-ink t-body",
  "placeholder:text-ink-faint",
  "disabled:bg-paper-sunk disabled:text-ink-faint",
].join(" ");

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(CONTROL, "h-11", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(CONTROL, "resize-none py-2.5", className)} {...props} />
));
Textarea.displayName = "Textarea";

/** §7.10: errors say what to do, never "Invalid input". */
export function FieldError({ children, id }: { children: React.ReactNode; id?: string }) {
  if (!children) return null;
  return (
    <p id={id} className="t-body-sm mt-1 text-danger">
      {children}
    </p>
  );
}

/** A labelled control with its error line. Keeps the label/control/error order in one place. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-1">
        {label}
      </Label>
      {children}
      {hint && !error ? <p className="t-body-sm mt-1 text-ink-muted">{hint}</p> : null}
      <FieldError id={`${htmlFor}-error`}>{error}</FieldError>
    </div>
  );
}
