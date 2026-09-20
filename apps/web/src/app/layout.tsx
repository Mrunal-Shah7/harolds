// Root application layout — shared HTML shell for all route-group surfaces.
import type { Metadata } from "next";
import { ClientErrorReporter } from "@/components/ClientErrorReporter";
import { rootMetadata } from "@/lib/seo/page";
// Self-hosted poster/display/body/utility faces.
import { fontVariables } from "./fonts";
import "./globals.css";

// SPRINT-18: metadataBase is set once, here, from the canonical host in the SEO site defaults;
// the site-wide title and description come from the same place. Storefront routes override them
// through lib/seo/page.ts; admin and kitchen set their own.
export function generateMetadata(): Promise<Metadata> {
  return rootMetadata();
}

export const viewport = {
  themeColor: "#f7f0e1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // LIGHT ONLY, for now. The dark scheme and its toggle are hidden rather than deleted: the
    // `html[data-theme="dark"] .sf-root` rules and lib/theme.ts are still in the tree, and
    // stamping "light" here is what keeps them from firing — including for a visitor whose OS
    // prefers dark, whom the `system` default would otherwise have sent to the dark scheme.
    <html lang="en" data-theme="light" className={fontVariables} suppressHydrationWarning>
      <body>
        <ClientErrorReporter />
        {children}
      </body>
    </html>
  );
}
