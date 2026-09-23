"use client";

// SPRINT-18.2: Collect.js configuration, handed down from the server checkout layout.
//
// The layout resolves it per request from the server's own NMI_ENVIRONMENT, so there is no
// build-time copy for the browser to hold stale. The checkout page is a client component and a
// layout cannot pass props to its page, so the values travel through this context instead.
import { createContext, useContext, type ReactNode } from "react";

export type NmiCheckoutConfig = {
  collectJsUrl: string;
  tokenizationKey: string;
};

const NOT_CONFIGURED: NmiCheckoutConfig = { collectJsUrl: "", tokenizationKey: "" };

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
