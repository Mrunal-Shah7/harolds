// SPRINT-14: the menu page (design.md §9.2). Sticky tabs, one section per category, every item
// on one page. No pagination and no lazy category loading — 87 items is not a performance
// problem, and pagination is a decision problem handed to a hungry customer.
import type { FullMenu, StoreStatus } from "@harolds/types";
import { MenuBrowser } from "@/components/storefront/menu-browser";
import { fetchSection } from "@/lib/storefront-fetch";

export default async function MenuPage() {
  const [menu, status] = await Promise.all([
    fetchSection<FullMenu>("/api/v1/menu"),
    fetchSection<StoreStatus>("/api/v1/store/status"),
  ]);

  return <MenuBrowser menu={menu} status={status} />;
}
