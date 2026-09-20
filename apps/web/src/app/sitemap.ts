// SPRINT-18: /sitemap.xml — generated from the database. Indexable routes only; see lib/seo/crawl.ts.
// force-dynamic for the same reason as robots.ts: a build-time prerender is out of the tag's reach.
// The menu read is a single aggregate for lastModified; it never writes.
import type { MetadataRoute } from "next";
import { getMenuLastModified } from "@harolds/db";
import { emitLog } from "@harolds/config";
import { getSeoSnapshot } from "@/lib/seo/data";
import { buildSitemap } from "@/lib/seo/crawl";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const snapshot = await getSeoSnapshot();
  let menuLastModified: Date | null = null;
  try {
    menuLastModified = await getMenuLastModified();
  } catch (err) {
    // Omit the menu's contribution rather than invent a date.
    emitLog("warn", "seo.sitemap.menu_lastmod_unavailable", {
      message: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
  }
  return buildSitemap(snapshot, { menuLastModified });
}
