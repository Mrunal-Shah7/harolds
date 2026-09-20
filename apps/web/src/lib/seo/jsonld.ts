// SPRINT-18: THE JSON-LD graph builder. Critical rule 5: this is the only module in the codebase
// that constructs schema.org structured data. Routes, layouts and components call it; none of
// them assemble a node. Pure and dependency-free, so the admin preview renders unsaved form
// state through exactly the code the storefront uses.
//
// Decisions (docs/SPRINT-18-NOTES.md §2):
//   - ONE `@graph` per page; nodes cross-reference by `@id` and are never duplicated.
//   - `Restaurant`, not `LocalBusiness`, and NO separate `Organization` node. Restaurant is an
//     Organization subtype, so legalName / logo / sameAs / telephone live on it. A sibling
//     Organization describing the same entity splits it in Google's eyes.
//   - Omission over invention: a node missing a required value is dropped whole, with a logged
//     reason, never emitted with an empty or made-up value.
//   - Critical rule 8: while `isConfigured` is false there is no Restaurant node at all, and every
//     reference to it (WebSite.publisher, WebPage.about) is dropped with it.
//   - No SearchAction / sitelinks searchbox — deprecated by Google.
import type { SeoBusinessData, SeoOpeningHoursRow, SeoSnapshot } from "@harolds/types";
import type { ResolvedRouteMeta } from "./resolve";

export type JsonLdNode = Record<string, unknown> & { "@type": string; "@id"?: string };
export type JsonLdGraph = { "@context": "https://schema.org"; "@graph": JsonLdNode[] };

export type JsonLdPage = {
  /** Absolute canonical URL of the page. */
  url: string;
  title: string;
  description: string;
  imageUrl: string | null;
  /** Ancestors-to-self trail. Only category/item pages would pass one; none exist yet. */
  breadcrumb?: Array<{ name: string; url: string }>;
  /** The homepage never gets a BreadcrumbList, whatever is passed. */
  isHome: boolean;
};

/** Called once per dropped node, with the reason. The server wires this to a debug log line. */
export type OmissionLog = (node: string, reason: string) => void;

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const PLACEHOLDER = /placeholder/i;

export function siteOrigin(canonicalHost: string): string {
  return canonicalHost.replace(/\/+$/, "");
}

export function restaurantId(canonicalHost: string): string {
  return `${siteOrigin(canonicalHost)}/#restaurant`;
}

export function websiteId(canonicalHost: string): string {
  return `${siteOrigin(canonicalHost)}/#website`;
}

function present(v: string | null | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * OpeningHoursSpecification rows, one per distinct (opens, closes) pair with its days grouped.
 * A closed day is 00:00–00:00, which is how Google documents "closed all day". An overnight range
 * keeps its real closing time (e.g. 18:00–02:00) on the day it opens. Unset days claim nothing.
 */
export function openingHoursSpecification(hours: SeoOpeningHoursRow[]): JsonLdNode[] {
  const groups = new Map<string, { opens: string; closes: string; days: number[] }>();
  for (const row of [...hours].sort((a, b) => a.dayOfWeek - b.dayOfWeek)) {
    const opens = row.isClosed ? "00:00" : row.opens;
    const closes = row.isClosed ? "00:00" : row.closes;
    if (!opens || !closes) continue;
    const key = `${opens}-${closes}`;
    const group = groups.get(key) ?? { opens, closes, days: [] };
    if (!group.days.includes(row.dayOfWeek)) group.days.push(row.dayOfWeek);
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: g.days.length === 1 ? DAYS[g.days[0]!] : g.days.map((d) => DAYS[d]),
    opens: g.opens,
    closes: g.closes,
  }));
}

