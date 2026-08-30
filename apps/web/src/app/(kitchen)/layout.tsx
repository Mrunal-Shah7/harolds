// Kitchen display route-group layout — PWA shell, wake-friendly viewport.
// Design v1.1: all three surfaces share the same four self-hosted faces, loaded once on <html>
// by the root layout. The KDS-only Google faces are gone — no external font origin is contacted
// and the CSP is untouched.
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./kitchen.css";

export const metadata: Metadata = {
  title: "Kitchen — Harold's Chicken Burnham",
  applicationName: "Harold's Kitchen",
  description: "Kitchen display for Harold's Chicken Burnham",
  manifest: "/kitchen/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Harold's Kitchen",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/kitchen/icon-192.png",
    apple: "/kitchen/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#141110",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function KitchenLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  // `kds` applies the dark token scope at the route-group root, so a shared primitive rendered
  // on the board can never resolve a light-surface token. The board's own presentation comes
  // from kitchen.css.
  return <div className="kds kds-root">{children}</div>;
}
