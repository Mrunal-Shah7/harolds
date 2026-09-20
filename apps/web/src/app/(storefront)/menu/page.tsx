// SPRINT-14: the menu page (design.md §9.2). Sticky tabs, one section per category, every item
// on one page. No pagination and no lazy category loading — 87 items is not a performance
// problem, and pagination is a decision problem handed to a hungry customer.
// SPRINT-18: route metadata and the page's one JSON-LD graph, both keyed "menu".
import type { Metadata } from "next";
import type { FullMenu, StoreStatus } from "@harolds/types";
import { MenuBrowser } from "@/components/storefront/menu-browser";
import { JsonLdScript } from "@/components/seo/json-ld";
import { fetchSection } from "@/lib/storefront-fetch";
import { routeMetadata } from "@/lib/seo/page";

export function generateMetadata(): Promise<Metadata> {
  return routeMetadata("menu");
}

export default async function MenuPage() {
  const [menu, status] = await Promise.all([
    fetchSection<FullMenu>("/api/v1/menu"),
    fetchSection<StoreStatus>("/api/v1/store/status"),
  ]);

  return (
    <>
      <JsonLdScript routeKey="menu" />
      <MenuBrowser menu={menu} status={status} />
    </>
  );
}
