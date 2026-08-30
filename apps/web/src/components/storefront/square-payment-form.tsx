"use client";

// SPRINT-12: Square Web Payments SDK — card + wallet methods. Only the token reaches the server.
import { useEffect, useRef, useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    Square?: {
      // Square Web Payments SDK: payments() returns the Payments object synchronously.
      payments: (appId: string, locationId: string) => SquarePayments;
    };
  }
}

type SquarePayments = {
  card: () => Promise<SquareCardInstance>;
  applePay?: (request: SquarePaymentRequest) => Promise<SquareWalletInstance | null>;
  googlePay?: (request: SquarePaymentRequest) => Promise<SquareWalletInstance | null>;
  cashAppPay?: (
    request: SquarePaymentRequest,
    options?: { redirectURL?: string; referenceId?: string },
  ) => Promise<SquareWalletInstance | null>;
  paymentRequest?: (options: {
    countryCode: string;
    currencyCode: string;
    total: { amount: string; label: string };
  }) => SquarePaymentRequest;
};

type SquarePaymentRequest = object;

type SquareWalletInstance = {
  attach: (selector: string) => Promise<void>;
  tokenize?: () => Promise<{ status: string; token?: string; errors?: Array<{ message: string }> }>;
  destroy?: () => Promise<void>;
};

type SquareCardInstance = {
  attach: (selector: string) => Promise<void>;
  tokenize: () => Promise<{
    status: string;
    token?: string;
    errors?: Array<{ message: string }>;
  }>;
  destroy: () => Promise<void>;
};

/**
 * Card only, for now.
 *
 * Apple Pay / Google Pay / Cash App are hidden rather than deleted: the probe, the mount
 * containers and the wallet row below are all still here and still correct, and every one of
 * them needs domain registration and a secure origin that this deployment does not yet have.
 * Flipping this back to `true` restores them; nothing else has to change.
 */
const WALLETS_ENABLED = false;

const SDK_SRC =
  process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === "production"
    ? "https://web.squarecdn.com/v1/square.js"
    : "https://sandbox.web.squarecdn.com/v1/square.js";

function reportMissingConfig(missing: string[]): void {
  // Structured client→server log so "not configured" is never silent in ops logs.
  void fetch("/api/internal/client-error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Payments are not configured yet",
      missing,
      source: "square-payment-form",
    }),
  }).catch(() => undefined);
}

