// SPRINT-2: in-process FullMenu + etag cache with TTL and explicit invalidation.
import type { FullMenu } from "@harolds/types";
import { getFullMenu, getMenuEtag } from "./repositories/menu";
import { invalidateStoreConfigCache } from "./store-config";

const CACHE_TTL_MS = 60_000;

type MenuCacheEntry = {
  menu: FullMenu;
  etag: string;
  expiresAt: number;
};

let menuCache: MenuCacheEntry | null = null;

/** Drop the in-process menu cache. Call after admin menu mutations. */
export function invalidateMenuCache(): void {
  menuCache = null;
}

/** Invalidate all public read caches (menu + store config). */
export function invalidateAllPublicCaches(): void {
  invalidateMenuCache();
  invalidateStoreConfigCache();
}

/**
 * Cached FullMenu + etag. Freshness ≤ CACHE_TTL_MS unless invalidated.
 * Fetches menu and etag in parallel on miss.
 */
export async function getCachedFullMenu(): Promise<{ menu: FullMenu; etag: string }> {
  const now = Date.now();
  if (menuCache && menuCache.expiresAt > now) {
    return { menu: menuCache.menu, etag: menuCache.etag };
  }

  const [menu, etag] = await Promise.all([getFullMenu(), getMenuEtag()]);
  menuCache = { menu, etag, expiresAt: now + CACHE_TTL_MS };
  return { menu, etag };
}

/** Test helper — whether the menu cache currently holds a live entry. */
export function __menuCacheIsHot(): boolean {
  return menuCache !== null && menuCache.expiresAt > Date.now();
}
