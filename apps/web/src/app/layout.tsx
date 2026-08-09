// SPRINT-1: root application layout — shared HTML shell for all route-group surfaces
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harold's Chicken Oak Lawn",
  description: "In-house online ordering — Harold's Chicken Oak Lawn",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