export function SquarePaymentForm({
  onTokenReady,
  onError,
  disabled,
  /** Display-only total for wallet sheets; never sent to our order API. */
  displayTotalCents,
}: {
  onTokenReady: (token: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  displayTotalCents?: number;
}) {
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [walletNotes, setWalletNotes] = useState<string[]>([]);
  // SPRINT-14 (design.md §9.3): the wallet row is hidden ENTIRELY when no wallet is available,
  // rather than rendering a dead button. The mount containers themselves are never moved or
  // resized — they are rendered once, in their final position, before Square attaches. A
  // container whose method returned no instance has nothing mounted in it and is only then
  // hidden, so no element Square owns is ever touched after mount.
  const [wallets, setWallets] = useState({ apple: false, google: false, cashApp: false });
  // Square must never attach into a `display:none` parent — a wallet button that mounts inside a
  // hidden box is the classic "renders but does not receive the tap" failure. So the row stays
  // visible (and, with empty divs, occupies no space) until probing has finished; only then is
  // an unavailable container hidden, and by that point nothing has mounted into it.
  const [probeDone, setProbeDone] = useState(false);
  const cardRef = useRef<SquareCardInstance | null>(null);
  const tokenizing = useRef(false);
  // The display total is read ONCE, when the payment request is built. It is held in a ref
  // rather than a dependency because it changes every time the customer picks a tip, and having
  // it in the effect's dependency array tore the card down and re-attached it on every change —
  // which is how the card field vanished mid-checkout. Mount the card once; never re-run on price.
  const displayTotalRef = useRef(displayTotalCents);
  displayTotalRef.current = displayTotalCents;

  const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID ?? "";
  const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID ?? "";

  useEffect(() => {
    if (!sdkLoaded || !window.Square) return;
    let cancelled = false;

    const missing: string[] = [];
    if (!appId) missing.push("NEXT_PUBLIC_SQUARE_APPLICATION_ID");
    if (!locationId) missing.push("NEXT_PUBLIC_SQUARE_LOCATION_ID");
    if (missing.length > 0) {
      reportMissingConfig(missing);
      onError("Payments are not configured yet. Please try again later.");
      return;
    }

    void (async () => {
      try {
        const payments = window.Square!.payments(appId, locationId);
        if (cancelled) return;
        const card = await payments.card();
        if (cancelled) {
          await card.destroy();
          return;
        }
        await card.attach("#square-card-container");
        cardRef.current = card;
        setReady(true);

        // Wallet methods need a secure origin + domain registration. Probe and record blocks.
        const notes: string[] = [];
        if (!WALLETS_ENABLED) {
          if (!cancelled) setProbeDone(true);
          return;
        }
        const total = displayTotalRef.current;
        const amount = total != null && total > 0 ? (total / 100).toFixed(2) : "1.00";
        try {
          if (typeof payments.paymentRequest !== "function") {
            notes.push("Wallet PaymentRequest API unavailable in this SDK build.");
          } else {
            const paymentRequest = payments.paymentRequest({
              countryCode: "US",
              currencyCode: "USD",
              total: { amount, label: "Harold's Chicken" },
            });
            const secure = typeof window !== "undefined" && window.isSecureContext;
            if (!secure) {
              notes.push(
                "Apple Pay / Google Pay blocked: origin is not a secure context (HTTPS required).",
              );
            } else {
              try {
                const apple = payments.applePay ? await payments.applePay(paymentRequest) : null;
                if (!apple) {
                  notes.push(
                    "Apple Pay blocked: Square returned no instance (domain not registered or unsupported browser).",
                  );
                } else {
                  await apple.attach("#square-apple-pay");
                  if (!cancelled) setWallets((w) => ({ ...w, apple: true }));
                }
              } catch (err) {
                notes.push(
                  `Apple Pay blocked: ${err instanceof Error ? err.message : "initialisation failed"}`,
                );
              }
              try {
                const google = payments.googlePay ? await payments.googlePay(paymentRequest) : null;
                if (!google) {
                  notes.push(
                    "Google Pay blocked: Square returned no instance (domain not registered or unsupported browser).",
                  );
                } else {
                  await google.attach("#square-google-pay");
                  if (!cancelled) setWallets((w) => ({ ...w, google: true }));
                }
              } catch (err) {
                notes.push(
                  `Google Pay blocked: ${err instanceof Error ? err.message : "initialisation failed"}`,
                );
              }
            }
            try {
              const cash = payments.cashAppPay
                ? await payments.cashAppPay(paymentRequest, {
                    redirectURL: window.location.href,
                    referenceId: "harolds-checkout",
                  })
                : null;
              if (!cash) {
                notes.push("Cash App Pay blocked: Square returned no instance for this location.");
              } else {
                await cash.attach("#square-cash-app-pay");
                if (!cancelled) setWallets((w) => ({ ...w, cashApp: true }));
              }
            } catch (err) {
              notes.push(
                `Cash App Pay blocked: ${err instanceof Error ? err.message : "initialisation failed"}`,
              );
            }
          }
        } catch (err) {
          notes.push(
            `Wallet setup failed: ${err instanceof Error ? err.message : "unknown error"}`,
          );
        }
        if (!cancelled) {
          setWalletNotes(notes);
          setProbeDone(true);
        }
      } catch {
        if (!cancelled) {
          setProbeDone(true);
          onError("Couldn't load the payment form. Please refresh and try again.");
        }
      }
    })();

    return () => {
      cancelled = true;
      void cardRef.current?.destroy();
      cardRef.current = null;
    };
    // `displayTotalCents` is deliberately NOT a dependency — see displayTotalRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkLoaded, appId, locationId]);

  useEffect(() => {
    const el = document.getElementById("square-card-container");
    if (!el) return;
    const handler = async () => {
      if (!cardRef.current || tokenizing.current) return;
      tokenizing.current = true;
      try {
        const result = await cardRef.current.tokenize();
        if (result.status === "OK" && result.token) {
          onTokenReady(result.token);
        } else {
          onError(result.errors?.[0]?.message ?? "Card details are invalid. Please check and try again.");
        }
      } catch {
        onError("Couldn't process the card. Please try again.");
      } finally {
        tokenizing.current = false;
      }
    };
    el.addEventListener("harolds:tokenize", handler);
    return () => el.removeEventListener("harolds:tokenize", handler);
  }, [onTokenReady, onError]);

  const anyWallet = wallets.apple || wallets.google || wallets.cashApp;

  return (
    <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
      <Script src={SDK_SRC} onReady={() => setSdkLoaded(true)} strategy="afterInteractive" />

      {/* §9.3: wallet buttons sit ABOVE the card form. The row's wrapper carries the spacing;
          Square's own mounted elements receive no styling from us at all. */}
      <div className={probeDone && !anyWallet ? "hidden" : "mb-4 space-y-2"}>
        {anyWallet ? <p className="eyebrow">Express checkout</p> : null}
        <div id="square-apple-pay" className={probeDone && !wallets.apple ? "hidden" : undefined} />
        <div id="square-google-pay" className={probeDone && !wallets.google ? "hidden" : undefined} />
        <div id="square-cash-app-pay" className={probeDone && !wallets.cashApp ? "hidden" : undefined} />
      </div>

      {/* Only the CONTAINER is styled. Its padding and border sit outside the element Square
          mounts into, so the card iframe's own dimensions are untouched. */}
      <div
        id="square-card-container"
        style={{
          minHeight: 56,
          border: "1px solid var(--line)",
          borderRadius: "var(--r-md)",
          background: "var(--surface)",
          padding: 12,
        }}
      />

      {!ready && <p className="help" style={{ marginTop: 8 }}>Loading the secure payment form…</p>}
      {walletNotes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {walletNotes.map((n) => (
            <li key={n} className="help">
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Triggers tokenisation on the currently-attached card form. */
export function requestTokenize() {
  document.getElementById("square-card-container")?.dispatchEvent(new CustomEvent("harolds:tokenize"));
}
