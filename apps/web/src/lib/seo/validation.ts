// SPRINT-18: the ONE validation module for SEO settings. The admin API route runs it as the
// authority; the admin form runs the same function on every edit for immediate feedback. Pure,
// no server imports — never duplicate a rule into either caller.
//
// Errors block a save. WARNINGS never do: title/description length is advisory because Google
// truncates by pixel width, not characters, so any character limit is an approximation and a
// hard one would block legitimate values.
//
// Required-ness is two-tier. Format rules apply to every non-empty value always. The fields a
// Restaurant node cannot exist without (telephone) are only REQUIRED once the operator marks the
// business configured — and at that point no field may still contain the seeded "PLACEHOLDER".
import type {
  SeoBusinessData,
  SeoOpeningHoursRow,
  SeoRouteOverrideData,
  SeoSaveRequest,
  SeoSiteDefaultsData,
} from "@harolds/types";
import { ISO_3166_ALPHA2 } from "./countries";
import { applyTitleTemplate } from "./resolve";
import { seoRoute } from "./routes";

export const TITLE_WARN_CHARS = 60;
export const DESCRIPTION_WARN_CHARS = 155;

/** Field path → message. Paths look like "business.telephone", "business.hours.2.closes". */
export type SeoFieldMessages = Record<string, string>;

export type SeoValidationResult =
  | { ok: true; value: SeoSaveRequest; warnings: SeoFieldMessages }
  | { ok: false; errors: SeoFieldMessages; warnings: SeoFieldMessages };

const E164 = /^\+[1-9]\d{7,14}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOCALE = /^[a-z]{2}_[A-Z]{2}$/;
const TWITTER = /^@?[A-Za-z0-9_]{1,15}$/;
const PLACEHOLDER = /placeholder/i;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const TITLE_TOKENS = new Set(["pageTitle", "siteName"]);

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

class Messages {
  errors: SeoFieldMessages = {};
  warnings: SeoFieldMessages = {};
  error(path: string, message: string): void {
    if (!(path in this.errors)) this.errors[path] = message;
  }
  warn(path: string, message: string): void {
    if (!(path in this.warnings)) this.warnings[path] = message;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** An absolute https URL with a real host and no embedded credentials. */
export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname.includes(".") && !u.username && !u.password;
  } catch {
    return false;
  }
}

function readText(
  raw: unknown,
  path: string,
  m: Messages,
  opts: { label: string; max: number; required?: boolean },
): string | null {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    if (opts.required) m.error(path, `${opts.label} is required.`);
    return null;
  }
  if (typeof raw !== "string") {
    m.error(path, `${opts.label} must be text.`);
    return null;
  }
  const value = raw.trim();
  if (value.length > opts.max) m.error(path, `${opts.label} must be at most ${opts.max} characters.`);
  if (CONTROL.test(value)) m.error(path, `${opts.label} contains control characters.`);
  return value;
}

function readUrl(raw: unknown, path: string, m: Messages, label: string): string | null {
  const value = readText(raw, path, m, { label, max: 2048 });
  if (value !== null && !isHttpsUrl(value)) {
    m.error(path, `${label} must be an absolute https:// URL.`);
  }
  return value;
}

function readTextList(
  raw: unknown,
  path: string,
  m: Messages,
  opts: { label: string; maxItems: number; maxLength: number; url?: boolean },
): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    m.error(path, `${opts.label} must be a list.`);
    return [];
  }
  const out: string[] = [];
  raw.forEach((item, i) => {
    const value = opts.url
      ? readUrl(item, `${path}.${i}`, m, opts.label)
      : readText(item, `${path}.${i}`, m, { label: opts.label, max: opts.maxLength });
    if (value === null) return;
    if (out.includes(value)) {
      m.error(`${path}.${i}`, `${opts.label} is listed twice.`);
      return;
    }
    out.push(value);
  });
  if (out.length > opts.maxItems) m.error(path, `At most ${opts.maxItems} ${opts.label.toLowerCase()} entries.`);
  return out;
}

function readCoordinate(raw: unknown, path: string, m: Messages, label: string, limit: number): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    m.error(path, `${label} must be a number.`);
    return null;
  }
  if (n < -limit || n > limit) {
    m.error(path, `${label} must be between -${limit} and ${limit}.`);
    return null;
  }
  return n;
}

function lengthWarning(kind: "title" | "description", length: number): string {
  const limit = kind === "title" ? TITLE_WARN_CHARS : DESCRIPTION_WARN_CHARS;
  return (
    `About ${length} characters. Google usually cuts ${kind}s off around ${limit} characters — ` +
    `it measures pixel width, not characters, so this is approximate. You can still save.`
  );
}