/** The Restaurant node, or null with a reason. Never a node with an empty required value. */
export function buildRestaurantNode(
  business: SeoBusinessData,
  canonicalHost: string,
  menuUrl: string,
  onOmit: OmissionLog,
): JsonLdNode | null {
  if (!business.isConfigured) {
    onOmit("Restaurant", "isConfigured is false — the business record has not been reviewed");
    return null;
  }
  const required: Array<[string, string | null]> = [
    ["displayName", business.displayName],
    ["streetAddress", business.streetAddress],
    ["addressLocality", business.addressLocality],
    ["addressRegion", business.addressRegion],
    ["postalCode", business.postalCode],
    ["addressCountry", business.addressCountry],
    ["telephone", business.telephone],
  ];
  const missing = required.filter(([, v]) => !present(v)).map(([k]) => k);
  if (missing.length > 0) {
    onOmit("Restaurant", `missing required value(s): ${missing.join(", ")}`);
    return null;
  }
  // Defence in depth behind validation: a seeded placeholder is never published, even if a row
  // was marked configured by hand in the database.
  const placeholder = required.filter(([, v]) => PLACEHOLDER.test(v!)).map(([k]) => k);
  if (placeholder.length > 0) {
    onOmit("Restaurant", `placeholder text in: ${placeholder.join(", ")}`);
    return null;
  }

  const origin = siteOrigin(canonicalHost);
  const node: JsonLdNode = {
    "@type": "Restaurant",
    "@id": restaurantId(canonicalHost),
    name: business.displayName.trim(),
  };
  if (present(business.legalName)) node.legalName = business.legalName.trim();
  if (present(business.description)) node.description = business.description.trim();
  node.url = `${origin}/`;
  node.telephone = business.telephone;
  node.address = {
    "@type": "PostalAddress",
    streetAddress: business.streetAddress.trim(),
    addressLocality: business.addressLocality.trim(),
    addressRegion: business.addressRegion.trim(),
    postalCode: business.postalCode.trim(),
    addressCountry: business.addressCountry.trim(),
  };
  if (business.latitude !== null && business.longitude !== null) {
    node.geo = { "@type": "GeoCoordinates", latitude: business.latitude, longitude: business.longitude };
  } else {
    onOmit("Restaurant.geo", "latitude/longitude not set");
  }
  const spec = openingHoursSpecification(business.hours);
  if (spec.length > 0) node.openingHoursSpecification = spec;
  else onOmit("Restaurant.openingHoursSpecification", "no opening hours set");
  const cuisines = business.servesCuisine.filter(present);
  if (cuisines.length > 0) node.servesCuisine = cuisines.length === 1 ? cuisines[0] : cuisines;
  if (present(business.priceRange)) node.priceRange = business.priceRange.trim();
  if (present(business.imageUrl)) node.image = business.imageUrl;
  if (present(business.logoUrl)) node.logo = business.logoUrl;
  const sameAs = business.sameAs.filter(present);
  if (sameAs.length > 0) node.sameAs = sameAs;
  node.hasMenu = menuUrl;
  node.acceptsReservations = false;
  return node;
}

/** The single graph for one page. */
export function buildJsonLdGraph(
  snapshot: SeoSnapshot,
  page: JsonLdPage,
  onOmit: OmissionLog = () => undefined,
): JsonLdGraph {
  const host = snapshot.site.canonicalHost;
  const origin = siteOrigin(host);
  const graph: JsonLdNode[] = [];
  const inLanguage = snapshot.site.locale.replace("_", "-");

  const restaurant = buildRestaurantNode(snapshot.business, host, `${origin}/menu`, onOmit);
  if (restaurant) graph.push(restaurant);

  const website: JsonLdNode = {
    "@type": "WebSite",
    "@id": websiteId(host),
    url: `${origin}/`,
    name: snapshot.site.siteName,
    inLanguage,
  };
  if (restaurant) website.publisher = { "@id": restaurant["@id"] };
  graph.push(website);

  let breadcrumb: JsonLdNode | null = null;
  const trail = page.breadcrumb ?? [];
  if (page.isHome) {
    if (trail.length > 0) onOmit("BreadcrumbList", "never on the homepage");
  } else if (trail.length >= 2 && trail.every((t) => present(t.name) && present(t.url))) {
    breadcrumb = {
      "@type": "BreadcrumbList",
      "@id": `${page.url}#breadcrumb`,
      itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: t.url })),
    };
  } else if (trail.length > 0) {
    onOmit("BreadcrumbList", "a trail needs at least two named, linked entries");
  }

  const webpage: JsonLdNode = {
    "@type": "WebPage",
    "@id": `${page.url}#webpage`,
    url: page.url,
    name: page.title,
    isPartOf: { "@id": website["@id"] },
    inLanguage,
  };
  if (present(page.description)) webpage.description = page.description;
  if (restaurant) webpage.about = { "@id": restaurant["@id"] };
  if (present(page.imageUrl)) webpage.primaryImageOfPage = { "@type": "ImageObject", url: page.imageUrl };
  if (breadcrumb) webpage.breadcrumb = { "@id": breadcrumb["@id"] };
  graph.push(webpage);
  if (breadcrumb) graph.push(breadcrumb);

  return { "@context": "https://schema.org", "@graph": graph };
}

/**
 * The graph for a resolved route — what both the storefront and the admin preview call. Null for
 * a noindex route: a page that asks not to be indexed has nothing to describe to a crawler.
 */
export function jsonLdForRoute(
  snapshot: SeoSnapshot,
  resolved: ResolvedRouteMeta,
  onOmit: OmissionLog = () => undefined,
): JsonLdGraph | null {
  if (!resolved.indexable) return null;
  return buildJsonLdGraph(
    snapshot,
    {
      url: resolved.url,
      title: resolved.title,
      description: resolved.description,
      imageUrl: resolved.ogImageUrl,
      isHome: resolved.routeKey === "home",
    },
    onOmit,
  );
}

/**
 * JSON for inside a <script> element. JSON.stringify alone is NOT safe there: an admin-entered
 * "</script>" would close the element and whatever follows would run in every customer's browser.
 * Escaping <, > and & as < / > / & makes that impossible while leaving the JSON
 * value identical once parsed; U+2028 / U+2029 are escaped because they end a line in older JS.
 */
export function serializeJsonLd(graph: JsonLdGraph): string {
  return JSON.stringify(graph)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
