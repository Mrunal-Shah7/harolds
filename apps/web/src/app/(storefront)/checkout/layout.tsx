// SPRINT-18: metadata for /checkout. The page is a client component and cannot export metadata,
// so this server layout does — and nothing else. It renders its children untouched; the checkout
// flow itself is not changed by this sprint. Always noindex (lib/seo/routes.ts).
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { routeMetadata } from "@/lib/seo/page";

export function generateMetadata(): Promise<Metadata> {
  return routeMetadata("checkout");
}

export default function CheckoutLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
