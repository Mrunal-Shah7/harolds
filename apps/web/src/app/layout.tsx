// SPRINT-1: root application layout — shared HTML shell for all route-group surfaces
import type { Metadata } from "next";
import { ClientErrorReporter } from "@/components/ClientErrorReporter";
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
    <html lang="en">
      <body>
        <ClientErrorReporter />
        {children}
      </body>
    </html>
  );
}
