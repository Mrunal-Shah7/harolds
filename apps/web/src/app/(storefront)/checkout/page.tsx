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
import { Alert, EmptyState } from "@/components/ui/feedback";
import { SquarePaymentForm, requestTokenize } from "@/components/storefront/square-payment-form";

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
  const [smsConsent, setSmsConsent] = useState(false);

  const [customTip, setCustomTip] = useState("");
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
    [firstName, lastName, phone, email, smsConsent],
  );

  const handleTokenError = useCallback((message: string) => {
    setSubmitting(false);
    setSubmitError({ message, retryable: true });
  }, []);

  // Unchanged. Same fields, same required set, same expression.
  const canSubmitForm =
    firstName.trim() && lastName.trim() && phone.trim() && email.trim() && quote?.orderable;

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
        smsConsent,
      };
      // Derived, not minted. The same cart + contact + session nonce always derives the same
      // key, so a reload after an ambiguous outcome replays the existing order instead of
      // creating a second chargeable one. Any change to the cart derives a different key.
      const idempotencyKey = await deriveIdempotencyKey(getSessionNonce(), cart, customer);
      const order = await createOrder({
        cart,
        customer,
        paymentToken: token,
        idempotencyKey,
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
              "We couldn't confirm that payment. Don't try again just yet — check your texts in a minute, or call the store.",
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

  const handlePayClick = () => {
    if (!canSubmitForm) return;
    setSubmitError(null);
    setSubmitting(true);
    requestTokenize();
  };

  const fixableReasons = useMemo(() => reasons.filter((r) => !r.isAvailability), [reasons]);
  const availabilityReasons = useMemo(() => reasons.filter((r) => r.isAvailability), [reasons]);

  if (lines.length === 0) {
    return (
      <div className="sf-page">
        <StorefrontHeader status={status} />
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
      <StorefrontHeader status={status} />

      <main>
        <div className="band b-paper textured" style={{ paddingTop: 40 }}>
          <div className="container">
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
                      autoComplete="given-name"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="last-name">Last name</label>
                    <input
                      id="last-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="phone">Mobile number</label>
                    <input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="(708) 555-1234"
                    />
                    <p className="help">We text this number when your order is ready.</p>
                  </div>

                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="email">Email</label>
                    <input
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                    />
                    <p className="help">Receipt only. No marketing, no account.</p>
                  </div>

                  <label className="mrow" style={{ marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={smsConsent}
                      onChange={(e) => setSmsConsent(e.target.checked)}
                    />
                    <span className="nm">
                      Text me when my order is ready. Message and data rates may apply.
                    </span>
                  </label>
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
                          onChange={(e) => setCustomTip(e.target.value)}
                          onBlur={() => setTip({ type: "amount", amountCents: toCents(customTip) })}
                          placeholder="0.00"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="co-card card">
                  <h3>Payment</h3>
                  <SquarePaymentForm
                    onTokenReady={handleTokenReady}
                    onError={handleTokenError}
                    disabled={!quote?.orderable}
                    displayTotalCents={quote?.totalCents}
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

                <div className="paywith">
                  <span className="paychip">Card</span>
                  <span className="paychip">Apple&nbsp;Pay</span>
                  <span className="paychip">Google&nbsp;Pay</span>
                  <span className="paychip">Cash&nbsp;App</span>
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
    </div>
  );
}

/** "Other" sends {type:"amount", amountCents}. The server validates and bounds it. */
function toCents(input: string): number {
  const parsed = Number.parseFloat(input.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}
