// SPRINT-18: THE cached accessor for SEO data. Every storefront consumer — route metadata, the
// JSON-LD graph, sitemap.xml, robots.txt — reads SEO state through getSeoSnapshot(), and nothing
// in the storefront queries the SEO tables any other way (the same single-boundary rule as the
// JSON-LD builder, applied to reads).
//
// Invalidation is in-process: storefront and admin are routes in ONE Next application running
// as ONE pm2 process (fork mode, instances: 1 — confirmed by the operator, Sprint 18 Phase 0.3),
// so the admin save calls revalidateTag(SEO_CACHE_TAG) after its transaction commits and the
// very next storefront request re-reads the database. There is no network hop to cross, and
// nothing here pretends there is.
//
// BACKSTOP: revalidate = 3600 s. With tag invalidation working this never fires; it exists so
// that a bug in the invalidation path degrades to "stale for up to an hour" rather than "stale
// until restart". An hour is long enough that the cache still does its job (the snapshot is
// read on every storefront render), and short enough that a missed invalidation of a public
// business fact is corrected the same service.
//
// IF PM2 IS EVER MOVED TO CLUSTER MODE, THIS DESIGN IS WRONG: revalidateTag reaches only the
// worker that handled the save. See docs/SPRINT-18-NOTES.md §6.3 before changing `instances`.
import { unstable_cache } from "next/cache";
import type { SeoSnapshot } from "@harolds/types";
import { emitLog } from "@harolds/config";
import { loadSeoSnapshot } from "@harolds/db";

export const SEO_CACHE_TAG = "seo";
export const SEO_BACKSTOP_REVALIDATE_SECONDS = 3600;

const readSnapshot = unstable_cache(() => loadSeoSnapshot(), ["sprint18-seo-snapshot"], {
  tags: [SEO_CACHE_TAG],
  revalidate: SEO_BACKSTOP_REVALIDATE_SECONDS,
});

/**
 * Served only when the database cannot be read at all. It suppresses the Restaurant node
 * (isConfigured false) and keeps the pre-sprint title and description, so an outage degrades to
 * "no structured data" rather than to a 500 on every storefront page. The host is the
 * operator-confirmed canonical origin, the same value the migration seeds.
 */
export const FALLBACK_SEO_SNAPSHOT: SeoSnapshot = {
  version: 0,
  business: {
    displayName: "",
    legalName: null,
    description: "",
    streetAddress: "",
    addressLocality: "",
    addressRegion: "",
    postalCode: "",
    addressCountry: "US",
    telephone: null,
    telephoneDisplay: null,
    latitude: null,
    longitude: null,
    priceRange: null,
    servesCuisine: [],
    logoUrl: null,
    imageUrl: null,
    sameAs: [],
    isConfigured: false,
    hours: [],
    updatedAt: new Date(0).toISOString(),
  },
  site: {
    siteName: "Harold's Chicken Burnham",
    canonicalHost: "https://haroldsburnham.com",
    defaultTitle: "Harold's Chicken Burnham",
    titleTemplate: "{pageTitle} | Harold's Chicken Burnham",
    defaultDescription: "Order pickup online from Harold's Chicken Burnham.",
    defaultOgImageUrl: null,
    locale: "en_US",
    twitterHandle: null,
    updatedAt: new Date(0).toISOString(),
  },
  routes: {},
};

export async function getSeoSnapshot(): Promise<SeoSnapshot> {
  try {
    return await readSnapshot();
  } catch (err) {
    // A thrown loader is not cached, so the next request tries the database again.
    emitLog("error", "seo.snapshot_unavailable", {
      message: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
    return FALLBACK_SEO_SNAPSHOT;
  }
}
