// SPRINT-18: what a storefront route calls — Next Metadata and the serialised JSON-LD for a
// route key. Both come from the one cached accessor; the graph comes from the one builder.
import type { Metadata } from "next";
import type { SeoSnapshot } from "@harolds/types";
import { emitLog } from "@harolds/config";
import { getSeoSnapshot } from "./data";
import { jsonLdForRoute, serializeJsonLd } from "./jsonld";
import { resolveRouteMeta, type ResolvedRouteMeta } from "./resolve";

const warn = (event: string, fields: Record<string, unknown>) => emitLog("warn", event, fields);

/** Next Metadata for a resolved route. Pure, so tests assert on it without a server. */
export function toNextMetadata(resolved: ResolvedRouteMeta, snapshot: SeoSnapshot): Metadata {
  const base: Metadata = {
    title: { absolute: resolved.title },
    description: resolved.description || undefined,
  };
  if (!resolved.indexable) {
    // Critical for order status / confirmation: noindex here, excluded from the sitemap, and
    // disallowed in robots.txt — three independent controls.
    return { ...base, robots: { index: false, follow: false } };
  }
  return {
    ...base,
    alternates: { canonical: resolved.canonicalUrl },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      url: resolved.url,
      title: resolved.title,
      description: resolved.description || undefined,
      siteName: snapshot.site.siteName,
      locale: snapshot.site.locale,
      images: [{ url: resolved.ogImageUrl }],
    },
    twitter: {
      card: "summary_large_image",
      title: resolved.title,
      description: resolved.description || undefined,
      images: [resolved.ogImageUrl],
      site: snapshot.site.twitterHandle ?? undefined,
    },
  };
}

export async function routeMetadata(routeKey: string): Promise<Metadata> {
  const snapshot = await getSeoSnapshot();
  return toNextMetadata(resolveRouteMeta(snapshot, routeKey, {}, warn), snapshot);
}

/** Serialised, <script>-safe JSON-LD for a route; null when the route emits none. */
export async function routeJsonLd(routeKey: string): Promise<string | null> {
  const snapshot = await getSeoSnapshot();
  const graph = jsonLdForRoute(snapshot, resolveRouteMeta(snapshot, routeKey, {}, warn), (node, reason) =>
    emitLog("debug", "seo.jsonld.node_omitted", { routeKey, node, reason }),
  );
  return graph ? serializeJsonLd(graph) : null;
}

/** Root layout: metadataBase from the canonical host (set once), and the site-wide defaults. */
export async function rootMetadata(): Promise<Metadata> {
  const { site } = await getSeoSnapshot();
  return {
    metadataBase: new URL(site.canonicalHost),
    title: site.defaultTitle,
    description: site.defaultDescription,
  };
}
