"use client";

// SPRINT-12 / SPRINT-17 / SPRINT-18.2 / SPRINT-19: NMI Collect.js — card fields as gateway-hosted
// iframes, and (SPRINT-19) the Apple Pay and Google Pay buttons Collect.js renders.
// Only the single-use payment token ever reaches our server; the PAN never touches this origin.
// A wallet produces the same kind of token through the same callback, and it is charged by the
// same sale request.
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useNmiCheckoutConfig } from "@/components/storefront/nmi-checkout-config";
import {
  collectJsWalletOptions,
  GOOGLE_PAY_READY_REQUEST,
  paymentMethodFromTokenType,
  WALLET_MOUNT_ID,
  type PaymentMethod,
  type WalletAvailability,
} from "@/lib/payment-methods";

declare global {
  interface Window {
    CollectJS?: CollectJS;
    /** SPRINT-19: Apple's Pay JS (injected by Collect.js) — used only to ask canMakePayments. */
    ApplePaySession?: { canMakePayments: () => boolean };
    /** SPRINT-19: Google's Pay API — loaded only while Google Pay is flagged on, for isReadyToPay. */
    google?: {
      payments?: {
        api?: {
          PaymentsClient: new (options: { environment: "TEST" | "PRODUCTION" }) => {
            isReadyToPay: (request: unknown) => Promise<{ result?: boolean }>;
          };
        };
      };
    };
  }
}

type CollectJSFieldConfig = {
  selector: string;
  title?: string;
  placeholder?: string;
};

/**
 * SPRINT-19: `tokenType` says which method produced the token. `wallet` (the sheet's billing and
 * contact details) is declared only so it is visibly NEVER read: nothing in this file touches it,
 * so it cannot reach state, the order request, or a client-error report.
 */
type CollectJSResponse = {
  token?: string;
  tokenType?: string;
  card?: { number?: string | null; exp?: string | null; type?: string | null };
  wallet?: unknown;
};

type CollectJSValidationField = "ccnumber" | "ccexp" | "cvv" | string;

type CollectJSOptions = {
  variant: "inline";
  styleSniffer?: boolean;
  googleFont?: string;
  customCss?: Record<string, string>;
  invalidCss?: Record<string, string>;
  validCss?: Record<string, string>;
  focusCss?: Record<string, string>;
  placeholderCss?: Record<string, string>;
  /** Required by Collect.js even when wallets are unused — omit them and it logs
   *  "Could not create PaymentRequestAbstraction". */
  currency: string;
  country: string;
  price: string;
  fields: Record<string, CollectJSFieldConfig | Record<string, unknown>>;
  callback: (response: CollectJSResponse) => void;
  validationCallback?: (field: CollectJSValidationField, valid: boolean, message: string) => void;
  fieldsAvailableCallback?: () => void;
  timeoutDuration?: number;
  timeoutCallback?: () => void;
};

type CollectJS = {
  configure: (options: CollectJSOptions) => void;
  startPaymentRequest: () => void;
};

/** SPRINT-19: what the checkout needs to know about a token besides the token. */
export type TokenMeta = {
  method: PaymentMethod;
  /** Brand as Collect.js reported it ("visa"); diagnostic only. */
  cardBrand: string | null;
  /** For a wallet: the price Collect.js was configured with — what the sheet showed. */
  displayedAmount: string | null;
};

/** SPRINT-19: what the checkout needs to know about the wallets. */
export type WalletState = {
  availability: WalletAvailability;
  /** The price Collect.js is configured with right now; null until configured with a real one. */
  configuredPrice: string | null;
};

function reportMissingConfig(missing: string[]): void {
  // Structured client→server log so "not configured" is never silent in ops logs.
  void fetch("/api/internal/client-error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Payments are not configured yet",
      missing,
      source: "nmi-payment-form",
    }),
  }).catch(() => undefined);
}

/** Field styling is passed to Collect.js, which applies it INSIDE its own iframes. */
const FIELD_CSS: Record<string, string> = {
  "font-family":
    "var(--font-body, system-ui), -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  "font-size": "16px",
  color: "#1a1a1a",
  "line-height": "1.4",
  padding: "10px 12px",
  border: "1px solid #d4d4d4",
  "border-radius": "8px",
  background: "#ffffff",
  width: "100%",
  "box-sizing": "border-box",
};

/** Rendered children appear in a wallet mount only once Collect.js has drawn a button there. */
function mountHasButton(id: string): boolean {
  return (document.getElementById(id)?.children.length ?? 0) > 0;
}

