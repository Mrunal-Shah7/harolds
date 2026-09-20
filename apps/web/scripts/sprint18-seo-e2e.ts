// SPRINT-18: end-to-end SEO verification against a RUNNING production build (`next start` on
// :3000, local database). Not part of `pnpm test` — it needs the server. It signs in as the seeded
// test owner and manager, drives the real admin API, fetches the rendered storefront as a crawler
// would, and writes a report. Every SEO row it changes is restored at the end and the audit rows
// it wrote are removed, after being printed.
//
//   pnpm --filter @harolds/web exec tsx --env-file=../../.env scripts/sprint18-seo-e2e.ts <report.md>
/* eslint-disable @typescript-eslint/no-explicit-any -- walks untyped JSON API responses and parsed JSON-LD; a test harness, not app code */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@harolds/db";

const BASE = "http://localhost:3000";
const HOST = "https://haroldsburnham.com";
// Next 15 STREAMS generateMetadata output to any client that supports it — including Googlebot,
// which renders the page and hoists it. Only "HTML-limited" bots (Twitterbot, facebookexternalhit,
// Slurp) get metadata blocking inside <head>. Proofs that read <head> therefore use one of those;
// the placement difference by user agent is reported explicitly at the end of the run.
const CRAWLER = "Twitterbot/1.0";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const INJECTION = "</script><script>alert(1)</script>";
// Seeded development accounts (packages/db/src/seed/run.ts). Never present in production.
const OWNER = { email: "test-owner@localhost", password: "HaroldsOwner1!" };
const MANAGER = { email: "test-manager@localhost", password: "HaroldsManager1!" };

const report: string[] = [];
let outDir = ".";
const log = (s = "") => {
  report.push(s);
  console.log(s);
};
const block = (lang: string, body: string) => log(`\`\`\`${lang}\n${body}\n\`\`\``);

async function signIn(who: { email: string; password: string }): Promise<string> {
  const res = await fetch(`${BASE}/api/internal/admin/auth/signin`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify(who),
  });
  assert.equal(res.status, 200, `sign-in ${who.email}: ${res.status} ${await res.clone().text()}`);
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith("harolds_admin="));
  assert.ok(cookie, "no admin cookie");
  return cookie.split(";")[0]!;
}

async function api(cookie: string | null, method: string, body?: unknown) {
  const res = await fetch(`${BASE}/api/internal/admin/seo`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json", origin: BASE },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, any> | null };
}

async function page(path: string, ua = CRAWLER) {
  const res = await fetch(`${BASE}${path}`, { headers: { "user-agent": ua }, redirect: "manual" });
  return { status: res.status, html: await res.text() };
}

function head(html: string): string {
  const h = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? "";
  return h
    .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "")
    .replace(/<link rel="(?:preload|stylesheet|modulepreload|icon|apple-touch-icon)"[^>]*\/?>/g, "")
    .replace(/<meta name="(?:viewport|theme-color|next-size-adjust)"[^>]*\/?>|<meta charSet="utf-8"\/>/g, "")
    .replace(/></g, ">\n<")
    .trim();
}

const meta = (html: string, re: RegExp) => html.match(re)?.[1] ?? null;
const titleOf = (html: string) => meta(html, /<title>([^<]*)<\/title>/);
const robotsOf = (html: string) => meta(html, /<meta name="robots" content="([^"]*)"/);
const canonicalOf = (html: string) => meta(html, /<link rel="canonical" href="([^"]*)"/);
// Next strips the trailing slash from the ROOT canonical (it renders "https://host", not
// "https://host/"). Both denote the same resource — an empty path normalises to "/" per RFC 3986,
// which is exactly what new URL() does — so URLs are compared normalised, never as raw strings.
const sameUrl = (a: string | null, b: string | null) => a !== null && b !== null && new URL(a).href === new URL(b).href;
function jsonLdBlocks(html: string): string[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
}
function graphOf(html: string): { "@graph": Array<Record<string, any>> } | null {
  const blocks = jsonLdBlocks(html);
  assert.ok(blocks.length <= 1, "more than one JSON-LD block");
  return blocks[0] ? JSON.parse(blocks[0]) : null;
}
const typesOf = (html: string) => graphOf(html)?.["@graph"].map((n) => n["@type"]) ?? [];

