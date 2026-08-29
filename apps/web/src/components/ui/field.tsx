// Design v1.1 — form primitives. The label is the uppercase label type in muted ink, the control
// is 44 high with a 1px line border and radius-md on a surface fill, and the help and error lines
// sit beneath it. The focus ring is 2px --focus at 2px offset and is never removed.
import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("eyebrow", className)} style={{ display: "block", marginBottom: 6 }} {...props} />;
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={className} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => <textarea ref={ref} className={className} {...props} />);
Textarea.displayName = "Textarea";

/** Errors say what to do, never "Invalid input". */
export function FieldError({ children, id }: { children: React.ReactNode; id?: string }) {
  if (!children) return null;
  return (
    <p id={id} className="err">
      {children}
    </p>
  );
}

/**
 * A labelled control with its help and error lines, wrapped in the design's `.field`. Keeps the
 * label/control/help/error order in one place; the control inherits `.field input` styling.
 */
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
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error ? <p className="help">{hint}</p> : null}
      <FieldError id={`${htmlFor}-error`}>{error}</FieldError>
    </div>
  );
}
