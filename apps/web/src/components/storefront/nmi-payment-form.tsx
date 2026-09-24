"use client";

// SPRINT-12 / SPRINT-17 / SPRINT-18.2: NMI Collect.js — card fields as gateway-hosted iframes.
// Only the single-use payment token ever reaches our server; the PAN never touches this origin.
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useNmiCheckoutConfig } from "@/components/storefront/nmi-checkout-config";

declare global {
  interface Window {
    CollectJS?: CollectJS;
  }
}

type CollectJSFieldConfig = {
  selector: string;
  title?: string;
  placeholder?: string;
};

type CollectJSResponse = {
  token?: string;
  card?: { number?: string; exp?: string; type?: string };
};

type CollectJSValidationField = "ccnumber" | "ccexp" | "cvv" | string;

type CollectJS = {
  configure: (options: {
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
    fields: Record<string, CollectJSFieldConfig>;
    callback: (response: CollectJSResponse) => void;
    validationCallback?: (
      field: CollectJSValidationField,
      valid: boolean,
      message: string,
    ) => void;
    fieldsAvailableCallback?: () => void;
    timeoutDuration?: number;
    timeoutCallback?: () => void;
  }) => void;
  startPaymentRequest: () => void;
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

export function NmiPaymentForm({
  onTokenReady,
  onError,
  disabled,
}: {
  onTokenReady: (token: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /**
   * Collect.js takes ONE callback at configure() time and holds it for the life of the page, so
   * the handlers are kept in refs and the configure call is run exactly once. Re-configuring on
   * every render tore the iframes down mid-checkout — the same failure the Square form hit when
   * the tip total was in its dependency array.
   */
  const onTokenReadyRef = useRef(onTokenReady);
  onTokenReadyRef.current = onTokenReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const tokenizing = useRef(false);
  const configured = useRef(false);

  // Collect.js is served from the gateway itself, and the sandbox and production accounts are on
  // different gateways. Both values come from the server for the active environment
  // (checkout/layout.tsx), so the script and the key always belong to the same gateway.
  const { collectJsUrl, tokenizationKey } = useNmiCheckoutConfig();
  const hasConfig = collectJsUrl.length > 0 && tokenizationKey.length > 0;

  useEffect(() => {
    if (hasConfig) return;
    reportMissingConfig([
      ...(collectJsUrl ? [] : ["Collect.js URL"]),
      ...(tokenizationKey ? [] : ["NMI_TOKENIZATION_KEY for the active NMI_ENVIRONMENT"]),
    ]);
    onErrorRef.current("Payments are not configured yet. Please try again later.");
  }, [hasConfig, collectJsUrl, tokenizationKey]);

  useEffect(() => {
    if (!hasConfig || !sdkLoaded || !window.CollectJS || configured.current) return;

    configured.current = true;
    try {
      window.CollectJS.configure({
        variant: "inline",
        // Collect.js always constructs an internal PaymentRequest (Apple/Google Pay plumbing)
        // during configure, even for a card-only inline form. Without these three it logs
        // "Could not create PaymentRequestAbstraction" and the Next overlay treats it as a
        // console error. Checkout does not offer wallets; the figures are stubs.
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
        timeoutDuration: 15000,
        timeoutCallback: () => {
          tokenizing.current = false;
          onErrorRef.current("The payment form timed out. Please check your details and try again.");
        },
        callback: (response) => {
          tokenizing.current = false;
          if (response?.token) {
            onTokenReadyRef.current(response.token);
          } else {
            onErrorRef.current("Card details are invalid. Please check and try again.");
          }
        },
      });
    } catch {
      configured.current = false;
      onErrorRef.current("Couldn't load the payment form. Please refresh and try again.");
    }
  }, [hasConfig, sdkLoaded]);

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
