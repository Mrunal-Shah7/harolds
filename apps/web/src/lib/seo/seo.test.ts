// SPRINT-18: pure SEO tests — validation, the metadata fallback chain, the JSON-LD graph and its
// escaping, robots/sitemap/noindex consistency, the drift detector, and the one-builder rule.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { SeoSnapshot } from "@harolds/types";
import { validateSeoSaveRequest } from "@/lib/seo/validation";
import { canonicalUrl, resolveRouteMeta } from "@/lib/seo/resolve";
import { buildJsonLdGraph, jsonLdForRoute, serializeJsonLd, type JsonLdGraph } from "@/lib/seo/jsonld";
import { buildRobots, buildSitemap, robotsBlocks } from "@/lib/seo/crawl";
import { detectDrift } from "@/lib/seo/drift";
import { ISO_3166_ALPHA2 } from "@/lib/seo/countries";
import { ROBOTS_DISALLOW, SEO_ROUTES } from "@/lib/seo/routes";
import { toNextMetadata } from "@/lib/seo/page";
import { fromSnapshot, previewSnapshot, toRequest } from "@/lib/seo/form";

const HOST = "https://haroldsburnham.com";

/** A fully configured snapshot with plausible TEST values (not the business's real data). */
export function configuredSnapshot(): SeoSnapshot {
  return {
    version: 7,
    business: {
      displayName: "Harold's Chicken Burnham",
      legalName: "Test Legal Name LLC",
      description: "Fried chicken for pickup.",
      streetAddress: "4709 W 95th St",
      addressLocality: "Burnham",
      addressRegion: "IL",
      postalCode: "60453",
      addressCountry: "US",
      telephone: "+17085550123",
      telephoneDisplay: "(708) 555-0123",
      latitude: 41.72,
      longitude: -87.74,
      priceRange: "$",
      servesCuisine: ["American", "Chicken"],
      logoUrl: `${HOST}/logo.jpeg`,
      imageUrl: `${HOST}/hero.jpg`,
      sameAs: ["https://www.facebook.com/example", "https://www.instagram.com/example"],
      isConfigured: true,
      hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, isClosed: false, opens: "10:30", closes: "23:00", overnight: false })),
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    site: {
      siteName: "Harold's Chicken Burnham",
      canonicalHost: HOST,
      defaultTitle: "Harold's Chicken Burnham",
      titleTemplate: "{pageTitle} | Harold's Chicken Burnham",
      defaultDescription: "Order pickup online from Harold's Chicken Burnham.",
      defaultOgImageUrl: null,
      locale: "en_US",
      twitterHandle: null,
      updatedAt: "2026-09-02T00:00:00.000Z",
    },
    routes: {
      menu: { routeKey: "menu", title: "Menu", description: "The full menu.", ogImageUrl: null, breadcrumbLabel: null, noindex: false, updatedAt: "2026-09-03T00:00:00.000Z" },
      checkout: { routeKey: "checkout", title: "Checkout", description: null, ogImageUrl: null, breadcrumbLabel: null, noindex: true, updatedAt: "2026-09-03T00:00:00.000Z" },
    },
  };
}

function saveRequest(snapshot = configuredSnapshot()) {
  const { updatedAt: _b, ...business } = snapshot.business;
  const { updatedAt: _s, canonicalHost: _c, ...site } = snapshot.site;
  void _b;
  void _s;
  void _c;
  return {
    expectedVersion: snapshot.version,
    business: { ...business },
    site: { ...site },
    routes: SEO_ROUTES.map((r) => ({
      routeKey: r.key,
      title: snapshot.routes[r.key]?.title ?? null,
      description: snapshot.routes[r.key]?.description ?? null,
      ogImageUrl: null,
      breadcrumbLabel: null,
      noindex: !r.indexable,
    })),
  };
}

function errorsOf(raw: unknown): Record<string, string> {
  const r = validateSeoSaveRequest(raw);
  return r.ok ? {} : r.errors;
}