function validateOpeningHours(raw: unknown, path: string, m: Messages): SeoOpeningHoursRow[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    m.error(path, "Opening hours must be a list.");
    return [];
  }
  const rows: SeoOpeningHoursRow[] = [];
  raw.forEach((item, i) => {
    const p = `${path}.${i}`;
    if (!isRecord(item)) {
      m.error(p, "Each opening-hours row must be an object.");
      return;
    }
    const day = item.dayOfWeek;
    if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6) {
      m.error(`${p}.dayOfWeek`, "Day must be Sunday–Saturday.");
      return;
    }
    const isClosed = item.isClosed === true;
    const overnight = item.overnight === true;
    if (isClosed) {
      rows.push({ dayOfWeek: day, isClosed: true, opens: null, closes: null, overnight: false });
      return;
    }
    const opens = typeof item.opens === "string" ? item.opens.trim() : "";
    const closes = typeof item.closes === "string" ? item.closes.trim() : "";
    if (!HHMM.test(opens)) m.error(`${p}.opens`, "Opening time must be HH:mm (24-hour).");
    if (!HHMM.test(closes)) m.error(`${p}.closes`, "Closing time must be HH:mm (24-hour).");
    if (HHMM.test(opens) && HHMM.test(closes)) {
      if (closes <= opens && !overnight) {
        m.error(
          `${p}.closes`,
          "Closing time must be after opening time. For a range that runs past midnight, tick “Closes next day”.",
        );
      }
      if (overnight && closes > opens) {
        m.error(`${p}.overnight`, "“Closes next day” is ticked, but the closing time is later the same day.");
      }
    }
    rows.push({ dayOfWeek: day, isClosed: false, opens, closes, overnight });
  });

  for (let day = 0; day <= 6; day++) {
    const indexed = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.dayOfWeek === day);
    const closed = indexed.filter(({ r }) => r.isClosed);
    const open = indexed.filter(({ r }) => !r.isClosed);
    if (closed.length > 0 && open.length > 0) {
      m.error(`${path}.${closed[0]!.i}.isClosed`, `${DAY_NAMES[day]} cannot be both closed and open.`);
    }
    if (closed.length > 1) m.error(`${path}.${closed[1]!.i}.isClosed`, `${DAY_NAMES[day]} is marked closed twice.`);
    if (open.length > 4) m.error(`${path}.${open[4]!.i}`, `At most four ranges for ${DAY_NAMES[day]}.`);
    const sameDay = open.filter(({ r }) => !r.overnight).sort((a, b) => (a.r.opens! < b.r.opens! ? -1 : 1));
    for (let k = 1; k < sameDay.length; k++) {
      if (sameDay[k]!.r.opens! < sameDay[k - 1]!.r.closes!) {
        m.error(`${path}.${sameDay[k]!.i}.opens`, `This range overlaps another on ${DAY_NAMES[day]}.`);
      }
    }
  }
  return rows;
}

