"use client";

// SPRINT-14: checkout (design.md §9.3). Single column, max 560.
//
// WHAT DID NOT CHANGE, DELIBERATELY:
//   - The field set and the required set. design.md §7.10 claims phone is the only required
//     field; this form has required first name, last name, phone and email since Sprint 5.
//     Critical rule 5 forbids changing a validation rule, so the CODE stays and design.md is
//     amended. `canSubmitForm` below is the pre-Sprint-14 expression, untouched.
//   - The default tip selection. `tip` starts undefined, which renders "No tip" selected. The
//     store config carries `defaultTipPresetIndex` and this form has never read it; honouring it
//     now would change what customers pay while appearing to change how it looks.
//
// WHAT CHANGED BY INSTRUCTION (Phase 7.4, design.md §9.3):
//   - PAYMENT_FAILED now offers a retry that is disabled for 15 seconds with a visible
//     countdown, instead of no retry at all. An instant retry against an unknown payment state is
//     how double charges happen.
//   - The "Other" tip option is surfaced. It sends `{type:"amount"}`, which the frozen 1.3.0
//     contract already carries and packages/pricing/src/parse-cart.ts already validates.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/field";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { SquarePaymentForm, requestTokenize } from "@/components/storefront/square-payment-form";
import { cn } from "@/lib/utils";

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

  // SPRINT-16: the lockout is a persisted DEADLINE, so it survives the reload that used to clear
  // it. One ticker derives the remaining seconds from that deadline on every tick and on mount.
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

  // Unchanged from before Sprint 14. Same fields, same required set, same expression.
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
      // SPRINT-16: derived, not minted. The same cart + contact + session nonce always derives
      // the same key, so a reload after an ambiguous outcome replays the existing order instead
      // of creating a second chargeable one. Any change to the cart derives a different key.
      const idempotencyKey = await deriveIdempotencyKey(getSessionNonce(), cart, customer);
      const order = await createOrder({
        cart,
        customer,
        paymentToken: token,
        idempotencyKey,
      });
      // SPRINT-16: the deadline belongs to THIS order. Without this, a customer who hit an
      // ambiguous outcome, waited, paid, then started a new cart in the same tab would land on
      // checkout with a live countdown for an order that already succeeded.
      clearLockoutDeadline();
      clear();
      router.push(`/order/${order.lookupToken}`);
    } catch (err) {
      if (err instanceof StorefrontApiError) {
        if (err.code === "PAYMENT_DECLINED") {
          // A decline is DEFINITE: the processor confirmed no money moved. Retrying with another
          // card must therefore be a fresh order, exactly as before Sprint 16 — otherwise the
          // stable key resolves to this dead order and checkout.ts replays the cached decline
          // forever, trapping the customer. The nonce rotates ONLY here, never on the ambiguous
          // PAYMENT_FAILED path.
          rotateSessionNonce();
          setSubmitError({
            message: "That card was declined. Try a different card.",
            retryable: true,
          });
        } else if (err.code === "PAYMENT_FAILED") {
          setSubmitError({
            // SPRINT-16 Phase 5: PAYMENT_FAILED is emitted ONLY on the ambiguous class
            // (transport failure / timeout), where the system cannot know whether money moved.
            // The old copy asserted "Nothing has been charged" on exactly that path.
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
      <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center px-4">
        <EmptyState
          message="Your cart is empty."
          actionLabel="Back to the menu"
          onAction={() => router.push("/menu")}
        />
      </div>
    );
  }

  const payDisabled = !canSubmitForm || submitting || quoteLoading || lockoutSeconds > 0;

  return (
    <div className="mx-auto min-h-dvh max-w-[560px] px-4 pb-16">
      <div className="py-4">
        <Link
          href="/menu"
          className="t-body inline-flex items-center gap-1 font-semibold text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" /> Menu
        </Link>
      </div>

      <h1 className="t-display-lg mb-6 text-ink">Checkout</h1>

      {availabilityReasons.length > 0 && (
        <div className="mb-4">
          <Alert tone="danger" title="Some items just became unavailable">
            <ul className="list-disc pl-5">
              {availabilityReasons.map((r, i) => (
                <li key={i}>{r.message}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
      {fixableReasons.length > 0 && (
        <div className="mb-4">
          <Alert tone="warn" title="Please fix">
            <ul className="list-disc pl-5">
              {fixableReasons.map((r, i) => (
                <li key={i}>{r.message}</li>
              ))}
            </ul>
          </Alert>
        </div>
      )}

      {/* §9.3 order summary. Every figure comes from the server quote — the line rows carry no
          money at all, because the quote reports totals and not per-line amounts, and computing
          them here is what this sprint removes. */}
      <section className="mb-6 rounded-md border border-line bg-surface">
        <ul className="divide-y divide-line">
          {lines.map((line) => (
            <li key={line.key} className="px-4 py-3">
              <p className="t-body font-semibold text-ink">
                {line.quantity} × {line.item.name}
              </p>
              {line.optionLabels.length > 0 && (
                <p className="t-body-sm mt-0.5 text-ink-muted">{line.optionLabels.join(", ")}</p>
              )}
              {line.customerNote && (
                <p className="t-body-sm mt-0.5 text-ink-muted">Note: {line.customerNote}</p>
              )}
            </li>
          ))}
        </ul>

        <div className="border-t border-line bg-paper-sunk px-4 py-3">
          {quoteLoading ? (
            // §12: the skeleton matches the loaded block's dimensions exactly.
            <div className="space-y-2">
              <Skeleton className="h-[22px] w-full" />
              <Skeleton className="h-[22px] w-full" />
              <Skeleton className="h-[22px] w-full" />
            </div>
          ) : quote ? (
            <div className="space-y-2">
              <TotalRow label="Subtotal" value={formatCents(quote.subtotalCents)} />
              <TotalRow label="Tax" value={formatCents(quote.taxCents)} />
              {quote.tip.tipCents > 0 && (
                <TotalRow label="Tip" value={formatCents(quote.tip.tipCents)} />
              )}
              <div className="flex items-baseline justify-between pt-1">
                <span className="t-display-sm text-ink">Total</span>
                <span className="t-display-sm t-nums text-ink">{formatCents(quote.totalCents)}</span>
              </div>
              {!quote.orderable && (
                <p className="t-body mt-2 text-danger">
                  {quote.blockingReasons.includes("STORE_CLOSED")
                    ? "The store is closed, so this order can't be placed right now."
                    : "The store isn't taking orders right now."}
                </p>
              )}
            </div>
          ) : null}
        </div>
      </section>

      {/* §9.3 tip selector. Presets are configuration, not code. "No tip" carries the same
          visual weight as every other option. */}
      {status?.tippingEnabled && tipPresets.length > 0 && (
        <section className="mb-6">
          <h2 className="t-label mb-2 text-ink-muted">Add a tip</h2>
          <div className="flex flex-wrap gap-2">
            {tipPresets.map((bps, i) => (
              <TipPill
                key={i}
                selected={tip?.type === "preset" && tip.presetIndex === i}
                onClick={() => {
                  setCustomTip("");
                  setTip({ type: "preset", presetIndex: i });
                }}
              >
                {(bps / 100).toFixed(0)}%
              </TipPill>
            ))}
            <TipPill
              selected={tip?.type === "amount"}
              onClick={() => setTip({ type: "amount", amountCents: toCents(customTip) })}
            >
              Other
            </TipPill>
            <TipPill
              selected={!tip}
              onClick={() => {
                setCustomTip("");
                setTip(undefined);
              }}
            >
              No tip
            </TipPill>
          </div>

          {tip?.type === "amount" && (
            <div className="mt-3">
              <Label htmlFor="custom-tip" className="mb-1">
                Tip amount
              </Label>
              <Input
                id="custom-tip"
                inputMode="decimal"
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value)}
                onBlur={() => setTip({ type: "amount", amountCents: toCents(customTip) })}
                placeholder="0.00"
                className="t-nums"
              />
            </div>
          )}
        </section>
      )}

      <section className="mb-6 space-y-4">
        <h2 className="t-label text-ink-muted">Your info</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" htmlFor="first-name">
            <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name" htmlFor="last-name">
            <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        <Field label="Mobile number" htmlFor="phone" hint="We text you when the order is ready.">
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(708) 555-1234"
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
          />
        </Field>
        <label className="t-body flex items-start gap-3 text-ink-muted">
          <input
            type="checkbox"
            checked={smsConsent}
            onChange={(e) => setSmsConsent(e.target.checked)}
            className="mt-1 h-5 w-5 accent-brand"
          />
          Text me when my order is ready. Message and data rates may apply.
        </label>
      </section>

      <section className="mb-6">
        <h2 className="t-label mb-2 text-ink-muted">Payment</h2>
        <SquarePaymentForm
          onTokenReady={handleTokenReady}
          onError={handleTokenError}
          disabled={!quote?.orderable}
          displayTotalCents={quote?.totalCents}
        />
      </section>

      {/* §14: the payment outcome announces through a polite live region. */}
      <div aria-live="polite" aria-atomic="true">
        {submitError && (
          <div className="mb-4">
            <Alert tone="danger">
              {submitError.message}
              {lockoutSeconds > 0 ? (
                <span className="t-nums block pt-1">
                  You can try again in {lockoutSeconds} second{lockoutSeconds === 1 ? "" : "s"}.
                </span>
              ) : null}
            </Alert>
          </div>
        )}
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={payDisabled}
        loading={submitting}
        loadingLabel="Paying…"
        onClick={handlePayClick}
      >
        {quote ? `Pay ${formatCents(quote.totalCents)}` : "Pay"}
      </Button>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="t-body text-ink-muted">{label}</span>
      <span className="t-body t-nums text-ink">{value}</span>
    </div>
  );
}

function TipPill({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "t-body h-11 rounded-pill border px-5 font-semibold motion-fast transition-colors",
        selected
          ? "border-brand bg-brand text-surface"
          : "border-line-strong text-ink hover:bg-paper-sunk",
      )}
    >
      {children}
    </button>
  );
}

/** "Other" sends {type:"amount", amountCents}. The server validates and bounds it. */
function toCents(input: string): number {
  const parsed = Number.parseFloat(input.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}
