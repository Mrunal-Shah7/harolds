"use client";

// SPRINT-19: payment-method tabs — Card | Apple Pay | Google Pay.
//
// WAI-ARIA tabs with a roving tabindex: arrows move and select, Home and End jump, and the chosen
// method is announced. Every panel stays MOUNTED: Collect.js draws into its containers once, at
// configure(), and re-drawing to change tab would wipe a half-typed card. Inactive panels are
// hidden with `visibility` rather than `display: none` (see `.pm-panel-hidden`), because a
// `display: none` container gives Collect.js's frames and Apple's button no size to lay out at
// (docs/SPRINT-19-NOTES.md §3), and `inert` keeps them out of the tab order and the a11y tree.
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { nextTabIndex, PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/payment-methods";

export function PaymentMethodTabs({
  methods,
  active,
  onChange,
  locked,
  panels,
}: {
  /** Visible methods, Card first. One method renders no strip at all. */
  methods: readonly PaymentMethod[];
  active: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  /** A wallet sheet is open or a payment is in flight: the method cannot change. */
  locked: boolean;
  /** Every method that has a panel, visible or not; hidden ones still mount for Collect.js. */
  panels: ReadonlyArray<{ method: PaymentMethod; content: ReactNode }>;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const strip = methods.length > 1;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextTabIndex(event.key, index, methods.length);
    if (next === null) return;
    event.preventDefault();
    if (locked) return;
    onChange(methods[next]!);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="pm">
      {strip ? (
        <div className="pm-tabs" role="tablist" aria-label="Payment method">
          {methods.map((method, index) => (
            <button
              key={method}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`pm-tab-${method}`}
              className="pm-tab"
              aria-selected={active === method}
              aria-controls={`pm-panel-${method}`}
              tabIndex={active === method ? 0 : -1}
              aria-disabled={locked || undefined}
              onClick={() => !locked && onChange(method)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {PAYMENT_METHOD_LABEL[method]}
            </button>
          ))}
        </div>
      ) : null}

      {/* The selected method is announced when it changes, not only when a tab has focus. */}
      {strip ? (
        <p className="sr-only" aria-live="polite">
          Paying with {PAYMENT_METHOD_LABEL[active]}.
        </p>
      ) : null}

      <div className="pm-panels">
        {panels.map(({ method, content }) => {
          const shown = active === method && methods.includes(method);
          return (
            <div
              key={method}
              id={`pm-panel-${method}`}
              role={strip ? "tabpanel" : undefined}
              aria-labelledby={strip && methods.includes(method) ? `pm-tab-${method}` : undefined}
              className={shown ? "pm-panel" : "pm-panel pm-panel-hidden"}
              // React 19 types `inert` as a boolean.
              inert={!shown}
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One wallet's panel: the container Collect.js draws the official button into, and — while the
 * order is not yet payable — a gate over it. The gate is a real button: pressing it shows the
 * same field errors the card path shows, and the wallet's own button underneath is `inert`, so no
 * click, tap or key can reach it and no sheet can open (Critical rule 5).
 */
export function WalletPanel({
  method,
  mountId,
  blockedMessage,
  onBlockedPress,
  onActivate,
}: {
  method: Exclude<PaymentMethod, "card">;
  mountId: string;
  /** Null when the sheet may open; otherwise the sentence the gate explains itself with. */
  blockedMessage: string | null;
  onBlockedPress: () => void;
  /** Called when the customer reaches for the real wallet button (the sheet is opening). */
  onActivate: () => void;
}) {
  const label = PAYMENT_METHOD_LABEL[method];
  const blocked = blockedMessage !== null;
  return (
    <div className="wallet-panel">
      <div className="wallet-slot">
        <div
          id={mountId}
          className="wallet-mount"
          inert={blocked}
          // Apple's button is in the page, so a press is seen here; Google's is in Collect.js's
          // iframe, and the page sees the window lose focus to it instead (see the checkout page).
          onPointerDownCapture={() => !blocked && onActivate()}
          onKeyDownCapture={(event) => {
            if (!blocked && (event.key === "Enter" || event.key === " ")) onActivate();
          }}
        />
        {blocked ? (
          <button
            type="button"
            className="wallet-gate"
            aria-label={`Pay with ${label}`}
            aria-describedby={`${mountId}-gate-note`}
            onClick={onBlockedPress}
          />
        ) : null}
      </div>
      <p className="help" id={`${mountId}-gate-note`} aria-live="polite">
        {blocked
          ? blockedMessage
          : `${label} uses the billing address saved in your wallet. We don't keep it.`}
      </p>
    </div>
  );
}
