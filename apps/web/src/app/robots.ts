// SPRINT-18: /robots.txt — generated, because it names the canonical host, which is configuration.
// force-dynamic: Next would otherwise prerender this file at BUILD time, a cache the `seo` tag
// cannot reach. Dynamic, the only cache in front of it is the tagged SEO accessor.
import type { MetadataRoute } from "next";
import { getSeoSnapshot } from "@/lib/seo/data";
import { buildRobots } from "@/lib/seo/crawl";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  return buildRobots(await getSeoSnapshot());
}
