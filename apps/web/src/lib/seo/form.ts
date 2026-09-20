// SPRINT-18: the admin SEO form's data shaping, kept out of the component so it can be tested
// without a DOM — the same discipline as the rest of lib/seo.
//
// Two properties matter and are asserted in seo.test.ts:
//   1. ROUND TRIP: toRequest(fromSnapshot(snapshot)) equals the canonical save body for that
//      snapshot. If it does not, the save bar shows "unsaved changes" the moment the screen
//      loads, and a save the operator never meant rewrites values.
//   2. PREVIEW FIDELITY: previewSnapshot() feeds the storefront's own resolver and builder, so
//      what the Preview tab shows is what the storefront will emit.
import type {
  SeoBusinessData,
  SeoOpeningHoursRow,
  SeoRouteOverrideData,
  SeoSiteDefaultsData,
  SeoSnapshot,
} from "@harolds/types";
import type { SeoRouteDef } from "./routes";
import { DAY_NAMES } from "./validation";

export type DayMode = "unset" | "closed" | "open";
export type DayForm = { mode: DayMode; ranges: Array<{ opens: string; closes: string; overnight: boolean }> };

/** Coordinates and cuisines are strings while being typed; hours are grouped per day. */
export type BusinessForm = Omit<SeoBusinessData, "latitude" | "longitude" | "servesCuisine" | "hours"> & {
  latitude: string;
  longitude: string;
  servesCuisine: string;
  days: DayForm[];
};

export type SeoFormState = {
  business: BusinessForm;
  site: Omit<SeoSiteDefaultsData, "canonicalHost">;
  routes: Record<string, SeoRouteOverrideData>;
};

export function toDays(hours: SeoOpeningHoursRow[]): DayForm[] {
  return DAY_NAMES.map((_, day) => {
    const rows = hours.filter((h) => h.dayOfWeek === day);
    if (rows.length === 0) return { mode: "unset", ranges: [] };
    if (rows.some((r) => r.isClosed)) return { mode: "closed", ranges: [] };
    return {
      mode: "open",
      ranges: rows.map((r) => ({ opens: r.opens ?? "", closes: r.closes ?? "", overnight: r.overnight })),
    };
  });
}

/** Flatten the day editor back into rows, in the order validation reports indexes against. */
export function flattenHours(days: DayForm[]): SeoOpeningHoursRow[] {
  const rows: SeoOpeningHoursRow[] = [];
  days.forEach((d, day) => {
    if (d.mode === "closed") rows.push({ dayOfWeek: day, isClosed: true, opens: null, closes: null, overnight: false });
    if (d.mode === "open") {
      for (const r of d.ranges) {
        rows.push({ dayOfWeek: day, isClosed: false, opens: r.opens, closes: r.closes, overnight: r.overnight });
      }
    }
  });
  return rows;
}

export function fromSnapshot(s: SeoSnapshot, routes: readonly SeoRouteDef[]): SeoFormState {
  const { hours, latitude, longitude, servesCuisine, updatedAt: _b, ...business } = s.business;
  const { canonicalHost: _host, updatedAt: _s, ...site } = s.site;
  void _b;
  void _s;
  void _host;
  return {
    business: {
      ...business,
      latitude: latitude === null ? "" : String(latitude),
      longitude: longitude === null ? "" : String(longitude),
      servesCuisine: servesCuisine.join(", "),
      sameAs: [...business.sameAs],
      days: toDays(hours),
    },
    site,
    routes: Object.fromEntries(
      routes.map((r) => {
        const o = s.routes[r.key];
        return [
          r.key,
          {
            routeKey: r.key,
            title: o?.title ?? null,
            description: o?.description ?? null,
            ogImageUrl: o?.ogImageUrl ?? null,
            breadcrumbLabel: o?.breadcrumbLabel ?? null,
            noindex: r.indexable ? (o?.noindex ?? false) : true,
          },
        ];
      }),
    ),
  };
}

/** The save body. `canonicalHost` is never included: the API rejects it outright. */
export function toRequest(form: SeoFormState, version: number, routes: readonly SeoRouteDef[]) {
  const { days, latitude, longitude, servesCuisine, ...business } = form.business;
  const coord = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    expectedVersion: version,
    business: {
      ...business,
      latitude: coord(latitude),
      longitude: coord(longitude),
      servesCuisine: servesCuisine
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      sameAs: business.sameAs.filter((u) => u.trim() !== ""),
      hours: flattenHours(days),
    },
    site: form.site,
    routes: routes.map((r) => form.routes[r.key]!),
  };
}

/** The snapshot the storefront WOULD read if this form were saved now — what Preview renders. */
export function previewSnapshot(form: SeoFormState, saved: SeoSnapshot, routes: readonly SeoRouteDef[]): SeoSnapshot {
  const request = toRequest(form, saved.version, routes);
  const now = new Date().toISOString();
  return {
    version: saved.version,
    business: { ...(request.business as unknown as SeoBusinessData), updatedAt: now },
    site: { ...form.site, canonicalHost: saved.site.canonicalHost, updatedAt: now },
    routes: Object.fromEntries(request.routes.map((r) => [r.routeKey, { ...r, updatedAt: now }])),
  };
}
