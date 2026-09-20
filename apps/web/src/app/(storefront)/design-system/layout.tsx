// SPRINT-18: the design-system showcase is a dev-only client page (404 in production). This
// layout exists only to mark it noindex, which a client component cannot do for itself.
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

export default function DesignSystemLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
