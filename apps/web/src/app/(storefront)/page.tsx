// Storefront home — full menu + store status, server-fetched from the public v1 API.
import type { FullMenu, StoreStatus } from "@harolds/types";
import { MenuBrowser } from "@/components/storefront/menu-browser";

function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

async function fetchMenu(): Promise<FullMenu> {
  const res = await fetch(`${apiBaseUrl()}/api/v1/menu`, { cache: "no-store" });
  const body = await res.json();
  return body.data as FullMenu;
}

async function fetchStoreStatus(): Promise<StoreStatus> {
  const res = await fetch(`${apiBaseUrl()}/api/v1/store/status`, { cache: "no-store" });
  const body = await res.json();
  return body.data as StoreStatus;
}

export default async function StorefrontPage() {
  const [menu, status] = await Promise.all([fetchMenu(), fetchStoreStatus()]);
  return <MenuBrowser menu={menu} status={status} />;
}
