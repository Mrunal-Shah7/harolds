"use client";

// SPRINT-18.2 / SPRINT-19: Collect.js configuration, and the wallet flags, handed down from the
// server checkout layout.
//
// The layout resolves it per request from the server's own NMI_ENVIRONMENT, so there is no
// build-time copy for the browser to hold stale. The checkout page is a client component and a
// layout cannot pass props to its page, so the values travel through this context instead.
import { createContext, useContext, type ReactNode } from "react";
import type { NmiBrowserWallets } from "@harolds/config";

export type NmiCheckoutConfig = {
  collectJsUrl: string;
  tokenizationKey: string;
  /** SPRINT-19: server-side flags. Off here means the checkout is exactly the card-only one. */
  wallets: NmiBrowserWallets;
};

const NOT_CONFIGURED: NmiCheckoutConfig = {
  collectJsUrl: "",
  tokenizationKey: "",
  wallets: { applePay: false, googlePay: false, googlePayJsUrl: null, googlePayEnvironment: "TEST" },
};

const NmiCheckoutConfigContext = createContext<NmiCheckoutConfig>(NOT_CONFIGURED);

export function NmiCheckoutConfigProvider({
  config,
  children,
}: {
  config: NmiCheckoutConfig;
  children: ReactNode;
}) {
  return <NmiCheckoutConfigContext.Provider value={config}>{children}</NmiCheckoutConfigContext.Provider>;
}

export function useNmiCheckoutConfig(): NmiCheckoutConfig {
  return useContext(NmiCheckoutConfigContext);
}