/** Every {"@id": x} reference anywhere in the graph, excluding node declarations. */
function references(value: unknown, out: string[] = [], isNode = true): string[] {
  if (Array.isArray(value)) value.forEach((v) => references(v, out, false));
  else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (!isNode && keys.length === 1 && typeof obj["@id"] === "string") out.push(obj["@id"]);
    for (const [k, v] of Object.entries(obj)) if (k !== "@id") references(v, out, false);
  }
  return out;
}

function types(graph: JsonLdGraph): string[] {
  return graph["@graph"].map((n) => n["@type"]);
}

describe("SPRINT-18 validation (Phase 1.5)", () => {
  it("accepts a well-formed configured request", () => {
    const r = validateSeoSaveRequest(saveRequest());
    assert.equal(r.ok, true, JSON.stringify(!r.ok && r.errors));
  });

  it("rejects a malformed phone", () => {
    const req = saveRequest();
    req.business.telephone = "708-555-0123";
    assert.match(errorsOf(req)["business.telephone"] ?? "", /E\.164/);
  });

  it("rejects out-of-range coordinates", () => {
    const req = saveRequest();
    req.business.latitude = 91;
    req.business.longitude = -181;
    const e = errorsOf(req);
    assert.match(e["business.latitude"] ?? "", /-90 and 90/);
    assert.match(e["business.longitude"] ?? "", /-180 and 180/);
  });

  it("rejects a non-https URL in every URL field", () => {
    const req = saveRequest();
    req.business.logoUrl = "http://example.com/logo.png";
    req.business.sameAs = ["https://ok.example.com", "javascript:alert(1)"];
    req.site.defaultOgImageUrl = "/relative.png";
    const e = errorsOf(req);
    assert.ok(e["business.logoUrl"]);
    assert.ok(e["business.sameAs.1"]);
    assert.ok(e["site.defaultOgImageUrl"]);
  });

  it("rejects an inverted hours range, and accepts it when marked overnight", () => {
    const req = saveRequest();
    req.business.hours = [{ dayOfWeek: 5, isClosed: false, opens: "22:00", closes: "02:00", overnight: false }];
    assert.match(errorsOf(req)["business.hours.0.closes"] ?? "", /after opening time/);
    req.business.hours = [{ dayOfWeek: 5, isClosed: false, opens: "22:00", closes: "02:00", overnight: true }];
    assert.deepEqual(errorsOf(req), {});
  });

  it("represents a closed day distinctly from an unset day", () => {
    const req = saveRequest();
    req.business.hours = [{ dayOfWeek: 0, isClosed: true, opens: null, closes: null, overnight: false }];
    const r = validateSeoSaveRequest(req);
    assert.equal(r.ok, true);
    const hours = r.ok ? r.value.business!.hours : [];
    assert.equal(hours.length, 1); // Sunday closed; the other six days unset (no rows)
    assert.equal(hours[0]!.isClosed, true);
    const spec = buildJsonLdGraph({ ...configuredSnapshot(), business: { ...configuredSnapshot().business, hours } }, { url: `${HOST}/`, title: "t", description: "d", imageUrl: null, isHome: true });
    const restaurant = spec["@graph"].find((n) => n["@type"] === "Restaurant")!;
    assert.deepEqual(restaurant.openingHoursSpecification, [{ "@type": "OpeningHoursSpecification", dayOfWeek: "Sunday", opens: "00:00", closes: "00:00" }]);
  });

  it("rejects a day that is both closed and open, and overlapping ranges", () => {
    const req = saveRequest();
    req.business.hours = [
      { dayOfWeek: 1, isClosed: true, opens: null, closes: null, overnight: false },
      { dayOfWeek: 1, isClosed: false, opens: "10:00", closes: "12:00", overnight: false },
      { dayOfWeek: 2, isClosed: false, opens: "10:00", closes: "14:00", overnight: false },
      { dayOfWeek: 2, isClosed: false, opens: "13:00", closes: "18:00", overnight: false },
    ];
    const e = errorsOf(req);
    assert.ok(e["business.hours.0.isClosed"]);
    assert.ok(e["business.hours.3.opens"]);
  });

  it("rejects a non-ISO country", () => {
    const req = saveRequest();
    req.business.addressCountry = "USA";
    assert.ok(errorsOf(req)["business.addressCountry"]);
    assert.equal(ISO_3166_ALPHA2.size, 249);
  });

  it("treats title and description length as warnings, never errors", () => {
    const req = saveRequest();
    req.site.defaultTitle = "T".repeat(90);
    req.site.defaultDescription = "D".repeat(300);
    req.routes[1]!.title = "A very long menu page title that runs well past sixty chars";
    const r = validateSeoSaveRequest(req);
    assert.equal(r.ok, true);
    assert.match(r.warnings["site.defaultTitle"] ?? "", /approximate/);
    assert.match(r.warnings["site.defaultDescription"] ?? "", /pixel width/);
    assert.ok(r.warnings["routes.menu.title"]);
  });

  it("refuses the canonical host from the admin", () => {
    const req = saveRequest() as ReturnType<typeof saveRequest> & { site: Record<string, unknown> };
    req.site.canonicalHost = "https://evil.example.com";
    assert.match(errorsOf(req)["site.canonicalHost"] ?? "", /deployment setting/);
  });

  it("will not mark the business configured while placeholders or no phone remain", () => {
    const req = saveRequest();
    req.business.streetAddress = "PLACEHOLDER street address";
    req.business.servesCuisine = ["PLACEHOLDER cuisine"];
    req.business.telephone = null;
    const e = errorsOf(req);
    assert.ok(e["business.streetAddress"]);
    assert.ok(e["business.servesCuisine.0"]);
    assert.ok(e["business.telephone"]);
    req.business.isConfigured = false; // unconfigured: placeholders and no phone are fine
    assert.deepEqual(errorsOf(req), {});
  });

  it("rejects unknown title-template tokens, a template without {pageTitle}, and indexing a fixed-noindex page", () => {
    const req = saveRequest();
    req.site.titleTemplate = "{price} Chicken";
    req.routes.find((r) => r.routeKey === "order-status")!.noindex = false;
    const e = errorsOf(req);
    assert.ok(e["site.titleTemplate"]);
    assert.match(e["routes.order-status.noindex"] ?? "", /always hidden/);
  });
});

