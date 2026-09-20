// SPRINT-14: storefront home (design.md §9.1). Static hero, category rail, most-ordered, footer.
// No carousel: the reference site's rotating hero is backed by a promotions system that does not
// exist here, and a carousel of one slide — or of slides that lie — is worse than a headline.
// SPRINT-18: route metadata and the page's one JSON-LD graph, both keyed "home".
import type { Metadata } from "next";
import type { FullMenu, MenuItemSummary, StoreStatus } from "@harolds/types";
import { HomeView } from "@/components/storefront/home-view";
import { JsonLdScript } from "@/components/seo/json-ld";
import { fetchSection } from "@/lib/storefront-fetch";
import { routeMetadata } from "@/lib/seo/page";

export function generateMetadata(): Promise<Metadata> {
  return routeMetadata("home");
}

export default async function StorefrontPage() {
  const [menu, status, mostOrdered] = await Promise.all([
    fetchSection<FullMenu>("/api/v1/menu"),
    fetchSection<StoreStatus>("/api/v1/store/status"),
    // §9.1: the curated Sprint 5 list. The section is hidden entirely when this is empty.
    fetchSection<{ items: MenuItemSummary[] }>("/api/v1/menu/most-ordered"),
  ]);

  return (
    <>
      <JsonLdScript routeKey="home" />
      <HomeView menu={menu} status={status} mostOrdered={mostOrdered?.items ?? []} />
    </>
  );
}
