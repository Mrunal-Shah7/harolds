"use client";

// Design v1.1 — checkout. A paper band holding the two-column `.co-grid`: contact and tip cards
// on the left, the order summary card on the right with board leaders in the totals, the quote
// note, the payment chips and the pay button.
//
// WHAT DID NOT CHANGE, DELIBERATELY:
//   - The field set and the required set. This form has required first name, last name, phone
//     and email since Sprint 5; `canSubmitForm` below is that same expression, untouched.
//   - The default tip selection. `tip` starts undefined, which renders "No tip" selected. The
//     store config carries `defaultTipPresetIndex` and this form has never read it; honouring it
//     now would change what customers pay while appearing to change how it looks.
//   - PAYMENT_FAILED still offers a retry disabled for 15 seconds with a visible countdown. An
//     instant retry against an unknown payment state is how double charges happen.
//
// Every money figure on this page comes from the server quote. The item rows carry no money at
// all, because the quote reports totals and not per-line amounts.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CartValidationReason, QuoteResult, StoreStatus } from "@harolds/types";
import { useCart } from "@/lib/cart-context";
import { getQuote, getStoreStatus, createOrder, StorefrontApiError } from "@/lib/storefront-api";
import { deriveIdempotencyKey } from "@/lib/order-key";
import {
  FAILED_RETRY_LOCKOUT_SECONDS,
  clearLockoutDeadline,
  readLockoutDeadline,
  remainingLockoutSeconds,
  writeLockoutDeadline,
} from "@/lib/retry-lockout";
import { formatCents } from "@/lib/money";
import { StorefrontHeader } from "@/components/storefront/header";
import { CartSheet } from "@/components/storefront/cart-sheet";
import { hasAnyError, validateCheckout, validateCustomTip } from "@/lib/checkout-validation";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { NmiPaymentForm, requestTokenize } from "@/components/storefront/nmi-payment-form";

