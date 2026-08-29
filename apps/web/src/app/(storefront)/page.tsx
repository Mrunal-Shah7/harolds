// SPRINT-14: storefront home (design.md §9.1). Static hero, category rail, most-ordered, footer.
// No carousel: the reference site's rotating hero is backed by a promotions system that does not
// exist here, and a carousel of one slide — or of slides that lie — is worse than a headline.
import type { FullMenu, MenuItemSummary, StoreStatus } from "@harolds/types";
import { HomeView } from "@/components/storefront/home-view";
import { fetchSection } from "@/lib/storefront-fetch";

export default async function StorefrontPage() {
  const [menu, status, mostOrdered] = await Promise.all([
    fetchSection<FullMenu>("/api/v1/menu"),
    fetchSection<StoreStatus>("/api/v1/store/status"),
    // §9.1: the curated Sprint 5 list. The section is hidden entirely when this is empty.
    fetchSection<{ items: MenuItemSummary[] }>("/api/v1/menu/most-ordered"),
  ]);

  return <HomeView menu={menu} status={status} mostOrdered={mostOrdered?.items ?? []} />;
}