function validateBusiness(raw: unknown, m: Messages): SeoBusinessData | null {
  if (!isRecord(raw)) {
    m.error("business", "Business details are missing.");
    return null;
  }
  const b = "business";
  if (typeof raw.isConfigured !== "boolean") m.error(`${b}.isConfigured`, "Configured must be true or false.");
  const isConfigured = raw.isConfigured === true;
  if (raw.acceptsReservations !== undefined && raw.acceptsReservations !== false) {
    m.error(`${b}.acceptsReservations`, "Reservations are fixed to “no” for a pickup counter.");
  }

  const country = readText(raw.addressCountry, `${b}.addressCountry`, m, { label: "Country", max: 2, required: true });
  const addressCountry = country?.toUpperCase() ?? "";
  if (country !== null && !ISO_3166_ALPHA2.has(addressCountry)) {
    m.error(`${b}.addressCountry`, "Country must be a two-letter ISO 3166-1 code, e.g. US.");
  }

  const telephone = readText(raw.telephone, `${b}.telephone`, m, {
    label: "Telephone",
    max: 16,
    required: isConfigured,
  });
  if (telephone !== null && !E164.test(telephone)) {
    m.error(`${b}.telephone`, "Telephone must be in E.164 form: + then country code and number, e.g. +17085550123.");
  }

  const latitude = readCoordinate(raw.latitude, `${b}.latitude`, m, "Latitude", 90);
  const longitude = readCoordinate(raw.longitude, `${b}.longitude`, m, "Longitude", 180);
  if ((latitude === null) !== (longitude === null) && !m.errors[`${b}.latitude`] && !m.errors[`${b}.longitude`]) {
    m.error(latitude === null ? `${b}.latitude` : `${b}.longitude`, "Give both latitude and longitude, or neither.");
  }

  const value: SeoBusinessData = {
    displayName: readText(raw.displayName, `${b}.displayName`, m, { label: "Display name", max: 120, required: true }) ?? "",
    legalName: readText(raw.legalName, `${b}.legalName`, m, { label: "Legal name", max: 160 }),
    description: readText(raw.description, `${b}.description`, m, { label: "Description", max: 1000, required: true }) ?? "",
    streetAddress: readText(raw.streetAddress, `${b}.streetAddress`, m, { label: "Street address", max: 200, required: true }) ?? "",
    addressLocality: readText(raw.addressLocality, `${b}.addressLocality`, m, { label: "City", max: 100, required: true }) ?? "",
    addressRegion: readText(raw.addressRegion, `${b}.addressRegion`, m, { label: "State", max: 100, required: true }) ?? "",
    postalCode: readText(raw.postalCode, `${b}.postalCode`, m, { label: "Postal code", max: 20, required: true }) ?? "",
    addressCountry,
    telephone,
    telephoneDisplay: readText(raw.telephoneDisplay, `${b}.telephoneDisplay`, m, { label: "Display telephone", max: 40 }),
    latitude,
    longitude,
    priceRange: readText(raw.priceRange, `${b}.priceRange`, m, { label: "Price range", max: 100 }),
    servesCuisine: readTextList(raw.servesCuisine, `${b}.servesCuisine`, m, { label: "Cuisine", maxItems: 10, maxLength: 60 }),
    logoUrl: readUrl(raw.logoUrl, `${b}.logoUrl`, m, "Logo URL"),
    imageUrl: readUrl(raw.imageUrl, `${b}.imageUrl`, m, "Business image URL"),
    sameAs: readTextList(raw.sameAs, `${b}.sameAs`, m, { label: "Profile URL", maxItems: 10, maxLength: 2048, url: true }),
    isConfigured,
    hours: validateOpeningHours(raw.hours, `${b}.hours`, m),
  };

  if (isConfigured) {
    // Critical rule 8: nothing seeded may be published.
    const textFields: Array<[string, string | null]> = [
      ["displayName", value.displayName],
      ["legalName", value.legalName],
      ["description", value.description],
      ["streetAddress", value.streetAddress],
      ["addressLocality", value.addressLocality],
      ["addressRegion", value.addressRegion],
      ["postalCode", value.postalCode],
      ["telephoneDisplay", value.telephoneDisplay],
      ["priceRange", value.priceRange],
    ];
    for (const [field, v] of textFields) {
      if (v && PLACEHOLDER.test(v)) {
        m.error(`${b}.${field}`, "Still placeholder text. Replace it before marking the business configured.");
      }
    }
    value.servesCuisine.forEach((c, i) => {
      if (PLACEHOLDER.test(c)) {
        m.error(`${b}.servesCuisine.${i}`, "Still placeholder text. Replace it before marking the business configured.");
      }
    });
  }
  return value;
}

function validateSite(raw: unknown, m: Messages): Omit<SeoSiteDefaultsData, "canonicalHost"> | null {
  if (!isRecord(raw)) {
    m.error("site", "Site defaults are missing.");
    return null;
  }
  const s = "site";
  if ("canonicalHost" in raw) {
    m.error(
      `${s}.canonicalHost`,
      "The canonical host is a deployment setting and cannot be changed from the admin.",
    );
  }
  const titleTemplate =
    readText(raw.titleTemplate, `${s}.titleTemplate`, m, { label: "Title template", max: 120, required: true }) ?? "";
  if (titleTemplate && !titleTemplate.includes("{pageTitle}")) {
    m.error(`${s}.titleTemplate`, "The title template must contain {pageTitle}.");
  }
  for (const match of titleTemplate.matchAll(/\{([^}]*)\}/g)) {
    if (!TITLE_TOKENS.has(match[1]!)) {
      m.error(`${s}.titleTemplate`, `Unknown token {${match[1]}}. Use {pageTitle} and {siteName}.`);
    }
  }
  const locale = readText(raw.locale, `${s}.locale`, m, { label: "Locale", max: 5, required: true }) ?? "";
  if (locale && !LOCALE.test(locale)) m.error(`${s}.locale`, "Locale must look like en_US.");
  const handle = readText(raw.twitterHandle, `${s}.twitterHandle`, m, { label: "X / Twitter handle", max: 16 });
  if (handle !== null && !TWITTER.test(handle)) {
    m.error(`${s}.twitterHandle`, "A handle is up to 15 letters, digits or underscores.");
  }

  const value = {
    siteName: readText(raw.siteName, `${s}.siteName`, m, { label: "Site name", max: 80, required: true }) ?? "",
    defaultTitle: readText(raw.defaultTitle, `${s}.defaultTitle`, m, { label: "Default title", max: 120, required: true }) ?? "",
    titleTemplate,
    defaultDescription:
      readText(raw.defaultDescription, `${s}.defaultDescription`, m, {
        label: "Default description",
        max: 500,
        required: true,
      }) ?? "",
    defaultOgImageUrl: readUrl(raw.defaultOgImageUrl, `${s}.defaultOgImageUrl`, m, "Default share image URL"),
    locale,
    twitterHandle: handle === null ? null : handle.startsWith("@") ? handle : `@${handle}`,
  };
  if (value.defaultTitle.length > TITLE_WARN_CHARS) {
    m.warn(`${s}.defaultTitle`, lengthWarning("title", value.defaultTitle.length));
  }
  if (value.defaultDescription.length > DESCRIPTION_WARN_CHARS) {
    m.warn(`${s}.defaultDescription`, lengthWarning("description", value.defaultDescription.length));
  }
  return value;
}

