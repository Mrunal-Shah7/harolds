"use client";

// Design v1.1 — the confirmation for destructive money and food actions. Never silent.
// The design draws this as the refund dialog: a 440px modal, the question in display 800, the
// consequence in muted body with the money and the order in ink, and a right-aligned pair of
// buttons with the destructive one outlined in danger.
export function ConfirmDialog(props: {
  title: string;
  body: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="adm-overlay" role="dialog" aria-modal="true">
      <div className="adm-dialog confirm-dialog">
        <h3>{props.title}</h3>
        <p>{props.body}</p>
        <div className="row">
          <button
            type="button"
            className="adm-btn adm-btn-ghost"
            onClick={props.onCancel}
            disabled={props.busy}
          >
            Back
          </button>
          <button
            type="button"
            className="adm-btn adm-btn-danger"
            onClick={props.onConfirm}
            disabled={props.busy}
          >
            {props.busy ? "Working…" : (props.confirmLabel ?? "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