export function NmiPaymentForm({
  onTokenReady,
  onError,
  disabled,
  walletPrice = null,
  activeMethod = "card",
  onWalletState,
}: {
  onTokenReady: (token: string, meta: TokenMeta) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  /** SPRINT-19: the server's `totalGatewayAmount` for the current quote, untouched. */
  walletPrice?: string | null;
  /** SPRINT-19: the selected tab. Collect.js is only re-drawn for a new price while a wallet is selected. */
  activeMethod?: PaymentMethod;
  onWalletState?: (state: WalletState) => void;
}) {
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /**
   * Collect.js takes ONE callback at configure() time and holds it for the life of the page, so
   * the handlers are kept in refs and the configure call is run exactly once. Re-configuring on
   * every render tore the iframes down mid-checkout — the same failure the Square form hit when
   * the tip total was in its dependency array.
   *
   * SPRINT-19: with a wallet flagged on, configure() is ALSO how a new price reaches the wallet
   * sheet — Collect.js has no price-update call (NMI's documented functions are configure,
   * startPaymentRequest and clearInputs), and configure "will draw or re-draw all iframes". So it
   * re-runs, debounced, when the server price changes — but only while a wallet tab is selected,
   * so a customer typing a card number is never wiped by a tip change.
   */
  const onTokenReadyRef = useRef(onTokenReady);
  onTokenReadyRef.current = onTokenReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onWalletStateRef = useRef(onWalletState);
  onWalletStateRef.current = onWalletState;
  const tokenizing = useRef(false);
  const configured = useRef(false);
  /** SPRINT-19: the price the wallet sheet would show right now. */
  const configuredPrice = useRef<string | null>(null);
  const [configuredPriceState, setConfiguredPriceState] = useState<string | null>(null);
  const [availability, setAvailability] = useState<WalletAvailability>({ applePay: null, googlePay: null });

  // Collect.js is served from the gateway itself, and the sandbox and production accounts are on
  // different gateways. Both values come from the server for the active environment
  // (checkout/layout.tsx), so the script and the key always belong to the same gateway.
  const { collectJsUrl, tokenizationKey, wallets } = useNmiCheckoutConfig();
  const hasConfig = collectJsUrl.length > 0 && tokenizationKey.length > 0;
  const walletsOn = wallets.applePay || wallets.googlePay;

  useEffect(() => {
    if (hasConfig) return;
    reportMissingConfig([
      ...(collectJsUrl ? [] : ["Collect.js URL"]),
      ...(tokenizationKey ? [] : ["NMI_TOKENIZATION_KEY for the active NMI_ENVIRONMENT"]),
    ]);
    onErrorRef.current("Payments are not configured yet. Please try again later.");
  }, [hasConfig, collectJsUrl, tokenizationKey]);

  useEffect(() => {
    onWalletStateRef.current?.({ availability, configuredPrice: configuredPriceState });
  }, [availability, configuredPriceState]);

  /** The options every configure() shares. Wallet options are layered on top when flagged. */
  const baseOptions = (): CollectJSOptions => ({
    variant: "inline",
    // Collect.js always constructs an internal PaymentRequest (Apple/Google Pay plumbing)
    // during configure, even for a card-only inline form. Without these three it logs
    // "Could not create PaymentRequestAbstraction" and the Next overlay treats it as a
    // console error. With no wallet flagged on, the price is a stub no sheet ever shows.
    currency: "USD",
    country: "US",
    price: "1.00",
    // Our own CSS is handed over explicitly rather than sniffed: styleSniffer guesses from
    // the host page and produces fields that drift from the rest of the form.
    styleSniffer: false,
    customCss: FIELD_CSS,
    focusCss: { ...FIELD_CSS, border: "1px solid #1a1a1a", outline: "none" },
    invalidCss: { ...FIELD_CSS, border: "1px solid #c0392b" },
    validCss: FIELD_CSS,
    placeholderCss: { ...FIELD_CSS, color: "#8a8a8a" },
    fields: {
      ccnumber: { selector: "#nmi-ccnumber", title: "Card number", placeholder: "1234 5678 9012 3456" },
      ccexp: { selector: "#nmi-ccexp", title: "Expiry", placeholder: "MM / YY" },
      cvv: { selector: "#nmi-cvv", title: "Security code", placeholder: "CVV" },
    },
    fieldsAvailableCallback: () => setReady(true),
    validationCallback: (field, valid, message) => {
      setFieldErrors((prev) => {
        const next = { ...prev };
        if (valid) delete next[field];
        else next[field] = message;
        return next;
      });
    },
    // Tokenisation that never answers must not leave the submit button spinning forever.
    // SPRINT-19: Collect.js also calls this when a wallet token cannot be finalised after the
    // sheet closes, so it is a real failure for wallets too and is reported the same way.
    timeoutDuration: 15000,
    timeoutCallback: () => {
      tokenizing.current = false;
      onErrorRef.current("The payment form timed out. Please check your details and try again.");
    },
    callback: (response) => {
      tokenizing.current = false;
      // SPRINT-19: the method comes from the RESPONSE, not the selected tab. `response.wallet`
      // (the sheet's name, address, postal code, email, phone) is deliberately never read.
      const method = paymentMethodFromTokenType(response?.tokenType);
      if (response?.token) {
        onTokenReadyRef.current(response.token, {
          method,
          cardBrand: typeof response.card?.type === "string" ? response.card.type : null,
          displayedAmount: method === "card" ? null : configuredPrice.current,
        });
      } else {
        onErrorRef.current(
          method === "card"
            ? "Card details are invalid. Please check and try again."
            : "That payment didn't go through, and nothing was charged. Please try again.",
        );
      }
    },
  });

  // Card only (no wallet flagged on): exactly the pre-Sprint-19 behaviour — configure once.
  useEffect(() => {
    if (walletsOn) return;
    if (!hasConfig || !sdkLoaded || !window.CollectJS || configured.current) return;

    configured.current = true;
    try {
      window.CollectJS.configure(baseOptions());
    } catch {
      configured.current = false;
      onErrorRef.current("Couldn't load the payment form. Please refresh and try again.");
    }
  }, [walletsOn, hasConfig, sdkLoaded]);

  // SPRINT-19: a wallet flagged on. Configure once the server's price is known; re-configure when
  // it changes while a wallet tab is selected. The first configure is immediate; later ones wait
  // for the tip to settle (the custom tip re-quotes on every keystroke).
  useEffect(() => {
    if (!walletsOn) return;
    if (!hasConfig || !sdkLoaded || !window.CollectJS) return;
    if (walletPrice === null || configuredPrice.current === walletPrice) return;
    if (configuredPrice.current !== null && activeMethod === "card") return;

    const delay = configuredPrice.current === null ? 0 : 400;
    const timer = setTimeout(() => {
      if (!window.CollectJS) return;
      const walletOptions = collectJsWalletOptions(wallets, walletPrice);
      const options = baseOptions();
      try {
        setReady(false);
        setFieldErrors({});
        window.CollectJS.configure({
          ...options,
          price: walletOptions.price,
          fields: { ...options.fields, ...walletOptions.fields },
        });
        configured.current = true;
        configuredPrice.current = walletPrice;
        setConfiguredPriceState(walletPrice);
      } catch {
        configured.current = false;
        configuredPrice.current = null;
        setConfiguredPriceState(null);
        onErrorRef.current("Couldn't load the payment form. Please refresh and try again.");
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [walletsOn, hasConfig, sdkLoaded, walletPrice, activeMethod, wallets]);

  // SPRINT-19: Apple Pay availability. Collect.js draws its <apple-pay-button> only when
  // ApplePaySession.canMakePayments() is true; both are checked, so neither alone can put an
  // Apple Pay tab on a browser that cannot use it.
  useEffect(() => {
    if (!wallets.applePay || configuredPriceState === null) return;
    const check = () => {
      let canPay = false;
      try {
        canPay = Boolean(window.ApplePaySession?.canMakePayments());
      } catch {
        canPay = false;
      }
      const yes = canPay && mountHasButton(WALLET_MOUNT_ID.apple_pay);
      setAvailability((prev) => (prev.applePay === yes ? prev : { ...prev, applePay: yes }));
    };
    check();
    const mount = document.getElementById(WALLET_MOUNT_ID.apple_pay);
    const observer = mount ? new MutationObserver(check) : null;
    if (mount && observer) observer.observe(mount, { childList: true });
    return () => observer?.disconnect();
  }, [wallets.applePay, configuredPriceState]);

  // SPRINT-19: Google Pay availability. Collect.js mounts its Google Pay iframe unconditionally
  // and never reports readiness, so Google's own isReadyToPay answers, together with the iframe
  // having been mounted.
  const [googleReady, setGoogleReady] = useState<boolean | null>(null);
  const [googleScriptLoaded, setGoogleScriptLoaded] = useState(false);
  useEffect(() => {
    if (!wallets.googlePay || !googleScriptLoaded) return;
    const Client = window.google?.payments?.api?.PaymentsClient;
    if (!Client) {
      setGoogleReady(false);
      return;
    }
    let cancelled = false;
    new Client({ environment: wallets.googlePayEnvironment })
      .isReadyToPay(GOOGLE_PAY_READY_REQUEST)
      .then((answer) => !cancelled && setGoogleReady(answer?.result === true))
      .catch(() => !cancelled && setGoogleReady(false));
    return () => {
      cancelled = true;
    };
  }, [wallets.googlePay, wallets.googlePayEnvironment, googleScriptLoaded]);
  useEffect(() => {
    if (!wallets.googlePay || configuredPriceState === null || googleReady === null) return;
    const yes = googleReady && mountHasButton(WALLET_MOUNT_ID.google_pay);
    setAvailability((prev) => (prev.googlePay === yes ? prev : { ...prev, googlePay: yes }));
  }, [wallets.googlePay, configuredPriceState, googleReady]);

  useEffect(() => {
    const el = document.getElementById("nmi-card-container");
    if (!el) return;
    const handler = () => {
      if (!window.CollectJS || !ready || tokenizing.current) return;
      // Collect.js answers through the configure() callback, not a promise.
      tokenizing.current = true;
      try {
        window.CollectJS.startPaymentRequest();
      } catch {
        tokenizing.current = false;
        onErrorRef.current("Couldn't process the card. Please try again.");
      }
    };
    el.addEventListener("harolds:tokenize", handler);
    return () => el.removeEventListener("harolds:tokenize", handler);
  }, [ready]);

  const errors = Object.values(fieldErrors).filter(Boolean);

  return (
    <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
      {hasConfig && (
        <Script
          src={collectJsUrl}
          data-tokenization-key={tokenizationKey}
          onReady={() => setSdkLoaded(true)}
          strategy="afterInteractive"
        />
      )}
      {/* SPRINT-19: only while Google Pay is flagged on, and only to ask isReadyToPay. */}
      {hasConfig && wallets.googlePayJsUrl ? (
        <Script
          src={wallets.googlePayJsUrl}
          onReady={() => setGoogleScriptLoaded(true)}
          onError={() => setGoogleReady(false)}
          strategy="afterInteractive"
        />
      ) : null}

      {/* Only the CONTAINERS are styled here. Their padding and border sit outside the elements
          Collect.js mounts into, so the hosted iframes' own dimensions are untouched. */}
      <div id="nmi-card-container">
        <label className="nmi-field-label" htmlFor="nmi-ccnumber">
          Card number
        </label>
        <div id="nmi-ccnumber" className="nmi-field" />

        <div className="nmi-field-row">
          <div>
            <label className="nmi-field-label" htmlFor="nmi-ccexp">
              Expiry
            </label>
            <div id="nmi-ccexp" className="nmi-field" />
          </div>
          <div>
            <label className="nmi-field-label" htmlFor="nmi-cvv">
              Security code
            </label>
            <div id="nmi-cvv" className="nmi-field" />
          </div>
        </div>
      </div>

      {!ready && (
        <p className="help" style={{ marginTop: 8 }}>
          Loading the secure payment form…
        </p>
      )}

      {/* Field-level messages come from Collect.js and are announced politely. */}
      <div aria-live="polite" aria-atomic="true">
        {errors.length > 0 && (
          <ul className="mt-2 space-y-1">
            {errors.map((message) => (
              <li key={message} className="help" style={{ color: "var(--danger, #c0392b)" }}>
                {message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <style>{`
        .nmi-field {
          min-height: 46px;
          width: 100%;
        }
        .nmi-field iframe {
          width: 100% !important;
          height: 46px !important;
          border: 0;
          display: block;
        }
        .nmi-field-label {
          display: block;
          font-size: 0.8125rem;
          margin: 12px 0 4px;
          color: var(--muted, #555);
        }
        .nmi-field-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 400px) {
          .nmi-field-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

/** Triggers tokenisation on the currently-attached card form. */
export function requestTokenize() {
  document.getElementById("nmi-card-container")?.dispatchEvent(new CustomEvent("harolds:tokenize"));
}
