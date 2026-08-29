// SPRINT-1: root application layout — shared HTML shell for all route-group surfaces
import type { Metadata } from "next";
import { ClientErrorReporter } from "@/components/ClientErrorReporter";
// SPRINT-14: self-hosted display/body/utility faces (design.md §5.3, §15).
import { fontVariables } from "./fonts";
// SPRINT-17: storefront theme preference, applied before first paint.
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harold's Chicken Oak Lawn",
  description: "Order pickup online from Harold's Chicken Oak Lawn.",
};

export const viewport = {
  themeColor: "#1a1a1a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Runs before paint so the page never renders light and repaints dark. Inline is
            permitted by the existing CSP (script-src 'self' 'unsafe-inline'); the policy is
            NOT widened by this. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ClientErrorReporter />
        {children}
      </body>
    </html>
  );
}
