// SPRINT-18: renders the one JSON-LD <script> for a storefront route. It assembles nothing —
// the graph comes from lib/seo/jsonld.ts and arrives already escaped for a <script> element
// (serializeJsonLd), which is the only reason dangerouslySetInnerHTML is acceptable here.
import { routeJsonLd } from "@/lib/seo/page";

export async function JsonLdScript({ routeKey }: { routeKey: string }) {
  const json = await routeJsonLd(routeKey);
  if (!json) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
