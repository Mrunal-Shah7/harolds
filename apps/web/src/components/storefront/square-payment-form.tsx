"use client";

// Square Web Payments SDK — tokenises card/Apple Pay/Google Pay/Cash App Pay in the
// browser. Only the resulting token is ever sent to the server (STOREFRONT-REQUIREMENTS.md #1, #8).
import { useEffect, useRef, useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    Square?: {
      payments: (appId: string, locationId: string) => Promise<SquarePayments>;
    };
  }
}

type SquarePayments = {
  card: () => Promise<SquareCardInstance>;
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

const SDK_SRC =
  process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === "production"
    ? "https://web.squarecdn.com/v1/square.js"
    : "https://sandbox.web.squarecdn.com/v1/square.js";

export function SquarePaymentForm({
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
  const cardRef = useRef<SquareCardInstance | null>(null);
  const tokenizing = useRef(false);

  const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID ?? "";
  const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID ?? "";

  useEffect(() => {
    if (!sdkLoaded || !window.Square) return;
    let cancelled = false;

    if (!appId || !locationId) {
      onError("Payments are not configured yet. Please try again later.");
      return;
    }

    window.Square.payments(appId, locationId)
      .then((payments) => payments.card())
      .then(async (card) => {
        if (cancelled) return;
        await card.attach("#square-card-container");
        cardRef.current = card;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) onError("Couldn't load the payment form. Please refresh and try again.");
      });

    return () => {
      cancelled = true;
      void cardRef.current?.destroy();
      cardRef.current = null;
    };
  }, [sdkLoaded, appId, locationId, onError]);

  // Exposes tokenize() to the parent via a global-free imperative pattern: parent calls
  // the exported ref through a data attribute event instead of prop-drilling a function ref.
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

  return (
    <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
      <Script src={SDK_SRC} onReady={() => setSdkLoaded(true)} strategy="afterInteractive" />
      <div
        id="square-card-container"
        className="min-h-[56px] rounded-lg border border-border p-3"
      />
      {!ready && <p className="mt-2 text-xs text-muted-foreground">Loading secure payment form…</p>}
    </div>
  );
}

/** Triggers tokenisation on the currently-attached card form. */
export function requestTokenize() {
  document.getElementById("square-card-container")?.dispatchEvent(new CustomEvent("harolds:tokenize"));
}
