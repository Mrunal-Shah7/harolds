// SPRINT-18: robots.txt and sitemap.xml content, as pure functions of the SEO snapshot, so the
// sitemap / noindex / robots consistency is a tested property rather than a convention.
//
// The sitemap lists exactly the routes whose resolved metadata is indexable — the same resolver
// the pages use — so "listed in the sitemap" and "marked noindex" cannot disagree.
// lastModified is a real record timestamp, never the build or request time: a sitemap that
// claims every page changed at deploy teaches Google to ignore the field. changefreq and priority
// are omitted; Google ignores both.
import type { MetadataRoute } from "next";
import type { SeoSnapshot } from "@harolds/types";
import { canonicalUrl, resolveRouteMeta } from "./resolve";
import { ROBOTS_ALLOW, ROBOTS_DISALLOW, SEO_ROUTES } from "./routes";

export function buildRobots(snapshot: SeoSnapshot): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: [...ROBOTS_ALLOW], disallow: [...ROBOTS_DISALLOW] }],
    sitemap: canonicalUrl(snapshot.site.canonicalHost, "/sitemap.xml"),
  };
}

function latest(...isoOrDates: Array<string | Date | null | undefined>): Date | undefined {
  const times = isoOrDates
    .filter((d): d is string | Date => d !== null && d !== undefined)
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t) && t > 0);
  return times.length > 0 ? new Date(Math.max(...times)) : undefined;
}

export function buildSitemap(
  snapshot: SeoSnapshot,
  sources: { menuLastModified: Date | null },
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const route of SEO_ROUTES) {
    if (route.path.includes("[")) continue; // a dynamic route needs one entry per record; none exist
    const resolved = resolveRouteMeta(snapshot, route.key);
    if (!resolved.indexable || !resolved.canonicalUrl) continue;
    // What the page shows: its own SEO row, the site defaults (title template, description) and,
    // for both home and menu, the menu itself. The business record is only on the page once it
    // is configured and emitted.
    const lastModified = latest(
      snapshot.routes[route.key]?.updatedAt,
      snapshot.site.updatedAt,
      snapshot.business.isConfigured ? snapshot.business.updatedAt : null,
      sources.menuLastModified,
    );
    entries.push(lastModified ? { url: resolved.canonicalUrl, lastModified } : { url: resolved.canonicalUrl });
  }
  return entries;
}

/** Whether a path is blocked by the robots rules above (longest-match, Allow wins ties). */
export function robotsBlocks(pathname: string): boolean {
  const match = (rules: readonly string[]) =>
    Math.max(-1, ...rules.filter((r) => pathname.startsWith(r)).map((r) => r.length));
  const disallow = match(ROBOTS_DISALLOW);
  const allow = match(ROBOTS_ALLOW);
  return disallow > allow;
}