async function fetchText(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { "user-agent": CRAWLER } });
  return { status: res.status, text: await res.text() };
}
const sitemapLocs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
const sitemapLastmod = (xml: string, loc: string) =>
  xml.match(new RegExp(`<loc>${loc.replace(/[/.]/g, "\\$&")}</loc>\\s*<lastmod>([^<]+)</lastmod>`))?.[1] ?? null;

function saveBody(view: Record<string, any>) {
  const s = view.snapshot;
  const { updatedAt: _b, ...business } = s.business;
  const { updatedAt: _s, canonicalHost: _c, ...site } = s.site;
  void _b;
  void _s;
  void _c;
  return {
    expectedVersion: s.version,
    business: { ...business },
    site: { ...site },
    routes: view.routes.map((r: { key: string; indexable: boolean }) => ({
      routeKey: r.key,
      title: s.routes[r.key]?.title ?? null,
      description: s.routes[r.key]?.description ?? null,
      ogImageUrl: s.routes[r.key]?.ogImageUrl ?? null,
      breadcrumbLabel: s.routes[r.key]?.breadcrumbLabel ?? null,
      noindex: r.indexable ? (s.routes[r.key]?.noindex ?? false) : true,
    })),
  };
}

/**
 * This script REWRITES the SEO settings and deletes audit rows. It must never be pointed at a
 * production database. Same refusal idiom as the seed (`describeSeedRefusal`): production is
 * refused outright, and so is any database that already holds orders — a real store's database —
 * unless the caller says explicitly that it means this one.
 */
function describeRefusal(nodeEnv: string, orderCount: number, allowExistingOrders: boolean): string | null {
  if (nodeEnv === "production") {
    return [
      "Refusing to run the Sprint 18 SEO end-to-end script against a production database.",
      "It rewrites the SEO business record, site defaults and page overrides, and deletes SEO audit rows.",
      "Run it against a development database with a local `next start`.",
    ].join("\n");
  }
  if (orderCount > 0 && !allowExistingOrders) {
    return [
      `Refusing to run against a database that already contains ${orderCount} order(s).`,
      "Pass --allow-existing-orders if this really is a development database you want rewritten.",
    ].join("\n");
  }
  return null;
}

