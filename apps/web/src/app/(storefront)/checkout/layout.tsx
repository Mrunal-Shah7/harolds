// SPRINT-18 / SPRINT-19: metadata for /checkout. The page is a client component and cannot export metadata,
// so this server layout does. Always noindex (lib/seo/routes.ts).
// SPRINT-18.2: this layout is also the server boundary that hands Collect.js its configuration.
// It resolves the script URL and the active tokenization key from the server's NMI_ENVIRONMENT
// on every request — never at build time — so a bundle cannot be on a different gateway from
// the server, and there are no NEXT_PUBLIC_NMI_* variables to disagree.
// SPRINT-19: the wallet flags travel the same way, so a flag change needs a restart, not a rebuild.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getNmiBrowserConfig } from "@harolds/config";
import { routeMetadata } from "@/lib/seo/page";
import { NmiCheckoutConfigProvider } from "@/components/storefront/nmi-checkout-config";

/** Request-time, not prerendered: a prerendered page would freeze the gateway at build. */
export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return routeMetadata("checkout");
}

export default function CheckoutLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { collectJsUrl, tokenizationKey, wallets } = getNmiBrowserConfig();
  return (
    <NmiCheckoutConfigProvider config={{ collectJsUrl, tokenizationKey, wallets }}>{children}</NmiCheckoutConfigProvider>
  );
}
