// SPRINT-18: SEO configuration persistence — the snapshot loader and the one write path.
//
// Every write goes through `saveSeoConfig`, which in ONE transaction: checks the caller's
// expected version, writes the changed sections, bumps SeoSiteDefaults.version, and writes one
// AdminAuditLog row per changed field (who, when, which field, old value, new value). Cache
// invalidation is deliberately NOT here — the caller does it after this resolves, i.e. after
// commit (apps/web/src/lib/seo/save.ts).
//
// Input is assumed already validated by apps/web/src/lib/seo/validation.ts. `canonicalHost` is
// never written from here: it is not part of the save request type.
import type {
  SeoBusinessData,
  SeoOpeningHoursRow,
  SeoRouteOverrideData,
  SeoSaveRequest,
  SeoSnapshot,
} from "@harolds/types";
import { prisma } from "./client";
import type { Prisma } from "./generated/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export class SeoVersionConflictError extends Error {
  constructor(
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(
      `SEO settings were saved by someone else since this form was loaded (version ${actual}, form ${expected}). ` +
        "Reload to see their changes; your edits are still in the form.",
    );
    this.name = "SeoVersionConflictError";
  }
}

export type SeoFieldChange = {
  entityType: "SeoBusiness" | "SeoSiteDefaults" | "SeoRouteOverride";
  entityId: string;
  field: string;
  before: unknown;
  after: unknown;
};

const BUSINESS_FIELDS = [
  "displayName",
  "legalName",
  "description",
  "streetAddress",
  "addressLocality",
  "addressRegion",
  "postalCode",
  "addressCountry",
  "telephone",
  "telephoneDisplay",
  "latitude",
  "longitude",
  "priceRange",
  "servesCuisine",
  "logoUrl",
  "imageUrl",
  "sameAs",
  "isConfigured",
] as const satisfies readonly (keyof SeoBusinessData)[];

const SITE_FIELDS = [
  "siteName",
  "defaultTitle",
  "titleTemplate",
  "defaultDescription",
  "defaultOgImageUrl",
  "locale",
  "twitterHandle",
] as const;

const ROUTE_FIELDS = ["title", "description", "ogImageUrl", "breadcrumbLabel", "noindex"] as const;

function sortHours(rows: SeoOpeningHoursRow[]): SeoOpeningHoursRow[] {
  return [...rows].sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek ||
      Number(b.isClosed) - Number(a.isClosed) ||
      (a.opens ?? "").localeCompare(b.opens ?? ""),
  );
}

/** Read every SEO table into one JSON-safe snapshot. The storefront reads this only via its cache. */
export async function loadSeoSnapshot(db: Db = prisma): Promise<SeoSnapshot> {
  const [business, site, routes] = await Promise.all([
    db.seoBusiness.findUnique({ where: { id: "default" }, include: { hours: { orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] } } }),
    db.seoSiteDefaults.findUnique({ where: { id: "default" } }),
    db.seoRouteOverride.findMany(),
  ]);
  if (!business || !site) {
    throw new Error("SEO singleton rows are missing — has migration 20260919120000_sprint18_seo been applied?");
  }
  return {
    version: site.version,
    business: {
      displayName: business.displayName,
      legalName: business.legalName,
      description: business.description,
      streetAddress: business.streetAddress,
      addressLocality: business.addressLocality,
      addressRegion: business.addressRegion,
      postalCode: business.postalCode,
      addressCountry: business.addressCountry,
      telephone: business.telephone,
      telephoneDisplay: business.telephoneDisplay,
      latitude: business.latitude,
      longitude: business.longitude,
      priceRange: business.priceRange,
      servesCuisine: business.servesCuisine,
      logoUrl: business.logoUrl,
      imageUrl: business.imageUrl,
      sameAs: business.sameAs,
      isConfigured: business.isConfigured,
      hours: business.hours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        isClosed: h.isClosed,
        opens: h.opens,
        closes: h.closes,
        overnight: h.overnight,
      })),
      updatedAt: business.updatedAt.toISOString(),
    },
    site: {
      siteName: site.siteName,
      canonicalHost: site.canonicalHost,
      defaultTitle: site.defaultTitle,
      titleTemplate: site.titleTemplate,
      defaultDescription: site.defaultDescription,
      defaultOgImageUrl: site.defaultOgImageUrl,
      locale: site.locale,
      twitterHandle: site.twitterHandle,
      updatedAt: site.updatedAt.toISOString(),
    },
    routes: Object.fromEntries(
      routes.map((r) => [
        r.routeKey,
        {
          routeKey: r.routeKey,
          title: r.title,
          description: r.description,
          ogImageUrl: r.ogImageUrl,
          breadcrumbLabel: r.breadcrumbLabel,
          noindex: r.noindex,
          updatedAt: r.updatedAt.toISOString(),
        },
      ]),
    ),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Field-level differences between the stored snapshot and a validated request. */
