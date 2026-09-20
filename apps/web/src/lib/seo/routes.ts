// SPRINT-18: the storefront's SEO route registry — stable keys, never raw paths.
//
// Every storefront route that renders metadata is declared here, and nowhere else decides
// whether a route may be indexed. `indexable: false` is a CODE decision that the admin cannot
// override: those routes are noindex, absent from the sitemap and disallowed in robots.txt —
// three independent controls — whatever the SeoRouteOverride row says.
//
// There are no dynamic indexable routes. The menu is one page with hash anchors
// (/menu#cat-<id>); categories and items have no URLs of their own. When they do, they are
// declared here with the tokens their templates may use (e.g. {categoryName}).

export type SeoRouteDef = {
  key: string;
  /** Path as the browser sees it. Dynamic segments in brackets. */
  path: string;
  label: string;
  /** False: always noindex, never in the sitemap, always disallowed in robots.txt. */
  indexable: boolean;
  /** Tokens a template on this route may use. Empty for every route that exists today. */
  tokens: readonly string[];
  /** Admin-facing note on why the route is, or is not, indexable. */
  note: string;
};

export const SEO_ROUTES: readonly SeoRouteDef[] = [
  {
    key: "home",
    path: "/",
    label: "Home",
    indexable: true,
    tokens: [],
    note: "Uses the site default title and description unless overridden here.",
  },
  {
    key: "menu",
    path: "/menu",
    label: "Menu",
    indexable: true,
    tokens: [],
    note: "The whole menu is this one page. Categories and items have no URLs of their own.",
  },
  {
    key: "checkout",
    path: "/checkout",
    label: "Checkout",
    indexable: false,
    tokens: [],
    note: "Always hidden from search engines: it shows the customer's cart.",
  },
  {
    key: "order-status",
    path: "/order/[lookupToken]",
    label: "Order status and confirmation",
    indexable: false,
    tokens: [],
    note: "Always hidden from search engines: it shows a customer's order and pickup time.",
  },
] as const;

export const SEO_ROUTE_KEYS: readonly string[] = SEO_ROUTES.map((r) => r.key);

/**
 * Routes the admin SEO Pages / Preview tabs expose. Always-noindex surfaces (checkout,
 * order status) stay in SEO_ROUTES for crawl, robots and metadata, but are not editable
 * here — there is nothing useful for an operator to tune on a page search engines never see.
 */
export const SEO_ADMIN_ROUTES: readonly SeoRouteDef[] = SEO_ROUTES.filter((r) => r.indexable);

/**
 * Last-resort share image: the logo already served from apps/web/public. Not a claim about the
 * business — just the site's own mark — so it may be used before the business is configured.
 */
export const DEFAULT_SHARE_IMAGE_PATH = "/logo.jpeg";

export function seoRoute(key: string): SeoRouteDef | undefined {
  return SEO_ROUTES.find((r) => r.key === key);
}

/**
 * robots.txt `Disallow` prefixes. Every non-indexable surface, including the ones outside the
 * storefront registry (admin, kitchen, the dev-only design system, every API path) and `/cart`,
 * which is not a route today but is blocked so a future one inherits the rule.
 */
export const ROBOTS_DISALLOW: readonly string[] = [
  "/checkout",
  "/cart",
  "/order",
  "/api/",
  "/admin",
  "/kitchen",
  "/design-system",
];

/**
 * robots.txt `Allow` prefixes. `/api/v1/media/` serves the menu and hero photographs; it is an
 * API path, but blocking it would stop Googlebot-Image indexing the menu photos and stop
 * Twitterbot (which obeys robots.txt) fetching an og:image served from there. Longest match
 * wins, so this carves the media path out of `Disallow: /api/`. Recorded as a deviation.
 */
export const ROBOTS_ALLOW: readonly string[] = ["/", "/api/v1/media/"];