async function main() {
  const out = process.argv[2] ?? "sprint18-e2e-report.md";
  outDir = path.dirname(path.resolve(out));

  const refusal = describeRefusal(
    process.env.NODE_ENV ?? "development",
    await prisma.order.count(),
    process.argv.includes("--allow-existing-orders"),
  );
  if (refusal) {
    console.error(refusal);
    await prisma.$disconnect();
    process.exit(1);
  }

  const startedAt = new Date(Date.now() - 1000);
  const original = {
    business: (await prisma.seoBusiness.findUnique({ where: { id: "default" } }))!,
    hours: await prisma.seoOpeningHours.findMany(),
    site: (await prisma.seoSiteDefaults.findUnique({ where: { id: "default" } }))!,
    routes: await prisma.seoRouteOverride.findMany(),
  };
  let failed: unknown = null;
  try {
    await run();
  } catch (err) {
    failed = err;
    log(`\n**FAILED:** ${err instanceof Error ? err.stack : String(err)}`);
  } finally {
    const audits = await prisma.adminAuditLog.findMany({
      where: { action: "SEO_UPDATE", createdAt: { gte: startedAt } },
      include: { user: { select: { email: true, role: true } } },
      orderBy: { createdAt: "asc" },
    });
    log(`\n## Audit rows written during this run (${audits.length}), then removed`);
    block(
      "text",
      audits
        .map((a) => `${a.createdAt.toISOString()}  ${a.user?.email ?? "(no actor)"} [${a.user?.role ?? "-"}]  ${a.entityType}/${a.entityId}  ${a.summary}  ${JSON.stringify((a.details as Record<string, unknown>)?.after)?.slice(0, 80)}`)
        .join("\n"),
    );
    await prisma.$transaction([
      prisma.seoOpeningHours.deleteMany({}),
      prisma.seoBusiness.update({ where: { id: "default" }, data: { ...original.business, id: undefined } }),
      prisma.seoOpeningHours.createMany({ data: original.hours }),
      prisma.seoSiteDefaults.update({ where: { id: "default" }, data: { ...original.site, id: undefined, version: { increment: 0 } } }),
      prisma.seoRouteOverride.deleteMany({}),
      prisma.seoRouteOverride.createMany({ data: original.routes }),
      prisma.adminAuditLog.deleteMany({ where: { action: "SEO_UPDATE", createdAt: { gte: startedAt } } }),
    ]);
    // Bump past anything the run produced and revalidate, so the running server stops serving
    // test data too: one no-content save through the real path would be a no-op, so bump by hand.
    const owner = await signIn(OWNER);
    const view = (await api(owner, "GET")).json!.data;
    const body = saveBody(view);
    body.site.twitterHandle = "@restore_probe";
    await api(owner, "PUT", body);
    body.expectedVersion += 1;
    body.site.twitterHandle = original.site.twitterHandle;
    await api(owner, "PUT", body);
    await prisma.adminAuditLog.deleteMany({ where: { action: "SEO_UPDATE", createdAt: { gte: startedAt } } });
    log(`\nSEO rows restored to their pre-run values (version now ${(await prisma.seoSiteDefaults.findUnique({ where: { id: "default" } }))!.version}).`);
    writeFileSync(out, report.join("\n"));
    await prisma.$disconnect();
    if (failed) process.exit(1);
  }
}

