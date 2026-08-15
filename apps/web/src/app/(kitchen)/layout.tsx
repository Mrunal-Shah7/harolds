// SPRINT-6: kitchen display route-group layout — PWA shell, expo typography, wake-friendly viewport.
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Anton, IBM_Plex_Mono } from "next/font/google";
import "./kitchen.css";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-kds-display",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "600"],
  subsets: ["latin"],
  variable: "--font-kds-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kitchen — Harold's Chicken Oak Lawn",
  applicationName: "Harold's Kitchen",
  description: "Kitchen display for Harold's Chicken Oak Lawn",
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
  themeColor: "#0b0a07",
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
  return <div className={`kds-root ${anton.variable} ${plexMono.variable}`}>{children}</div>;
}