describe("SPRINT-18 metadata fallback chain (Phase 3.1)", () => {
  it("level 1: the override title, through the title template", () => {
    const r = resolveRouteMeta(configuredSnapshot(), "menu");
    assert.equal(r.titleSource, "override");
    assert.equal(r.title, "Menu | Harold's Chicken Burnham");
    assert.equal(r.descriptionSource, "override");
  });

  it("level 2: the dynamic-route template with tokens substituted", () => {
    const r = resolveRouteMeta(configuredSnapshot(), "home", {
      template: { title: "{categoryName} menu", description: "Order {categoryName} for pickup.", tokens: { categoryName: "Wings" } },
    });
    assert.equal(r.titleSource, "template");
    assert.equal(r.title, "Wings menu | Harold's Chicken Burnham");
    assert.equal(r.description, "Order Wings for pickup.");
  });

  it("a template with an unfilled token falls through rather than emitting braces", () => {
    const r = resolveRouteMeta(configuredSnapshot(), "home", { template: { title: "{itemName} — {price}", tokens: { itemName: "Wings" } } });
    assert.equal(r.titleSource, "default");
    assert.doesNotMatch(r.title, /[{}]/);
  });

  it("level 3: the site default, used as-is", () => {
    const r = resolveRouteMeta(configuredSnapshot(), "home");
    assert.equal(r.titleSource, "default");
    assert.equal(r.title, "Harold's Chicken Burnham");
    assert.equal(r.descriptionSource, "default");
  });

  it("all levels empty: the site name, with a warning — never an empty title", () => {
    const s = configuredSnapshot();
    s.site.defaultTitle = "";
    s.routes.menu!.title = "   ";
    const warnings: string[] = [];
    const r = resolveRouteMeta(s, "menu", {}, (event) => warnings.push(event));
    assert.equal(r.titleSource, "siteName");
    assert.equal(r.title, "Harold's Chicken Burnham");
    assert.deepEqual(warnings, ["seo.metadata.title_fallback_to_site_name"]);
    s.site.siteName = "";
    assert.ok(resolveRouteMeta(s, "menu").title.length > 0);
  });

  it("canonical URLs are absolute, on the canonical host, and stable across query strings and slashes", () => {
    assert.equal(canonicalUrl(HOST, "/"), `${HOST}/`);
    assert.equal(canonicalUrl(HOST, "/menu"), `${HOST}/menu`);
    assert.equal(canonicalUrl(HOST, "/menu/"), `${HOST}/menu`);
    assert.equal(canonicalUrl(HOST, "/menu?utm_source=x#cat-1"), `${HOST}/menu`);
    assert.equal(canonicalUrl(`${HOST}/`, "menu"), `${HOST}/menu`);
  });

  it("every indexable route emits title, description, absolute canonical, OG and a large Twitter card", () => {
    const s = configuredSnapshot();
    for (const route of SEO_ROUTES.filter((r) => r.indexable)) {
      const m = toNextMetadata(resolveRouteMeta(s, route.key), s);
      assert.ok((m.title as { absolute: string }).absolute.length > 0, route.key);
      assert.ok(typeof m.description === "string" && m.description.length > 0, route.key);
      assert.match(String(m.alternates?.canonical), /^https:\/\/haroldsburnham\.com\//);
      const og = m.openGraph as Record<string, unknown>;
      for (const key of ["title", "description", "url", "images", "type", "siteName", "locale"]) assert.ok(og[key], `${route.key} og:${key}`);
      assert.equal((m.twitter as { card: string }).card, "summary_large_image");
      assert.deepEqual(m.robots, { index: true, follow: true });
    }
  });

  it("every non-indexable route emits noindex, nofollow and no canonical", () => {
    const s = configuredSnapshot();
    for (const route of SEO_ROUTES.filter((r) => !r.indexable)) {
      s.routes[route.key] = { routeKey: route.key, title: null, description: null, ogImageUrl: null, breadcrumbLabel: null, noindex: false, updatedAt: s.site.updatedAt };
      const m = toNextMetadata(resolveRouteMeta(s, route.key), s);
      assert.deepEqual(m.robots, { index: false, follow: false }, route.key);
      assert.equal(m.alternates, undefined);
      assert.equal(jsonLdForRoute(s, resolveRouteMeta(s, route.key)), null);
    }
  });
});

describe("SPRINT-18 JSON-LD graph (Phase 2)", () => {
  const page = (s: SeoSnapshot, key: string) => jsonLdForRoute(s, resolveRouteMeta(s, key))!;

  it("isConfigured=false: no Restaurant node and no reference to one", () => {
    const s = configuredSnapshot();
    s.business.isConfigured = false;
    const omitted: string[] = [];
    const g = jsonLdForRoute(s, resolveRouteMeta(s, "home"), (node, reason) => omitted.push(`${node}: ${reason}`))!;
    assert.deepEqual(types(g), ["WebSite", "WebPage"]);
    assert.doesNotMatch(JSON.stringify(g), /#restaurant/);
    assert.match(omitted[0] ?? "", /^Restaurant: isConfigured is false/);
  });

  it("isConfigured=true with fields populated: Restaurant, WebSite and WebPage, cross-referenced", () => {
    const g = page(configuredSnapshot(), "home");
    assert.deepEqual(types(g), ["Restaurant", "WebSite", "WebPage"]);
    const [restaurant, website, webpage] = g["@graph"];
    assert.equal(restaurant!["@id"], `${HOST}/#restaurant`);
    assert.equal(website!["@id"], `${HOST}/#website`);
    assert.equal(webpage!["@id"], `${HOST}/#webpage`);
    assert.deepEqual(website!.publisher, { "@id": `${HOST}/#restaurant` });
    assert.deepEqual(webpage!.about, { "@id": `${HOST}/#restaurant` });
    assert.equal(restaurant!.acceptsReservations, false);
    assert.equal(restaurant!.hasMenu, `${HOST}/menu`);
    assert.equal((restaurant!.address as Record<string, string>)["@type"], "PostalAddress");
    assert.equal((restaurant!.geo as Record<string, string>)["@type"], "GeoCoordinates");
    assert.ok(!types(g).includes("Organization") && !types(g).includes("LocalBusiness"));
    assert.doesNotMatch(JSON.stringify(g), /SearchAction/);
  });

  it("every @id reference resolves to a node in the same graph, on every indexable route, both states", () => {
    for (const configured of [true, false]) {
      const s = configuredSnapshot();
      s.business.isConfigured = configured;
      for (const route of SEO_ROUTES.filter((r) => r.indexable)) {
        const g = page(s, route.key);
        const declared = new Set(g["@graph"].map((n) => n["@id"]));
        for (const ref of references(g["@graph"])) assert.ok(declared.has(ref), `${route.key}: dangling ${ref}`);
      }
    }
  });

  it("no BreadcrumbList on the homepage; a real trail elsewhere is 1-indexed and contiguous", () => {
    const s = configuredSnapshot();
    const trail = [{ name: "Home", url: `${HOST}/` }, { name: "Menu", url: `${HOST}/menu` }, { name: "Wings", url: `${HOST}/menu/wings` }];
    const home = buildJsonLdGraph(s, { url: `${HOST}/`, title: "t", description: "", imageUrl: null, isHome: true, breadcrumb: trail });
    assert.ok(!types(home).includes("BreadcrumbList"));
    const cat = buildJsonLdGraph(s, { url: `${HOST}/menu/wings`, title: "t", description: "", imageUrl: null, isHome: false, breadcrumb: trail });
    const crumb = cat["@graph"].find((n) => n["@type"] === "BreadcrumbList")!;
    assert.deepEqual((crumb.itemListElement as Array<{ position: number }>).map((i) => i.position), [1, 2, 3]);
    // Real routes today pass no trail, so no page emits one.
    for (const route of SEO_ROUTES.filter((r) => r.indexable)) assert.ok(!types(page(s, route.key)).includes("BreadcrumbList"));
  });

  it("a missing required field omits the Restaurant node and logs why", () => {
    const s = configuredSnapshot();
    s.business.telephone = null;
    s.business.postalCode = " ";
    const omitted: Array<[string, string]> = [];
    const g = buildJsonLdGraph(s, { url: `${HOST}/`, title: "t", description: "", imageUrl: null, isHome: true }, (n, r) => omitted.push([n, r]));
    assert.ok(!types(g).includes("Restaurant"));
    assert.deepEqual(omitted[0], ["Restaurant", "missing required value(s): postalCode, telephone"]);
  });

  it("a placeholder marked configured by hand in the database is still never published", () => {
    const s = configuredSnapshot();
    s.business.streetAddress = "PLACEHOLDER street address";
    assert.ok(!types(page(s, "home")).includes("Restaurant"));
  });

  it("serialisation escapes <, >, &, U+2028 and U+2029 and round-trips exactly", () => {
    const s = configuredSnapshot();
    // Separators mid-string: the builder trims, and trim() treats U+2028/U+2029 as whitespace.
    const nasty = `</script><script>alert(1)</script> & a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c`;
    s.business.description = nasty;
    const json = serializeJsonLd(page(s, "home"));
    assert.doesNotMatch(json, /[<>&]/);
    assert.ok(!json.includes(String.fromCharCode(0x2028)) && !json.includes(String.fromCharCode(0x2029)));
    assert.ok(json.includes("\\u003c/script\\u003e"));
    const parsed = JSON.parse(json) as JsonLdGraph;
    assert.equal(parsed["@graph"][0]!.description, nasty);
  });
});

describe("SPRINT-18 robots.txt and sitemap.xml (Phase 4)", () => {
  it("robots.txt references the sitemap absolutely and blocks exactly the non-indexable paths", () => {
    const robots = buildRobots(configuredSnapshot());
    assert.equal(robots.sitemap, `${HOST}/sitemap.xml`);
    const rule = (Array.isArray(robots.rules) ? robots.rules[0] : robots.rules)!;
    assert.deepEqual(rule.disallow, ["/checkout", "/cart", "/order", "/api/", "/admin", "/kitchen", "/design-system"]);
    for (const p of ["/checkout", "/cart", "/order/abc123", "/admin", "/admin/seo", "/kitchen", "/api/v1/menu", "/api/internal/admin/seo", "/design-system"]) {
      assert.equal(robotsBlocks(p), true, p);
    }
  });

  it("nothing blocks the storefront, the menu, or the menu's photographs", () => {
    for (const p of ["/", "/menu", "/api/v1/media/abc/card", "/logo.jpeg", "/sitemap.xml"]) assert.equal(robotsBlocks(p), false, p);
    assert.ok(!ROBOTS_DISALLOW.includes("/"));
  });

  it("sitemap/noindex walk: every sitemap URL is indexable and unblocked; every noindex route is absent", () => {
    for (const noindexMenu of [false, true]) {
      const s = configuredSnapshot();
      s.routes.menu!.noindex = noindexMenu;
      const urls = buildSitemap(s, { menuLastModified: new Date("2026-09-05T00:00:00Z") }).map((e) => e.url);
      for (const route of SEO_ROUTES) {
        const r = resolveRouteMeta(s, route.key);
        const listed = urls.includes(r.url);
        if (r.indexable && !route.path.includes("[")) assert.ok(listed, `${route.key} missing`);
        if (!r.indexable) assert.ok(!listed, `${route.key} is noindex but listed`);
        if (listed) {
          assert.deepEqual(toNextMetadata(r, s).robots, { index: true, follow: true });
          assert.equal(robotsBlocks(new URL(r.url).pathname), false);
        }
      }
      assert.deepEqual(urls, noindexMenu ? [`${HOST}/`] : [`${HOST}/`, `${HOST}/menu`]);
    }
  });

  it("sitemap entries satisfy the sitemaps.org 0.9 constraints", () => {
    // Structural validation of what Next will serialise: absolute http(s) URLs on the canonical
    // host, under 2048 characters, unique, each with a lastModified that is a real date. The
    // served XML's element structure is checked against the same rules by the end-to-end script.
    const s = configuredSnapshot();
    const entries = buildSitemap(s, { menuLastModified: new Date("2026-09-05T00:00:00Z") });
    assert.ok(entries.length > 0 && entries.length <= 50_000);
    const seen = new Set<string>();
    for (const entry of entries) {
      const url = new URL(entry.url);
      assert.match(url.protocol, /^https?:$/);
      assert.equal(url.origin, new URL(s.site.canonicalHost).origin);
      assert.ok(entry.url.length < 2048);
      assert.equal(url.search, "");
      assert.equal(url.hash, "");
      assert.ok(!seen.has(entry.url), `duplicate ${entry.url}`);
      seen.add(entry.url);
      const lastmod = new Date(entry.lastModified as Date);
      assert.ok(!Number.isNaN(lastmod.getTime()));
      assert.ok(lastmod.getTime() <= Date.now());
      assert.match(lastmod.toISOString(), /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/); // W3C datetime
      assert.deepEqual(Object.keys(entry).sort(), ["lastModified", "url"]); // no changefreq/priority
    }
  });

  it("lastModified is the latest real record timestamp, never the current time", () => {
    const s = configuredSnapshot();
    const map = new Map(buildSitemap(s, { menuLastModified: new Date("2026-09-10T12:00:00Z") }).map((e) => [e.url, e.lastModified]));
    assert.deepEqual(map.get(`${HOST}/`), new Date("2026-09-10T12:00:00Z"));
    const noMenu = new Map(buildSitemap(s, { menuLastModified: null }).map((e) => [e.url, e.lastModified]));
    assert.deepEqual(noMenu.get(`${HOST}/menu`), new Date("2026-09-03T00:00:00.000Z"));
    s.business.isConfigured = false;
    s.business.updatedAt = "2030-01-01T00:00:00.000Z"; // an unpublished record is not on the page
    const unconfigured = new Map(buildSitemap(s, { menuLastModified: null }).map((e) => [e.url, e.lastModified]));
    assert.deepEqual(unconfigured.get(`${HOST}/`), new Date("2026-09-02T00:00:00.000Z"));
  });
});

describe("SPRINT-18 admin form logic (Phase 5.2, 5.3)", () => {
  it("round trip: loading a snapshot into the form and back yields the same save body", () => {
    // If this fails the save bar shows "unsaved changes" the moment the screen loads, and a save
    // the operator never intended rewrites values.
    const snapshot = configuredSnapshot();
    const loaded = toRequest(fromSnapshot(snapshot, SEO_ROUTES), snapshot.version, SEO_ROUTES);
    assert.deepEqual(loaded, saveRequest(snapshot));
    assert.equal(validateSeoSaveRequest(loaded).ok, true);
  });

  it("round trip preserves unset, closed, multi-range and overnight days distinctly", () => {
    const snapshot = configuredSnapshot();
    snapshot.business.hours = [
      { dayOfWeek: 1, isClosed: true, opens: null, closes: null, overnight: false },
      { dayOfWeek: 2, isClosed: false, opens: "11:00", closes: "14:00", overnight: false },
      { dayOfWeek: 2, isClosed: false, opens: "17:00", closes: "22:00", overnight: false },
      { dayOfWeek: 5, isClosed: false, opens: "18:00", closes: "02:00", overnight: true },
      // Sunday, Wednesday, Thursday and Saturday are unset and must stay unset.
    ];
    const form = fromSnapshot(snapshot, SEO_ROUTES);
    assert.deepEqual(
      form.business.days.map((d) => d.mode),
      ["unset", "closed", "open", "unset", "unset", "open", "unset"],
    );
    const back = toRequest(form, snapshot.version, SEO_ROUTES).business.hours;
    assert.deepEqual(back, snapshot.business.hours);
    assert.deepEqual(errorsOf(toRequest(form, snapshot.version, SEO_ROUTES)), {});
  });

  it("preview fidelity: the preview renders unsaved form state through the storefront's own code", () => {
    const saved = configuredSnapshot();
    const form = fromSnapshot(saved, SEO_ROUTES);
    // An unsaved edit the server has never seen.
    form.business.displayName = "Edited But Not Saved";
    form.routes.menu!.title = "Unsaved menu title";
    const preview = previewSnapshot(form, saved, SEO_ROUTES);

    assert.equal(preview.site.canonicalHost, saved.site.canonicalHost); // never editable
    const resolved = resolveRouteMeta(preview, "menu");
    assert.equal(resolved.title, "Unsaved menu title | Harold's Chicken Burnham");
    const graph = jsonLdForRoute(preview, resolved)!;
    assert.equal(graph["@graph"].find((n) => n["@type"] === "Restaurant")!.name, "Edited But Not Saved");

    // And what the preview shows is exactly what the storefront emits for that same data, so the
    // preview cannot drift from the page.
    const asIfSaved: SeoSnapshot = { ...preview, version: saved.version + 1 };
    assert.deepEqual(jsonLdForRoute(asIfSaved, resolveRouteMeta(asIfSaved, "menu")), graph);
  });

  it("a form built from the seeded placeholder record is valid to save while unconfigured", () => {
    const seeded = configuredSnapshot();
    seeded.business = {
      ...seeded.business,
      displayName: "PLACEHOLDER business name",
      description: "PLACEHOLDER description",
      streetAddress: "PLACEHOLDER street address",
      addressLocality: "PLACEHOLDER city",
      addressRegion: "PLACEHOLDER state",
      postalCode: "PLACEHOLDER ZIP",
      telephone: null,
      latitude: null,
      longitude: null,
      logoUrl: null,
      imageUrl: null,
      sameAs: [],
      servesCuisine: ["PLACEHOLDER cuisine"],
      isConfigured: false,
      hours: [],
    };
    const request = toRequest(fromSnapshot(seeded, SEO_ROUTES), seeded.version, SEO_ROUTES);
    assert.deepEqual(errorsOf(request), {});
  });
});

describe("SPRINT-18 drift detector (Phase 5.2)", () => {
  const store = {
    addressLine1: "4709 W 95th St",
    addressLine2: null,
    city: "Burnham",
    state: "IL",
    postalCode: "60453-2515",
    contactPhone: "(708) 555-0123",
    contactPhoneE164: "+17085550123",
    hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, openTime: "10:30", closeTime: "23:00", isClosed: false })),
  };

  it("reports agreement when the records match (formatting and ZIP+4 forgiven)", () => {
    const b = configuredSnapshot().business;
    b.streetAddress = "4709 W. 95th St.";
    const report = detectDrift(b, store);
    assert.equal(report.inAgreement, true, JSON.stringify(report.differences));
  });

  it("names every differing field with both values, for a seeded disagreement in address, phone and hours", () => {
    const b = configuredSnapshot().business;
    b.streetAddress = "PLACEHOLDER street address";
    b.telephone = null;
    b.hours = [{ dayOfWeek: 1, isClosed: false, opens: "11:00", closes: "22:00", overnight: false }, { dayOfWeek: 2, isClosed: true, opens: null, closes: null, overnight: false }];
    const report = detectDrift(b, { ...store, contactPhoneE164: null, contactPhone: "TODO: CONFIRM PHONE" });
    const byField = Object.fromEntries(report.differences.map((d) => [d.field, d]));
    assert.equal(byField.streetAddress?.store, "4709 W 95th St");
    assert.equal(byField.streetAddress?.seo, "PLACEHOLDER street address");
    assert.equal(byField.telephone?.store, "TODO: CONFIRM PHONE (not a valid phone number)");
    assert.equal(byField["hours.1"]?.seo, "11:00–22:00");
    assert.equal(byField["hours.1"]?.store, "10:30–23:00");
    assert.equal(byField["hours.2"]?.seo, "Closed");
    assert.equal(byField["hours.0"]?.seo, "Not set");
    assert.equal(report.inAgreement, false);
  });
});