export function diffSeoChanges(before: SeoSnapshot, input: SeoSaveRequest): SeoFieldChange[] {
  const changes: SeoFieldChange[] = [];
  if (input.business) {
    for (const field of BUSINESS_FIELDS) {
      if (!same(before.business[field], input.business[field])) {
        changes.push({ entityType: "SeoBusiness", entityId: "default", field, before: before.business[field], after: input.business[field] });
      }
    }
    const hoursBefore = sortHours(before.business.hours);
    const hoursAfter = sortHours(input.business.hours);
    if (!same(hoursBefore, hoursAfter)) {
      changes.push({ entityType: "SeoBusiness", entityId: "default", field: "openingHours", before: hoursBefore, after: hoursAfter });
    }
  }
  if (input.site) {
    for (const field of SITE_FIELDS) {
      if (!same(before.site[field], input.site[field])) {
        changes.push({ entityType: "SeoSiteDefaults", entityId: "default", field, before: before.site[field], after: input.site[field] });
      }
    }
  }
  for (const route of input.routes ?? []) {
    const prev = before.routes[route.routeKey];
    for (const field of ROUTE_FIELDS) {
      const was = prev ? prev[field] : field === "noindex" ? false : null;
      if (!same(was, route[field])) {
        changes.push({ entityType: "SeoRouteOverride", entityId: route.routeKey, field, before: was, after: route[field] });
      }
    }
  }
  return changes;
}

function routeData(route: SeoRouteOverrideData) {
  return {
    title: route.title,
    description: route.description,
    ogImageUrl: route.ogImageUrl,
    breadcrumbLabel: route.breadcrumbLabel,
    noindex: route.noindex,
  };
}

/**
 * The one SEO write. Everything in a single transaction; the version row is locked first so two
 * concurrent saves serialise and the loser gets a conflict instead of silently overwriting.
 * A request that changes nothing writes nothing and does not bump the version.
 */
export async function saveSeoConfig(
  input: SeoSaveRequest,
  actor: { userId: string | null },
): Promise<{ snapshot: SeoSnapshot; changes: SeoFieldChange[] }> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ version: number }>>`
      SELECT "version" FROM "SeoSiteDefaults" WHERE "id" = 'default' FOR UPDATE`;
    const current = locked[0]?.version;
    if (current === undefined) throw new Error("SeoSiteDefaults row is missing.");
    if (current !== input.expectedVersion) throw new SeoVersionConflictError(input.expectedVersion, current);

    const before = await loadSeoSnapshot(tx);
    const changes = diffSeoChanges(before, input);
    if (changes.length === 0) return { snapshot: before, changes };

    const touched = new Set(changes.map((c) => c.entityType === "SeoRouteOverride" ? `route:${c.entityId}` : c.entityType));

    if (input.business && touched.has("SeoBusiness")) {
      const { hours, ...fields } = input.business;
      await tx.seoBusiness.update({ where: { id: "default" }, data: { ...fields, acceptsReservations: false } });
      if (changes.some((c) => c.field === "openingHours")) {
        await tx.seoOpeningHours.deleteMany({ where: { businessId: "default" } });
        await tx.seoOpeningHours.createMany({
          data: sortHours(hours).map((h, i) => ({ ...h, businessId: "default", sortOrder: i })),
        });
      }
    }
    if (input.site && touched.has("SeoSiteDefaults")) {
      await tx.seoSiteDefaults.update({ where: { id: "default" }, data: { ...input.site } });
    }
    for (const route of input.routes ?? []) {
      if (!touched.has(`route:${route.routeKey}`)) continue;
      await tx.seoRouteOverride.upsert({
        where: { routeKey: route.routeKey },
        create: { routeKey: route.routeKey, ...routeData(route) },
        update: routeData(route),
      });
    }

    const version = current + 1;
    await tx.seoSiteDefaults.update({ where: { id: "default" }, data: { version } });
    await tx.adminAuditLog.createMany({
      data: changes.map((c) => ({
        userId: actor.userId,
        action: "SEO_UPDATE",
        entityType: c.entityType,
        entityId: c.entityId,
        summary: `SEO ${c.entityType === "SeoRouteOverride" ? `page "${c.entityId}"` : c.entityType === "SeoBusiness" ? "business" : "site defaults"}: ${c.field} changed`,
        details: { field: c.field, before: c.before, after: c.after, version } as Prisma.InputJsonValue,
      })),
    });

    return { snapshot: await loadSeoSnapshot(tx), changes };
  });
}

/** Latest real modification time of anything on the menu page. Read-only; for sitemap lastmod. */
export async function getMenuLastModified(): Promise<Date | null> {
  const [items, categories] = await Promise.all([
    prisma.menuItem.aggregate({ _max: { updatedAt: true } }),
    prisma.category.aggregate({ _max: { updatedAt: true } }),
  ]);
  const dates = [items._max.updatedAt, categories._max.updatedAt].filter((d): d is Date => d instanceof Date);
  return dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
}
