// SPRINT-18: route metadata resolution — the documented fallback chain. Pure; safe in the browser
// (the admin preview resolves against unsaved form state with this same function).
//
// TITLE, in order:
//   1. the route's override title, if non-empty            → run through the title template
//   2. the dynamic-route template, tokens substituted       → run through the title template
//   3. the site default title                              → used as-is (it is already a full title)
//   4. the site name, with a warning logged                 → a route NEVER emits an empty title
// DESCRIPTION: override → template → site default description.
// OG IMAGE:    override → site default OG image → the business image (only once configured)
//              → the site logo, so og:image is never absent.
//
// No route today supplies a template (there are no dynamic indexable routes), so level 2 is
// exercised by tests and waits for the first category/item route.
import type { SeoSnapshot } from "@harolds/types";
import { DEFAULT_SHARE_IMAGE_PATH, seoRoute } from "./routes";

/** Last-resort title when even the site name is empty. Matches the seeded site name. */
export const SITE_NAME_FALLBACK = "Harold's Chicken Burnham";

export type RouteTemplate = {
  title?: string | null;
  description?: string | null;
  /** Values for the template's tokens, e.g. { categoryName: "Wings" }. */
  tokens?: Record<string, string>;
};

export type ResolvedRouteMeta = {
  routeKey: string;
  /** Effective: the registry allows it AND the override has not switched it off. */
  indexable: boolean;
  title: string;
  titleSource: "override" | "template" | "default" | "siteName";
  description: string;
  descriptionSource: "override" | "template" | "default" | "none";
  /** Absolute URL of this page on the canonical host. */
  url: string;
  /** Same as `url` for indexable routes; null when the route is noindex. */
  canonicalUrl: string | null;
  ogImageUrl: string;
};

export type SeoWarn = (event: string, fields: Record<string, unknown>) => void;

function nonEmpty(v: string | null | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** "https://haroldsburnham.com/" + path, with no query string and no trailing-slash ambiguity. */
export function canonicalUrl(canonicalHost: string, path: string): string {
  const origin = canonicalHost.replace(/\/+$/, "");
  const clean = (path.split(/[?#]/)[0] ?? "/").replace(/\/+$/, "");
  return clean === "" ? `${origin}/` : `${origin}${clean.startsWith("/") ? clean : `/${clean}`}`;
}

/** Substitute {token}s. Returns null if any token has no value — never emit literal braces. */
export function fillTokens(template: string, tokens: Record<string, string>): string | null {
  let missing = false;
  const out = template.replace(/\{([A-Za-z]+)\}/g, (_, name: string) => {
    const value = tokens[name];
    if (!nonEmpty(value)) {
      missing = true;
      return "";
    }
    return value;
  });
  return missing ? null : out.trim();
}

/** Apply the site title template to a page title. A template without {pageTitle} is ignored. */
export function applyTitleTemplate(titleTemplate: string, pageTitle: string, siteName: string): string {
  if (!titleTemplate.includes("{pageTitle}")) return pageTitle;
  return titleTemplate.replaceAll("{pageTitle}", pageTitle).replaceAll("{siteName}", siteName).trim();
}

export function resolveRouteMeta(
  snapshot: SeoSnapshot,
  routeKey: string,
  options: { path?: string; template?: RouteTemplate } = {},
  warn: SeoWarn = () => undefined,
): ResolvedRouteMeta {
  const def = seoRoute(routeKey);
  const override = snapshot.routes[routeKey];
  const { site, business } = snapshot;
  const siteName = nonEmpty(site.siteName) ? site.siteName.trim() : SITE_NAME_FALLBACK;
  const tokens = options.template?.tokens ?? {};

  let title: string;
  let titleSource: ResolvedRouteMeta["titleSource"];
  const templatedTitle = nonEmpty(options.template?.title) ? fillTokens(options.template.title, tokens) : null;
  if (nonEmpty(override?.title)) {
    title = applyTitleTemplate(site.titleTemplate, override.title.trim(), siteName);
    titleSource = "override";
  } else if (nonEmpty(templatedTitle)) {
    title = applyTitleTemplate(site.titleTemplate, templatedTitle, siteName);
    titleSource = "template";
  } else if (nonEmpty(site.defaultTitle)) {
    title = site.defaultTitle.trim();
    titleSource = "default";
  } else {
    title = siteName;
    titleSource = "siteName";
    warn("seo.metadata.title_fallback_to_site_name", { routeKey });
  }

  let description = "";
  let descriptionSource: ResolvedRouteMeta["descriptionSource"] = "none";
  const templatedDescription = nonEmpty(options.template?.description)
    ? fillTokens(options.template.description, tokens)
    : null;
  if (nonEmpty(override?.description)) {
    description = override.description.trim();
    descriptionSource = "override";
  } else if (nonEmpty(templatedDescription)) {
    description = templatedDescription;
    descriptionSource = "template";
  } else if (nonEmpty(site.defaultDescription)) {
    description = site.defaultDescription.trim();
    descriptionSource = "default";
  }

  const indexable = Boolean(def?.indexable) && !(override?.noindex ?? false);
  const url = canonicalUrl(site.canonicalHost, options.path ?? def?.path ?? "/");
  const ogImageUrl = nonEmpty(override?.ogImageUrl)
    ? override.ogImageUrl
    : nonEmpty(site.defaultOgImageUrl)
      ? site.defaultOgImageUrl
      : business.isConfigured && nonEmpty(business.imageUrl)
        ? business.imageUrl
        : canonicalUrl(site.canonicalHost, DEFAULT_SHARE_IMAGE_PATH);

  return {
    routeKey,
    indexable,
    title,
    titleSource,
    description,
    descriptionSource,
    url,
    canonicalUrl: indexable ? url : null,
    ogImageUrl,
  };
}
