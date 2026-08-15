// SPRINT-8: admin route-group layout — dense back-office typography.
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./admin.css";

const display = Source_Serif_4({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-adm-display",
  display: "swap",
});

const sans = IBM_Plex_Sans({
  weight: ["400", "600"],
  subsets: ["latin"],
  variable: "--font-adm-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  weight: ["400", "600"],
  subsets: ["latin"],
  variable: "--font-adm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Back office — Harold's Chicken Oak Lawn",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1a140c",
  width: "device-width",
  initialScale: 1,
};

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={`adm-root ${display.variable} ${sans.variable} ${mono.variable}`}>{children}</div>;
}