describe("SPRINT-18 single-boundary rules (Critical rule 5, Phase 6.1)", () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
  const roots = ["apps/web/src", "packages"].map((r) => path.join(repo, r));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "generated" || name.startsWith(".")) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(full);
    }
  };
  roots.forEach(walk);
  const rel = (f: string) => path.relative(repo, f).split(path.sep).join("/");

  it("exactly one module constructs schema.org nodes", () => {
    const builders = files.filter((f) => /"@context"|["']@type["']\s*:/.test(readFileSync(f, "utf8"))).map(rel);
    assert.deepEqual(builders, ["apps/web/src/lib/seo/jsonld.ts"]);
    const scripts = files.filter((f) => /application\/ld\+json/.test(readFileSync(f, "utf8"))).map(rel);
    assert.deepEqual(scripts, ["apps/web/src/components/seo/json-ld.tsx"]);
  });

  it("storefront code reads SEO state only through the tagged accessor", () => {
    const readers = files
      .filter((f) => /\b(loadSeoSnapshot|seoBusiness|seoSiteDefaults|seoRouteOverride|seoOpeningHours)\b/.test(readFileSync(f, "utf8")))
      .map(rel)
      .sort();
    assert.deepEqual(readers, [
      "apps/web/src/app/(api)/api/internal/admin/seo/route.ts", // the admin editor: authoritative, uncached
      "apps/web/src/lib/seo/data.ts", // THE cached accessor
      "packages/db/src/index.ts",
      "packages/db/src/seo.ts",
    ]);
  });
});
