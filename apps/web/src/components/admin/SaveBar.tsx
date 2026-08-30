"use client";

// The admin's one save affordance: a bar that floats up from the bottom of the viewport as soon
// as a form is dirty, and is not there at all when it is clean.
//
// WHY IT FLOATS. The admin forms are long — Store runs well past a laptop viewport — and an
// inline Save button sits at the bottom of the page, out of sight from wherever you were
// actually typing. An operator changing the prep time had to scroll to find out how to keep it.
// A bar pinned to the viewport is visible from every scroll position, and its presence is also
// the answer to "did that take?" — if the bar is up, the change is NOT saved yet.
//
// Bars PORTAL into a single host (`#adm-savebar-host`, rendered once by the admin shell) so that
// a screen with several forms — Store has store settings, hours, closures and overrides — stacks
// them in one column instead of piling them on top of each other at the same fixed offset.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const SAVEBAR_HOST_ID = "adm-savebar-host";

export function SaveBar({
  open,
  busy = false,
  label = "Save changes",
  onSave,
  onDiscard,
  children,
}: {
  /** Show it. Callers pass their own dirty check. */
  open: boolean;
  busy?: boolean;
  label?: string;
  onSave: () => void;
  /** Omitted where there is nothing to revert to. */
  onDiscard?: () => void;
  /** Overrides the default message when a screen can say something more useful. */
  children?: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(document.getElementById(SAVEBAR_HOST_ID));
  }, []);

  if (!open) return null;

  const bar = (
    // aria-live so a screen reader hears that the form went dirty; `polite` because it must not
    // interrupt the person mid-edit.
    <div className="adm-savebar-inner" role="status" aria-live="polite">
      <span className="adm-savebar-msg">{children ?? "You have unsaved changes."}</span>
      <div className="adm-savebar-actions">
        {onDiscard ? (
          <button type="button" className="adm-btn adm-btn-ghost" onClick={onDiscard} disabled={busy}>
            Discard
          </button>
        ) : null}
        <button
          type="button"
          className="adm-btn adm-btn-save"
          onClick={onSave}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {busy ? "Saving…" : label}
        </button>
      </div>
    </div>
  );

  // Before hydration finds the host, render in place rather than not at all — a save button that
  // only exists after an effect has run is a save button that can be missed.
  return host ? createPortal(bar, host) : <div className="adm-savebar">{bar}</div>;
}

/**
 * Dirty-tracking for the admin's uncontrolled forms, so every one of them can hand its Save to
 * the floating bar without being rewritten into controlled inputs.
 *
 * The forms use `defaultValue` + FormData on submit, which is the right shape for a back-office
 * form: no re-render per keystroke, and the DOM is the source of truth. So dirtiness is tracked
 * at the FORM level — any input or change event marks it dirty — and the bar's Save calls
 * `requestSubmit()`, which runs the form's own onSubmit and its native validation exactly as
 * pressing an inline button did. Discard is `reset()`, restoring the values the form loaded with.
 */
export function useFormSaveBar() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  return {
    formRef,
    dirty,
    setDirty,
    busy,
    setBusy,
    /** Spread onto the <form>. */
    formProps: {
      ref: formRef,
      onInput: () => setDirty(true),
      onChange: () => setDirty(true),
    } as const,
    save: () => formRef.current?.requestSubmit(),
    discard: () => {
      formRef.current?.reset();
      setDirty(false);
    },
  };
}

/**
 * A titled panel wrapping one form, with its Save handed to the floating bar.
 *
 * `onSubmit` receives the form element itself rather than the event, because the handler is
 * async and React pools nothing but `currentTarget` is null after the first await.
 */
export function AdminForm({
  title,
  description,
  label,
  wide = false,
  onSubmit,
  children,
}: {
  title?: string;
  description?: ReactNode;
  label: string;
  /** Use the auto-fit multi-column grid rather than the single 560px column. */
  wide?: boolean;
  onSubmit: (form: HTMLFormElement) => Promise<void> | void;
  children: ReactNode;
}) {
  const { formProps, dirty, setDirty, busy, setBusy, save, discard } = useFormSaveBar();

  return (
    <>
      <section className="adm-panel adm-formcard">
        {title ? <h3>{title}</h3> : null}
        {description ? <p className="adm-formcard-desc">{description}</p> : null}
        <form
          {...formProps}
          className={wide ? "adm-form-wide" : "adm-form"}
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            setBusy(true);
            try {
              await onSubmit(form);
              setDirty(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          {children}
        </form>
      </section>
      <SaveBar open={dirty} busy={busy} label={label} onSave={save} onDiscard={discard}>
        {`Unsaved changes${title ? ` in ${title}` : ""}.`}
      </SaveBar>
    </>
  );
}