async function run() {
  log("# Sprint 18 — end-to-end SEO verification");
  log(`Run at ${new Date().toISOString()} against ${BASE} (production build, local database).`);

  // ── Role gating ──────────────────────────────────────────────────────────────────────────
  log("\n## Role gating (Phase 5 gate 1)");
  const anon = await api(null, "GET");
  const manager = await signIn(MANAGER);
  const mGet = await api(manager, "GET");
  const mPut = await api(manager, "PUT", { expectedVersion: 1, site: {} });
  const owner = await signIn(OWNER);
  const oGet = await api(owner, "GET");
  block(
    "text",
    [
      `no session  GET /api/internal/admin/seo -> ${anon.status} ${anon.json?.error?.code}`,
      `MANAGER     GET /api/internal/admin/seo -> ${mGet.status} ${mGet.json?.error?.code}: ${mGet.json?.error?.message}`,
      `MANAGER     PUT /api/internal/admin/seo -> ${mPut.status} ${mPut.json?.error?.code}`,
      `OWNER       GET /api/internal/admin/seo -> ${oGet.status}`,
    ].join("\n"),
  );
  assert.equal(anon.status, 401);
  assert.equal(mGet.status, 403);
  assert.equal(mPut.status, 403);
  assert.equal(oGet.status, 200);
  let view = oGet.json!.data;

  // ── Unconfigured state ───────────────────────────────────────────────────────────────────
  log("\n## isConfigured = false (seeded placeholders)");
  assert.equal(view.snapshot.business.isConfigured, false);
  for (const p of ["/", "/menu"]) {
    const { status, html } = await page(p);
    assert.equal(status, 200);
    assert.ok(!typesOf(html).includes("Restaurant"), `${p} has a Restaurant node while unconfigured`);
    assert.doesNotMatch(html, /PLACEHOLDER/, `${p} leaked placeholder text`);
    log(`\n### ${p} — rendered @graph (no Restaurant node; no PLACEHOLDER text anywhere in the HTML)`);
    block("json", JSON.stringify(graphOf(html), null, 2));
  }

  log("\n## Drift panel data against the seeded disagreement (Phase 5 gate 5)");
  block("text", view.drift.rows.map((r: any) => `${r.agrees ? "agrees " : "DIFFERS"}  ${r.label.padEnd(18)} SEO: ${r.seo.padEnd(28)} Store: ${r.store}`).join("\n"));
  const differing = view.drift.differences.map((d: any) => d.field);
  for (const f of ["streetAddress", "telephone", "hours.0"]) assert.ok(differing.includes(f), `drift missed ${f}`);
  log("No sync action exists in the API or the UI: the route exposes GET and PUT of the SEO record only.");

  // ── Non-indexable routes ─────────────────────────────────────────────────────────────────
  log("\n## Non-indexable routes, rendered (Phase 3 gate 2)");
  const lookup = await prisma.order.findFirst({ select: { lookupToken: true }, orderBy: { createdAt: "desc" } });
  const orderPath = `/order/${lookup?.lookupToken ?? "no-orders-locally"}`;
  const rows: string[] = [];
  for (const p of ["/checkout", orderPath, "/kitchen", "/admin", "/admin/signin", "/admin/seo"]) {
    const { status, html } = await page(p);
    const robots = robotsOf(html);
    rows.push(`${p.padEnd(40)} ${status}  <meta name="robots" content="${robots}">  title="${titleOf(html)}"  json-ld=${jsonLdBlocks(html).length}`);
    assert.equal(robots, "noindex, nofollow", p);
    assert.equal(jsonLdBlocks(html).length, 0, p);
  }
  block("text", rows.join("\n"));

  // ── robots.txt / sitemap.xml ─────────────────────────────────────────────────────────────
  log("\n## robots.txt (Phase 4)");
  const robotsTxt = await fetchText("/robots.txt");
  assert.equal(robotsTxt.status, 200);
  block("text", robotsTxt.text.trim());
  log("\n## sitemap.xml (Phase 4)");
  const sitemap = await fetchText("/sitemap.xml");
  assert.equal(sitemap.status, 200);
  block("xml", sitemap.text.trim());
  log("\n### sitemaps.org 0.9 structural validation of the served XML");
  const xml = sitemap.text.trim();
  const structural: string[] = [];
  const check = (ok: boolean, what: string) => {
    structural.push(`${ok ? "ok  " : "FAIL"}  ${what}`);
    assert.ok(ok, what);
  };
  check(/^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(xml), "XML declaration, UTF-8");
  check(xml.includes(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`), "root <urlset> with the 0.9 namespace");
  check(xml.trimEnd().endsWith("</urlset>"), "closed </urlset>");
  const urlBlocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]!);
  check(urlBlocks.length === sitemapLocs(xml).length, `every <url> has exactly one <loc> (${urlBlocks.length})`);
  check(urlBlocks.length > 0 && urlBlocks.length <= 50000, "between 1 and 50,000 <url> entries");
  check(new Blob([xml]).size < 52_428_800, "uncompressed size under 50 MB");
  const allowedChildren = urlBlocks.every((b) => (b.match(/<([a-z]+)>/g) ?? []).every((t) => ["<loc>", "<lastmod>"].includes(t)));
  check(allowedChildren, "no foreign or unexpected child elements (only loc, lastmod)");
  check(
    sitemapLocs(xml).every((l) => l.length < 2048 && /^https?:\/\//.test(l) && !/[<>"&']/.test(l)),
    "every <loc> is absolute, under 2048 chars, and XML-safe",
  );
  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]!);
  check(
    lastmods.every((d) => /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(d) && !Number.isNaN(Date.parse(d))),
    `every <lastmod> is a W3C datetime (${lastmods.length} checked)`,
  );
  check(!/<changefreq>|<priority>/.test(xml), "no <changefreq> or <priority> (Google ignores both)");
  block("text", structural.join("\n"));

  log("\n### Sitemap / noindex consistency walk");
  const disallow = [...robotsTxt.text.matchAll(/^Disallow: (.+)$/gm)].map((m) => m[1]!.trim());
  const allow = [...robotsTxt.text.matchAll(/^Allow: (.+)$/gm)].map((m) => m[1]!.trim());
  const blocked = (p: string) => {
    const len = (rules: string[]) => Math.max(-1, ...rules.filter((r) => p.startsWith(r)).map((r) => r.length));
    return len(disallow) > len(allow);
  };
  const walk: string[] = [];
  for (const loc of sitemapLocs(sitemap.text)) {
    assert.ok(loc.startsWith(`${HOST}/`), `sitemap URL not on canonical host: ${loc}`);
    const path = new URL(loc).pathname;
    const { status, html } = await page(path);
    walk.push(`sitemap ${loc} -> local ${path}: ${status}, robots="${robotsOf(html)}", canonical=${canonicalOf(html)} (same URL: ${sameUrl(canonicalOf(html), loc)}), blocked-by-robots=${blocked(path)}`);
    assert.equal(status, 200);
    assert.equal(robotsOf(html), "index, follow");
    assert.ok(sameUrl(canonicalOf(html), loc), `canonical ${canonicalOf(html)} vs sitemap ${loc}`);
    assert.equal(blocked(path), false);
  }
  for (const p of ["/checkout", orderPath, "/kitchen", "/admin", "/cart"]) {
    walk.push(`noindex/private ${p}: in sitemap=${sitemapLocs(sitemap.text).some((l) => new URL(l).pathname === p)}, blocked-by-robots=${blocked(p)}`);
    assert.equal(blocked(p), true, p);
  }
  block("text", walk.join("\n"));

  // ── Configure + injection ────────────────────────────────────────────────────────────────
  log("\n## Configure the business with TEST values, description carrying a script-injection payload");
  let body = saveBody(view);
  Object.assign(body.business, {
    displayName: "Harold's Chicken Burnham",
    legalName: "E2E Test Legal Name LLC",
    description: `Fried chicken for pickup. ${INJECTION}`,
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
    imageUrl: null,
    sameAs: ["https://www.facebook.com/e2e-test-profile"],
    isConfigured: true,
    hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, isClosed: false, opens: "10:30", closes: "23:00", overnight: false })),
  });
  log(`Submitted business.description: \`${body.business.description}\``);
  let saved = await api(owner, "PUT", body);
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  log(`PUT -> ${saved.status}; live=${saved.json!.data.live}; changed: ${saved.json!.data.changedFields.join(", ")}`);
  view = saved.json!.data;

  const home = await page("/");
  const scripts = [...home.html.matchAll(/<script\b[^>]*>/g)].length;
  const rawClose = home.html.includes(INJECTION);
  const alertScript = /<script>alert\(1\)<\/script>/.test(home.html);
  const ld = jsonLdBlocks(home.html)[0]!;
  const restaurant = graphOf(home.html)!["@graph"].find((n) => n["@type"] === "Restaurant")!;
  log("\n### What rendered (Phase 2 gate 6)");
  block(
    "text",
    [
      `JSON-LD blocks on /: ${jsonLdBlocks(home.html).length}`,
      `raw payload present in HTML: ${rawClose}`,
      `an executable <script>alert(1)</script> present: ${alertScript}`,
      `description as serialised inside the ld+json script: ${ld.match(/"description":"([^"]*alert[^"]*)"/)?.[1]}`,
      `description after JSON.parse: ${restaurant.description}`,
      `total <script> tags on the page: ${scripts}`,
    ].join("\n"),
  );
  assert.equal(rawClose, false);
  assert.equal(alertScript, false);
  assert.equal(restaurant.description, body.business.description);

  log("\n## isConfigured = true — the rendered @graph in full");
  for (const p of ["/", "/menu"]) {
    const { html } = await page(p);
    assert.deepEqual(typesOf(html), ["Restaurant", "WebSite", "WebPage"]);
    const g = graphOf(html)!;
    const ids = new Set(g["@graph"].map((n) => n["@id"]));
    const refs = JSON.stringify(g).match(/\{"@id":"[^"]+"\}/g) ?? [];
    for (const r of refs) assert.ok(ids.has(JSON.parse(r)["@id"]), `dangling ${r}`);
    log(`\n### ${p}`);
    block("json", JSON.stringify(g, null, 2));
  }
  // Beside the report, never in the repository working tree.
  writeFileSync(path.join(outDir, "sprint18-home-configured.jsonld"), jsonLdBlocks((await page("/")).html)[0]!);
  writeFileSync(path.join(outDir, "sprint18-menu-configured.jsonld"), jsonLdBlocks((await page("/menu")).html)[0]!);

  // ── Fallback chain heads ─────────────────────────────────────────────────────────────────
  log("\n## Metadata fallback chain — rendered <head> per level");
  log("\n### Level 1 — per-route override (/menu, override title \"Menu\" through the template)");
  block("html", head((await page("/menu")).html));
  log("\n### Level 3 — site default (/, no override row)");
  block("html", head((await page("/")).html));
  log("\n### Level 2 — dynamic-route template: no route supplies one (no category/item URLs exist). Proven by unit test only.");

  // ── Invalidation: title change ───────────────────────────────────────────────────────────
  log("\n## Invalidation, end to end (Phase 6 gates 3 and 5)");
  const beforeTitle = titleOf((await page("/menu")).html);
  const lastmodBefore = sitemapLastmod((await fetchText("/sitemap.xml")).text, `${HOST}/menu`);
  body = saveBody(view);
  body.routes.find((r: any) => r.routeKey === "menu")!.title = "Menu E2E changed";
  let t0 = Date.now();
  saved = await api(owner, "PUT", body);
  const saveMs = Date.now() - t0;
  view = saved.json!.data;
  const menuAfter = await page("/menu");
  const sitemapAfter = await fetchText("/sitemap.xml");
  const robotsAfter = await fetchText("/robots.txt");
  const lastmodAfter = sitemapLastmod(sitemapAfter.text, `${HOST}/menu`);
  const menuWebPageName = graphOf(menuAfter.html)!["@graph"].find((n) => n["@type"] === "WebPage")!.name;
  block(
    "text",
    [
      `save (commit + revalidateTag) returned ${saved.status} in ${saveMs} ms, live=${saved.json!.data.live}`,
      `/menu <title> before: ${beforeTitle}`,
      `/menu <title> on the very next request: ${titleOf(menuAfter.html)}`,
      `/menu og:title: ${meta(menuAfter.html, /<meta property="og:title" content="([^"]*)"/)}`,
      `/menu JSON-LD WebPage.name: ${menuWebPageName}`,
      `sitemap lastmod for /menu: ${lastmodBefore} -> ${lastmodAfter}`,
      `robots.txt unchanged (it carries no titles): ${robotsAfter.text === robotsTxt.text}`,
    ].join("\n"),
  );
  assert.equal(titleOf(menuAfter.html), "Menu E2E changed | Harold&#x27;s Chicken Burnham");
  assert.equal(menuWebPageName, "Menu E2E changed | Harold's Chicken Burnham");
  assert.notEqual(lastmodAfter, lastmodBefore);

  // Static route: /checkout is prerendered. Does the tag reach it?
  body = saveBody(view);
  body.routes.find((r: any) => r.routeKey === "checkout")!.title = "Checkout E2E";
  saved = await api(owner, "PUT", body);
  view = saved.json!.data;
  const checkoutTitle1 = titleOf((await page("/checkout")).html);
  const checkoutTitle2 = titleOf((await page("/checkout")).html);
  log(`\n/checkout (a statically prerendered route) title after save: 1st request "${checkoutTitle1}", 2nd request "${checkoutTitle2}"`);
  assert.equal(checkoutTitle1, "Checkout E2E | Harold&#x27;s Chicken Burnham");

  // ── Invalidation: noindex toggle ─────────────────────────────────────────────────────────
  body = saveBody(view);
  body.routes.find((r: any) => r.routeKey === "menu")!.noindex = true;
  saved = await api(owner, "PUT", body);
  view = saved.json!.data;
  const menuNoindex = await page("/menu");
  const sitemapNoindex = await fetchText("/sitemap.xml");
  const robotsNoindex = await fetchText("/robots.txt");
  log("\n### noindex toggled ON for /menu");
  block(
    "text",
    [
      `/menu robots meta: ${robotsOf(menuNoindex.html)}; canonical: ${canonicalOf(menuNoindex.html)}; JSON-LD blocks: ${jsonLdBlocks(menuNoindex.html).length}`,
      `sitemap locs: ${sitemapLocs(sitemapNoindex.text).join(", ")}`,
      `robots.txt unchanged: ${robotsNoindex.text === robotsTxt.text} (a noindex page must stay crawlable so the crawler can SEE the noindex)`,
      `home JSON-LD still references hasMenu: ${JSON.stringify(graphOf((await page("/")).html)!["@graph"][0]!.hasMenu)}`,
    ].join("\n"),
  );
  assert.equal(robotsOf(menuNoindex.html), "noindex, nofollow");
  assert.ok(!sitemapLocs(sitemapNoindex.text).includes(`${HOST}/menu`));
  body = saveBody(view);
  body.routes.find((r: any) => r.routeKey === "menu")!.noindex = false;
  view = (await api(owner, "PUT", body)).json!.data;
  assert.equal(robotsOf((await page("/menu")).html), "index, follow");
  log("noindex toggled back OFF: /menu is `index, follow` again on the next request, and back in the sitemap.");

  // ── Canonical host ───────────────────────────────────────────────────────────────────────
  log("\n## Canonical host change");
  body = saveBody(view);
  (body.site as Record<string, unknown>).canonicalHost = "https://staging.example.com";
  const refused = await api(owner, "PUT", body);
  log(`Through the admin API: ${refused.status} ${refused.json?.error?.code} — "${refused.json?.error?.message}" (field ${refused.json?.error?.details?.field})`);
  assert.equal(refused.status, 400);

  await prisma.seoSiteDefaults.update({ where: { id: "default" }, data: { canonicalHost: "https://www.haroldsburnham-test.com", version: { increment: 1 } } });
  const stale = await page("/");
  log(`Direct database update (the deployment path), no revalidation: / canonical still ${canonicalOf(stale.html)} — the cache is really caching.`);
  view = (await api(owner, "GET")).json!.data;
  body = saveBody(view);
  body.site.twitterHandle = "@e2e_probe";
  t0 = Date.now();
  await api(owner, "PUT", body);
  const afterHost = await page("/");
  const hostRobots = await fetchText("/robots.txt");
  const hostSitemap = await fetchText("/sitemap.xml");
  const newHost = "https://www.haroldsburnham-test.com";
  block(
    "text",
    [
      `after the next admin save revalidated the tag (${Date.now() - t0} ms):`,
      `  / canonical: ${canonicalOf(afterHost.html)}`,
      `  / og:url: ${meta(afterHost.html, /<meta property="og:url" content="([^"]*)"/)}`,
      `  / JSON-LD @ids: ${graphOf(afterHost.html)!["@graph"].map((n) => n["@id"]).join(", ")}`,
      `  robots.txt Sitemap line: ${hostRobots.text.match(/^Sitemap: .+$/m)?.[0]}`,
      `  sitemap locs: ${sitemapLocs(hostSitemap.text).join(", ")}`,
    ].join("\n"),
  );
  assert.ok(sameUrl(canonicalOf(afterHost.html), `${newHost}/`));
  assert.ok(hostRobots.text.includes(`Sitemap: ${newHost}/sitemap.xml`));
  assert.ok(sitemapLocs(hostSitemap.text).every((l) => l.startsWith(newHost)));
  assert.ok(graphOf(afterHost.html)!["@graph"].every((n) => String(n["@id"]).startsWith(newHost)));

  // ── Level 4 fallback ─────────────────────────────────────────────────────────────────────
  // The admin refuses an empty default title (it is required), so level 4 is reached the only way
  // it can be: the value emptied in the database, and the cache revalidated by an unrelated save
  // that omits the site section. The menu override is cleared too, so /menu has no level 1 either.
  body = saveBody(view);
  body.site.defaultTitle = "";
  const refusedEmpty = await api(owner, "PUT", body);
  await prisma.seoSiteDefaults.update({ where: { id: "default" }, data: { canonicalHost: HOST, defaultTitle: "", version: { increment: 1 } } });
  await prisma.seoRouteOverride.update({ where: { routeKey: "menu" }, data: { title: null } });
  view = (await api(owner, "GET")).json!.data;
  body = saveBody(view);
  body.business.telephoneDisplay = "(708) 555-0124";
  delete (body as Record<string, unknown>).site;
  delete (body as Record<string, unknown>).routes;
  saved = await api(owner, "PUT", body);
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  view = saved.json!.data;
  log(`
### Level 4 — every level empty → site name, warning logged. (Admin refuses an empty default title: ${refusedEmpty.status} "${refusedEmpty.json?.error?.message}"; emptied in the database instead.) /menu head:`);
  const lvl4 = await page("/menu");
  block("html", head(lvl4.html));
  assert.equal(titleOf(lvl4.html), "Harold&#x27;s Chicken Burnham");

  // ── Unconfigure again ────────────────────────────────────────────────────────────────────
  view = (await api(owner, "GET")).json!.data;
  body = saveBody(view);
  body.business.isConfigured = false;
  delete (body as Record<string, unknown>).site;
  saved = await api(owner, "PUT", body);
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  const off = await page("/");
  log(`\n## isConfigured switched back to false: / now emits ${JSON.stringify(typesOf(off.html))} — Restaurant gone on the next request.`);
  assert.deepEqual(typesOf(off.html), ["WebSite", "WebPage"]);

  // ── What a browser (not a bot) receives ─────────────────────────────────────────────────
  log(`\n## Where the metadata lands, by user agent (Next 15 streaming metadata)`);
  const inHead = (html: string) => /<head>[\s\S]*?<title>[\s\S]*?<\/head>/.test(html);
  const uaRows: string[] = [];
  const agents: Array<[string, string]> = [
    ["Twitterbot (HTML-limited bot)", CRAWLER],
    ["Googlebot", GOOGLEBOT],
    ["Chrome", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36"],
  ];
  for (const [name, ua] of agents) {
    const r = await page("/menu", ua);
    uaRows.push(
      `${name.padEnd(30)} title=${titleOf(r.html) !== null} canonical=${canonicalOf(r.html) !== null} ` +
        `json-ld=${jsonLdBlocks(r.html).length} metadata-inside-<head>=${inHead(r.html)}`,
    );
  }
  block("text", uaRows.join("\n"));
  log(
    "Every client receives the same metadata. For clients that support streaming — Googlebot among them — Next emits " +
      "it later in the document rather than blocking <head>. Bots that do not support streaming get it in <head>.",
  );


  log(`\n**All end-to-end assertions passed.**`);
}

void main();
