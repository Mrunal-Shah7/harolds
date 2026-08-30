// Root application layout — shared HTML shell for all route-group surfaces.
import type { Metadata } from "next";
import { ClientErrorReporter } from "@/components/ClientErrorReporter";
// Self-hosted poster/display/body/utility faces.
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harold's Chicken Burnham",
  description: "Order pickup online from Harold's Chicken Burnham.",
};

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
