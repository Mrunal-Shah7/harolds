"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CartValidationReason, QuoteResult, StoreStatus } from "@harolds/types";
import { useCart } from "@/lib/cart-context";
import { getQuote, getStoreStatus, createOrder, StorefrontApiError } from "@/lib/storefront-api";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { SquarePaymentForm, requestTokenize } from "@/components/storefront/square-payment-form";
import { ChevronLeft } from "lucide-react";

function newIdempotencyKey(): string {
  return `hc-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { lines, tip, setTip, toCartRequest, clear } = useCart();

  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [reasons, setReasons] = useState<CartValidationReason[]>([]);
  const [quoteLoading, setQuoteLoading] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);

  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ message: string; retryable: boolean } | null>(null);

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
  }, [lines.length]);

  const tipPresets = status?.tipPresetsBps ?? [];

  const applyTipPreset = (index: number) => {
    setTip({ type: "preset", presetIndex: index });
  };

  const handleTokenReady = useCallback(
    async (token: string) => {
      await submitOrder(token);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firstName, lastName, phone, email, smsConsent, idempotencyKey],
  );

  const handleTokenError = useCallback((message: string) => {
    setSubmitting(false);
    setSubmitError({ message, retryable: true });
  }, []);

  const canSubmitForm =
    firstName.trim() && lastName.trim() && phone.trim() && email.trim() && quote?.orderable;

  const submitOrder = async (token: string) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const order = await createOrder({
        cart: toCartRequest(),
        customer: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          smsConsent,
        },
        paymentToken: token,
        idempotencyKey,
      });
      clear();
      router.push(`/order/${order.lookupToken}`);
    } catch (err) {
      if (err instanceof StorefrontApiError) {
        if (err.code === "PAYMENT_DECLINED") {
          // Requirement #2/#5: a retry after decline is a NEW attempt — new key, new token.
          setIdempotencyKey(newIdempotencyKey());
          setSubmitError({
            message: "The issuer declined this card. Try another card.",
            retryable: true,
          });
        } else if (err.code === "PAYMENT_FAILED") {
          setSubmitError({
            message:
              "We could not confirm payment. Do not tap Pay again yet — call the store or wait a moment before retrying.",
            retryable: false,
          });
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
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-semibold">Your cart is empty.</p>
        <Link href="/">
          <Button className="mt-4">Back to menu</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 pb-12">
      <div className="flex items-center gap-2 py-4">
        <Link href="/" className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Menu
        </Link>
      </div>

      <h1 className="mb-4 text-2xl font-bold">Checkout</h1>

      {availabilityReasons.length > 0 && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-semibold">Sorry — some items just became unavailable:</p>
          <ul className="mt-1 list-disc pl-5">
            {availabilityReasons.map((r, i) => (
              <li key={i}>{r.message}</li>
            ))}
          </ul>
        </div>
      )}
      {fixableReasons.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-400/40 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Please fix:</p>
          <ul className="mt-1 list-disc pl-5">
            {fixableReasons.map((r, i) => (
              <li key={i}>{r.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Order summary — always shown, even when not orderable (requirement #6). */}
      <section className="mb-6 rounded-xl border border-border">
        <ul className="divide-y divide-border">
          {lines.map((line) => (
            <li key={line.key} className="flex justify-between px-4 py-3 text-sm">
              <div>
                <span className="font-medium">
                  {line.quantity} × {line.item.name}
                </span>
                {line.optionLabels.length > 0 && (
                  <p className="text-muted-foreground">{line.optionLabels.join(", ")}</p>
                )}
              </div>
              <span className="font-medium">{formatCents(line.item.basePriceCents * line.quantity)}</span>
            </li>
          ))}
        </ul>
        {quoteLoading ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Calculating total…</p>
        ) : quote ? (
          <div className="space-y-1 border-t border-border px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCents(quote.subtotalCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatCents(quote.taxCents)}</span>
            </div>
            {quote.tip.tipCents > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tip</span>
                <span>{formatCents(quote.tip.tipCents)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 text-base font-bold">
              <span>Total</span>
              <span>{formatCents(quote.totalCents)}</span>
            </div>
            {!quote.orderable && (
              <p className="pt-2 text-sm font-semibold text-destructive">
                {quote.blockingReasons.includes("STORE_CLOSED")
                  ? "The store is currently closed — ordering is unavailable."
                  : "The store isn't accepting orders right now."}
              </p>
            )}
          </div>
        ) : null}
      </section>

      {status?.tippingEnabled && tipPresets.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">Add a tip</h2>
          <div className="flex flex-wrap gap-2">
            {tipPresets.map((bps, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applyTipPreset(i)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                  tip?.type === "preset" && tip.presetIndex === i
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                {(bps / 100).toFixed(0)}%
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTip(undefined)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                !tip ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
              }`}
            >
              No tip
            </button>
          </div>
        </section>
      )}

      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold">Your info</h2>
        <div className="grid grid-cols-2 gap-3">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            className="rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            className="rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          placeholder="Phone number"
          className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="Email"
          className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={smsConsent}
            onChange={(e) => setSmsConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          Text me when my order is ready. Message and data rates may apply.
        </label>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Payment</h2>
        <SquarePaymentForm
          onTokenReady={handleTokenReady}
          onError={handleTokenError}
          disabled={!quote?.orderable}
        />
      </section>

      {submitError && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {submitError.message}
        </div>
      )}

      <Button
        className="w-full"
        size="lg"
        disabled={!canSubmitForm || submitting || quoteLoading}
        onClick={handlePayClick}
      >
        {submitting ? "Processing…" : quote ? `Pay ${formatCents(quote.totalCents)}` : "Pay"}
      </Button>
    </div>
  );
}
