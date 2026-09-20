// SPRINT-18: metadata for /order/[lookupToken] — order status AND confirmation, one route. The page
// is a client component and cannot export metadata, so this server layout does, and nothing else.
// It may show an order's lines and pickup time: always noindex here, never in the sitemap, and
// disallowed in robots.txt — three independent controls (lib/seo/routes.ts).
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { routeMetadata } from "@/lib/seo/page";

export function generateMetadata(): Promise<Metadata> {
  return routeMetadata("order-status");
}

export default function OrderStatusLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