function validateRoutes(
  raw: unknown,
  m: Messages,
  titleContext: { titleTemplate: string; siteName: string } | null,
): SeoRouteOverrideData[] {
  if (!Array.isArray(raw)) {
    m.error("routes", "Page settings must be a list.");
    return [];
  }
  const out: SeoRouteOverrideData[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.routeKey !== "string") {
      m.error("routes", "Each page setting needs a route key.");
      continue;
    }
    const def = seoRoute(item.routeKey);
    const p = `routes.${item.routeKey}`;
    if (!def) {
      m.error(p, `Unknown page "${item.routeKey}".`);
      continue;
    }
    if (out.some((r) => r.routeKey === def.key)) {
      m.error(p, `${def.label} appears twice.`);
      continue;
    }
    if (typeof item.noindex !== "boolean") m.error(`${p}.noindex`, "Hide from search must be true or false.");
    if (!def.indexable && item.noindex === false) {
      m.error(`${p}.noindex`, `${def.label} is always hidden from search engines.`);
    }
    const route: SeoRouteOverrideData = {
      routeKey: def.key,
      title: readText(item.title, `${p}.title`, m, { label: "Title", max: 120 }),
      description: readText(item.description, `${p}.description`, m, { label: "Description", max: 500 }),
      ogImageUrl: readUrl(item.ogImageUrl, `${p}.ogImageUrl`, m, "Share image URL"),
      breadcrumbLabel: readText(item.breadcrumbLabel, `${p}.breadcrumbLabel`, m, { label: "Breadcrumb label", max: 60 }),
      noindex: def.indexable ? item.noindex === true : true,
    };
    if (route.title && titleContext) {
      const rendered = applyTitleTemplate(titleContext.titleTemplate, route.title, titleContext.siteName);
      if (rendered.length > TITLE_WARN_CHARS) m.warn(`${p}.title`, lengthWarning("title", rendered.length));
    }
    if (route.description && route.description.length > DESCRIPTION_WARN_CHARS) {
      m.warn(`${p}.description`, lengthWarning("description", route.description.length));
    }
    out.push(route);
  }
  return out;
}

/**
 * Validate an admin save. `context` supplies the saved title template when the request does not
 * carry the site section, so route-title length warnings still reflect the real rendered title.
 */
export function validateSeoSaveRequest(
  raw: unknown,
  context?: { titleTemplate: string; siteName: string },
): SeoValidationResult {
  const m = new Messages();
  if (!isRecord(raw)) {
    return { ok: false, errors: { request: "Request body must be an object." }, warnings: {} };
  }
  const expectedVersion = raw.expectedVersion;
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    m.error("expectedVersion", "The form's version is missing. Reload the page.");
  }

  const value: SeoSaveRequest = { expectedVersion: Number(expectedVersion) };
  if (raw.business !== undefined) value.business = validateBusiness(raw.business, m) ?? undefined;
  if (raw.site !== undefined) value.site = validateSite(raw.site, m) ?? undefined;
  if (raw.routes !== undefined) {
    const ctx = value.site ? { titleTemplate: value.site.titleTemplate, siteName: value.site.siteName } : context ?? null;
    value.routes = validateRoutes(raw.routes, m, ctx);
  }
  if (!value.business && !value.site && !value.routes && Object.keys(m.errors).length === 0) {
    m.error("request", "Nothing to save.");
  }

  return Object.keys(m.errors).length > 0
    ? { ok: false, errors: m.errors, warnings: m.warnings }
    : { ok: true, value, warnings: m.warnings };
}