export default function CheckoutPage() {
  const router = useRouter();
  const { lines, tip, setTip, toCartRequest, clear, getSessionNonce, rotateSessionNonce } =
    useCart();

  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [reasons, setReasons] = useState<CartValidationReason[]>([]);
  const [quoteLoading, setQuoteLoading] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // SPRINT-18: SMS was removed entirely (Twilio dropped), so there is no consent to collect and
  // nothing to send. `smsConsent` is no longer part of the request at all — the API still
  // tolerates it from older clients, but this one has stopped claiming a preference it cannot act on.

  const [customTip, setCustomTip] = useState("");
  /** Whole-order instruction for the kitchen. Sent as CreateOrderRequest.customerNote. */
  const [orderNote, setOrderNote] = useState("");
  /** "Back to cart" reopens the cart as the sheet it is everywhere else, not a separate page. */
  const [cartOpen, setCartOpen] = useState(false);
  /**
   * A field is only marked wrong once the customer has left it, so the form does not shout at
   * someone halfway through typing their own name. Submitting touches everything at once.
   */
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  /**
   * Decoy field, positioned off-screen and hidden from assistive tech. A person never sees it and
   * a scripted submitter fills it, so a non-empty value here means the submission was not typed
   * by a human. Paired with the minimum-elapsed check below to make card testing against this
   * gateway account tedious rather than free.
   */
  const [decoy, setDecoy] = useState("");
  const mountedAt = useRef<number>(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const lockoutTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshQuote = useCallback(async () => {
    setQuoteLoading(true);
    setReasons([]);
    try {
      const [q, s] = await Promise.all([getQuote(toCartRequest()), getStoreStatus()]);
      setQuote(q);
      setStatus(s);
    } catch (err) {
      if (err instanceof StorefrontApiError && err.code === "VALIDATION_ERROR") {
        const r = (err.details?.reasons as CartValidationReason[] | undefined) ?? [];
        setReasons(r);
        setQuote(null);
      }
    } finally {
      setQuoteLoading(false);
    }
  }, [toCartRequest]);

  useEffect(() => {
    if (lines.length === 0) return;
    void refreshQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length, tip]);

  // The lockout is a persisted DEADLINE, so it survives the reload that used to clear it. One
  // ticker derives the remaining seconds from that deadline on every tick and on mount.
  useEffect(() => {
    const tick = () => {
      const remaining = remainingLockoutSeconds(readLockoutDeadline(), Date.now());
      setLockoutSeconds(remaining);
      if (remaining === 0) clearLockoutDeadline();
    };
    tick();
    lockoutTimer.current = setInterval(tick, 1000);
    return () => {
      if (lockoutTimer.current) clearInterval(lockoutTimer.current);
    };
  }, []);

  const startLockout = () => {
    writeLockoutDeadline(Date.now());
    setLockoutSeconds(FAILED_RETRY_LOCKOUT_SECONDS);
  };

  const tipPresets = status?.tipPresetsBps ?? [];

  const handleTokenReady = useCallback(
    async (token: string) => {
      await submitOrder(token);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firstName, lastName, phone, email],
  );

  const handleTokenError = useCallback((message: string) => {
    setSubmitting(false);
    setSubmitError({ message, retryable: true });
  }, []);

  // Every field is checked on every render so the Pay button and the messages agree about
  // whether the form is submittable. The server re-checks all of it; see checkout-validation.ts.
  const fieldErrors = validateCheckout({ firstName, lastName, phone, email, customTip, orderNote });
  const formValid = !hasAnyError(fieldErrors);
  const canSubmitForm = formValid && quote?.orderable;

  /** Show a field's error only once it has been left, or once submission was attempted. */
  const errorFor = (name: keyof typeof fieldErrors) =>
    touched[name] ? fieldErrors[name] : null;
  const markTouched = (name: string) => setTouched((prev) => ({ ...prev, [name]: true }));

  const submitOrder = async (token: string) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const cart = toCartRequest();
      const customer = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim(),
      };
      const note = orderNote.trim().length > 0 ? orderNote.trim() : null;
      // Derived, not minted. The same cart + contact + session nonce always derives the same
      // key, so a reload after an ambiguous outcome replays the existing order instead of
      // creating a second chargeable one. Any change to the cart derives a different key.
      const idempotencyKey = await deriveIdempotencyKey(getSessionNonce(), cart, customer);
      const order = await createOrder({
        cart,
        customer,
        paymentToken: token,
        idempotencyKey,
        customerNote: note,
      });
      // The deadline belongs to THIS order. Without this, a customer who hit an ambiguous
      // outcome, waited, paid, then started a new cart in the same tab would land on checkout
      // with a live countdown for an order that already succeeded.
      clearLockoutDeadline();
      clear();
      router.push(`/order/${order.lookupToken}`);
    } catch (err) {
      if (err instanceof StorefrontApiError) {
        if (err.code === "PAYMENT_DECLINED") {
          // A decline is DEFINITE: the processor confirmed no money moved. Retrying with another
          // card must therefore be a fresh order — otherwise the stable key resolves to this
          // dead order and checkout.ts replays the cached decline forever, trapping the
          // customer. The nonce rotates ONLY here, never on the ambiguous PAYMENT_FAILED path.
          rotateSessionNonce();
          setSubmitError({
            message: "That card was declined. Try a different card.",
            retryable: true,
          });
        } else if (err.code === "PAYMENT_FAILED") {
          setSubmitError({
            // PAYMENT_FAILED is emitted ONLY on the ambiguous class (transport failure /
            // timeout), where the system cannot know whether money moved.
            message:
              "We couldn't confirm that payment. Don't try again just yet — call the store to check before retrying.",
            retryable: true,
          });
          startLockout();
        } else if (err.code === "VALIDATION_ERROR") {
          const r = (err.details?.reasons as CartValidationReason[] | undefined) ?? [];
          setReasons(r);
          setSubmitError({ message: "Please review the issues with your order below.", retryable: true });
          void refreshQuote();
        } else if (err.code === "STORE_CLOSED" || err.code === "STORE_NOT_ACCEPTING_ORDERS") {
          setSubmitError({ message: err.message, retryable: false });
        } else {
          setSubmitError({ message: err.message, retryable: true });
        }
      } else {
        setSubmitError({ message: "Something went wrong. Please try again.", retryable: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * A real person needs a few seconds to fill this in. Anything faster is a script, and card
   * testing is the thing worth slowing down here — it costs the store a fee per attempt.
   */
  const MIN_FILL_MS = 3000;

  const handlePayClick = () => {
    // Attempting to pay marks every field touched, so an empty form explains itself rather than
    // leaving a dead button with no reason given.
    setTouched({
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      customTip: true,
      orderNote: true,
    });
    if (!canSubmitForm) return;

    // Both checks fail closed and say the same neutral thing: naming the trap teaches whoever
    // tripped it how to avoid the trap.
    if (decoy.trim().length > 0 || Date.now() - mountedAt.current < MIN_FILL_MS) {
      setSubmitError({
        message: "We couldn't process that. Please review your details and try again.",
        retryable: true,
      });
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    requestTokenize();
  };

  const fixableReasons = useMemo(() => reasons.filter((r) => !r.isAvailability), [reasons]);
  const availabilityReasons = useMemo(() => reasons.filter((r) => r.isAvailability), [reasons]);

  if (lines.length === 0) {
    return (
      <div className="sf-page">
        <StorefrontHeader status={status} showCart={false} />
        <main>
          <div className="band b-paper textured">
            <div className="container">
              <EmptyState
                message="Your cart is empty."
                actionLabel="Back to the menu"
                onAction={() => router.push("/menu")}
              />
            </div>
          </div>
        </main>
      </div>
    );
  }

  const payDisabled = !canSubmitForm || submitting || quoteLoading || lockoutSeconds > 0;

  return (
    <div className="sf-page">
      <StorefrontHeader status={status} showCart={false} />

      <main>
        <div className="band b-paper textured" style={{ paddingTop: 40 }}>
          <div className="container">
            {/* Leaving checkout should not depend on the browser's back button, which on a
                phone is often a gesture people do not know they have. Both ways back are one
                tap: the cart as the sheet it already is, or the menu. */}
            <div className="co-back">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setCartOpen(true)}
              >
                &larr; Back to cart
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => router.push("/menu")}
              >
                Keep shopping
              </button>
            </div>
            <h2 className="poster" style={{ marginBottom: 32 }}>
              Checkout
            </h2>

            {availabilityReasons.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <Alert tone="danger" title="Some items just became unavailable">
                  <ul style={{ paddingLeft: 20, listStyle: "disc" }}>
                    {availabilityReasons.map((r, i) => (
                      <li key={i}>{r.message}</li>
                    ))}
                  </ul>
                </Alert>
              </div>
            )}
            {fixableReasons.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <Alert tone="warn" title="Please fix">
                  <ul style={{ paddingLeft: 20, listStyle: "disc" }}>
                    {fixableReasons.map((r, i) => (
                      <li key={i}>{r.message}</li>
                    ))}
                  </ul>
                </Alert>
              </div>
            )}

            <div className="co-grid">
              <div>
                <div className="co-card card" style={{ marginBottom: 24 }}>
                  <h3>Who&apos;s picking up</h3>

                  <div className="field">
                    <label htmlFor="first-name">First name</label>
                    <input
                      id="first-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      onBlur={() => markTouched("firstName")}
                      aria-invalid={errorFor("firstName") ? true : undefined}
                      aria-describedby={errorFor("firstName") ? "first-name-err" : undefined}
                      autoComplete="given-name"
                    />
                    {errorFor("firstName") ? (
                      <p className="field-err" id="first-name-err" role="alert">
                        {errorFor("firstName")}
                      </p>
                    ) : null}
                  </div>

                  <div className="field">
                    <label htmlFor="last-name">Last name</label>
                    <input
                      id="last-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      onBlur={() => markTouched("lastName")}
                      aria-invalid={errorFor("lastName") ? true : undefined}
                      aria-describedby={errorFor("lastName") ? "last-name-err" : undefined}
                      autoComplete="family-name"
                    />
                    {errorFor("lastName") ? (
                      <p className="field-err" id="last-name-err" role="alert">
                        {errorFor("lastName")}
                      </p>
                    ) : null}
                  </div>

                  <div className="field">
                    <label htmlFor="phone">Mobile number</label>
                    <input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onBlur={() => markTouched("phone")}
                      aria-invalid={errorFor("phone") ? true : undefined}
                      aria-describedby={errorFor("phone") ? "phone-err" : undefined}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="(708) 555-1234"
                    />
                    <p className="help">In case we need to reach you about this order.</p>
                    {errorFor("phone") ? (
                      <p className="field-err" id="phone-err" role="alert">
                        {errorFor("phone")}
                      </p>
                    ) : null}
                  </div>

                  <div className="field">
                    <label htmlFor="email">Email</label>
                    <input
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => markTouched("email")}
                      aria-invalid={errorFor("email") ? true : undefined}
                      aria-describedby={errorFor("email") ? "email-err" : undefined}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                    />
                    <p className="help">Receipt only. No marketing, no account.</p>
                    {errorFor("email") ? (
                      <p className="field-err" id="email-err" role="alert">
                        {errorFor("email")}
                      </p>
                    ) : null}
                  </div>

                  {/*
                    Decoy. Off-screen and hidden from assistive tech, so only a script fills it;
                    see `decoy` in state. Never submitted anywhere.

                    The name and id are deliberately MEANINGLESS. This field was previously
                    `company_website` with a visible "Company website" label, and browser password
                    managers filled it with the user's organisation — every affected customer was
                    then permanently blocked from paying, because a non-empty decoy fails the
                    submit check on every attempt. Autofill matches on name/id/label/placeholder
                    tokens like "company", "organization", "website" and "url", so the trap must
                    not contain any of them. `autoComplete="off"` alone is not enough: managers
                    routinely ignore it on fields that look like a real one.

                    If this ever needs renaming again, keep it semantically empty.
                  */}
                  <div aria-hidden="true" className="decoy-field">
                    <input
                      id="hx-9f2"
                      name="hx_9f2"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                      value={decoy}
                      onChange={(e) => setDecoy(e.target.value)}
                    />
                  </div>
                </div>

                <div className="co-card card" style={{ marginBottom: 24 }}>
                  <h3>Anything the kitchen should know?</h3>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="order-note">Instructions for this order</label>
                    <textarea
                      id="order-note"
                      className="note-field"
                      rows={3}
                      maxLength={200}
                      value={orderNote}
                      onChange={(e) => setOrderNote(e.target.value)}
                      onBlur={() => markTouched("orderNote")}
                      placeholder="Allergies, how you'd like it cooked, anything else."
                      aria-describedby="order-note-help"
                    />
                    <p className="help" id="order-note-help">
                      This prints on the kitchen ticket for the whole order. For one item, use the
                      note on that item in your cart.
                    </p>
                    {errorFor("orderNote") ? (
                      <p className="field-err" role="alert">
                        {errorFor("orderNote")}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Presets are configuration, not code. "No tip" carries the same visual weight
                    as every other option. */}
                {status?.tippingEnabled && tipPresets.length > 0 ? (
                  <div className="co-card card" style={{ marginBottom: 24 }}>
                    <h3>Tip the kitchen</h3>
                    <div className="tips" role="group" aria-label="Tip amount">
                      <button
                        type="button"
                        className="tip"
                        aria-pressed={!tip}
                        onClick={() => {
                          setCustomTip("");
                          setTip(undefined);
                        }}
                      >
                        No tip
                      </button>
                      {tipPresets.map((bps, i) => (
                        <button
                          key={i}
                          type="button"
                          className="tip"
                          aria-pressed={tip?.type === "preset" && tip.presetIndex === i}
                          onClick={() => {
                            setCustomTip("");
                            setTip({ type: "preset", presetIndex: i });
                          }}
                        >
                          {(bps / 100).toFixed(0)}%
                        </button>
                      ))}
                      <button
                        type="button"
                        className="tip"
                        aria-pressed={tip?.type === "amount"}
                        onClick={() => setTip({ type: "amount", amountCents: toCents(customTip) })}
                      >
                        Other
                      </button>
                    </div>

                    {tip?.type === "amount" ? (
                      <div className="field" style={{ marginTop: 16, marginBottom: 0 }}>
                        <label htmlFor="custom-tip">Tip amount</label>
                        <input
                          id="custom-tip"
                          inputMode="decimal"
                          className="t-nums"
                          value={customTip}
                          onChange={(e) => {
                            const next = e.target.value;
                            setCustomTip(next);
                            // Commit as it is typed, not on blur: the summary re-quotes from the
                            // tip, so waiting for blur is why the total appeared to ignore it.
                            // An unparseable or out-of-range value is left uncommitted rather
                            // than sent as a wrong number.
                            if (validateCustomTip(next) === null) {
                              setTip({ type: "amount", amountCents: toCents(next) });
                            }
                          }}
                          onBlur={() => {
                            markTouched("customTip");
                            if (validateCustomTip(customTip) === null) {
                              setTip({ type: "amount", amountCents: toCents(customTip) });
                            }
                          }}
                          aria-invalid={errorFor("customTip") ? true : undefined}
                          placeholder="0.00"
                        />
                        {errorFor("customTip") ? (
                          <p className="field-err" role="alert">
                            {errorFor("customTip")}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="co-card card">
                  <h3>Payment</h3>
                  <NmiPaymentForm
                    onTokenReady={handleTokenReady}
                    onError={handleTokenError}
                    disabled={!quote?.orderable}
                  />
                </div>
              </div>

              <div className="co-card card">
                <h3>Your order</h3>

                {lines.map((line) => (
                  <div key={line.key} style={{ padding: "6px 0" }}>
                    <p>
                      {line.item.name} ×{line.quantity}
                    </p>
                    {line.optionLabels.length > 0 ? (
                      <p style={{ fontSize: "var(--body-sm)", color: "var(--ink-muted)" }}>
                        {line.optionLabels.join(" · ")}
                      </p>
                    ) : null}
                    {line.customerNote ? (
                      <p style={{ fontSize: "var(--body-sm)", color: "var(--ink-muted)" }}>
                        Note: {line.customerNote}
                      </p>
                    ) : null}
                  </div>
                ))}

                <div className="totals">
                  {quoteLoading ? (
                    <>
                      <div className="skel" style={{ height: 22, marginBottom: 10 }} />
                      <div className="skel" style={{ height: 22, marginBottom: 10 }} />
                      <div className="skel" style={{ height: 30 }} />
                    </>
                  ) : quote ? (
                    <>
                      <div className="leader">
                        <span>Subtotal</span>
                        <span className="dots" />
                        <span className="amt">{formatCents(quote.subtotalCents)}</span>
                      </div>
                      <div className="leader">
                        <span>Tax</span>
                        <span className="dots" />
                        <span className="amt">{formatCents(quote.taxCents)}</span>
                      </div>
                      {quote.tip.tipCents > 0 ? (
                        <div className="leader">
                          <span>Tip</span>
                          <span className="dots" />
                          <span className="amt">{formatCents(quote.tip.tipCents)}</span>
                        </div>
                      ) : null}
                      <div className="leader grand">
                        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}>
                          Total
                        </span>
                        <span className="dots" />
                        <span className="amt">{formatCents(quote.totalCents)}</span>
                      </div>
                    </>
                  ) : null}
                </div>

                {quote && !quote.orderable ? (
                  <p style={{ marginTop: 12, color: "var(--danger)" }}>
                    {quote.blockingReasons.includes("STORE_CLOSED")
                      ? "The store is closed, so this order can't be placed right now."
                      : "The store isn't taking orders right now."}
                  </p>
                ) : null}

                <p className="quote-note">
                  Quoted by the store just now — every figure above, tip included, comes from the
                  server.
                </p>

                {/* Card only. Collect.js supports wallets separately and this deployment has not
                    set them up, and advertising a method the form does not offer is worse than
                    not listing it. */}
                <div className="paywith">
                  <span className="paychip">Card</span>
                </div>

                {/* The payment outcome announces through a polite live region. */}
                <div aria-live="polite" aria-atomic="true">
                  {submitError ? (
                    <div style={{ marginBottom: 16 }}>
                      <Alert tone="danger">
                        {submitError.message}
                        {lockoutSeconds > 0 ? (
                          <span className="t-nums" style={{ display: "block", paddingTop: 4 }}>
                            You can try again in {lockoutSeconds} second
                            {lockoutSeconds === 1 ? "" : "s"}.
                          </span>
                        ) : null}
                      </Alert>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "100%", height: 52 }}
                  disabled={payDisabled}
                  aria-busy={submitting || undefined}
                  onClick={handlePayClick}
                >
                  {submitting
                    ? "Paying…"
                    : quote
                      ? `Pay ${formatCents(quote.totalCents)}`
                      : "Pay"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}

/** "Other" sends {type:"amount", amountCents}. The server validates and bounds it. */
function toCents(input: string): number {
  const parsed = Number.parseFloat(input.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}
