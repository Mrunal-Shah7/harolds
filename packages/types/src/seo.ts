// SPRINT-18: SEO configuration shapes — shared by the database layer, the storefront, the admin
// API route and the admin form. Plain data only: no Prisma types, safe to import in the browser.

/** One opening-hours range. Several per day are allowed; a day with none is unset. */
export type SeoOpeningHoursRow = {
  /** 0 = Sunday … 6 = Saturday, matching StoreHours. */
  dayOfWeek: number;
  /** An explicit closed day. `opens` / `closes` are null when true. */
  isClosed: boolean;
  /** "HH:mm", 24h. */
  opens: string | null;
  /** "HH:mm", 24h. */
  closes: string | null;
  /** The range ends on the following day. Required whenever `closes` is not after `opens`. */
  overnight: boolean;
};

/** The business facts that become the Restaurant node. */
export type SeoBusinessData = {
  displayName: string;
  legalName: string | null;
  description: string;
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2. */
  addressCountry: string;
  /** E.164. */
  telephone: string | null;
  telephoneDisplay: string | null;
  latitude: number | null;
  longitude: number | null;
  priceRange: string | null;
  servesCuisine: string[];
  logoUrl: string | null;
  imageUrl: string | null;
  /** Ordered profile URLs. */
  sameAs: string[];
  /** Critical rule 8: false suppresses the Restaurant node entirely. */
  isConfigured: boolean;
  hours: SeoOpeningHoursRow[];
};

/** Site-wide defaults. `canonicalHost` is read-only everywhere except the database. */
export type SeoSiteDefaultsData = {
  siteName: string;
  /** Origin only, no path, no trailing slash, e.g. "https://haroldsburnham.com". */
  canonicalHost: string;
  defaultTitle: string;
  /** Contains {pageTitle}; may contain {siteName}. */
  titleTemplate: string;
  defaultDescription: string;
  defaultOgImageUrl: string | null;
  /** Open Graph locale, e.g. "en_US". */
  locale: string;
  twitterHandle: string | null;
};

export type SeoRouteOverrideData = {
  routeKey: string;
  title: string | null;
  description: string | null;
  ogImageUrl: string | null;
  breadcrumbLabel: string | null;
  noindex: boolean;
};

/** Everything the storefront needs, as read through the one cached accessor. JSON-safe. */
export type SeoSnapshot = {
  /** Monotonic; bumped in the same transaction as any SEO write. */
  version: number;
  business: SeoBusinessData & { updatedAt: string };
  site: SeoSiteDefaultsData & { updatedAt: string };
  routes: Record<string, SeoRouteOverrideData & { updatedAt: string }>;
};

/** What the admin sends. Every section is optional; an absent section is left untouched. */
export type SeoSaveRequest = {
  /** The version the form was loaded at. A mismatch is a conflict, never a silent overwrite. */
  expectedVersion: number;
  business?: SeoBusinessData;
  /** No canonicalHost: it is not accepted from the admin at all. */
  site?: Omit<SeoSiteDefaultsData, "canonicalHost">;
  routes?: SeoRouteOverrideData[];
};
