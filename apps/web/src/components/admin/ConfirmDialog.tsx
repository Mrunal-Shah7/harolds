"use client";

// SPRINT-8: confirmation for destructive money and food actions — never silent.
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
      <div className="adm-dialog">
        <h2>{props.title}</h2>
        <p>{props.body}</p>
        <div className="adm-toolbar">
          <button type="button" className="adm-btn adm-btn-ghost" onClick={props.onCancel} disabled={props.busy}>
            Back
          </button>
          <button type="button" className="adm-btn adm-btn-danger" onClick={props.onConfirm} disabled={props.busy}>
            {props.busy ? "Working…" : (props.confirmLabel ?? "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
