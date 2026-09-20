"use client";

// SPRINT-18: the admin SEO section — Business details, Site defaults, Pages, Preview. OWNER only.
//
// STRUCTURED FIELDS ONLY (Critical rule 4). Every input here is a plain text, URL, number, time,
// select or toggle control whose value is validated as data. There is no raw JSON-LD editor, no
// raw <meta> input and no HTML passthrough anywhere; the generated JSON-LD is shown READ-ONLY on
// the Preview tab, rendered as React text.
//
// The form is controlled (unlike the other admin screens' FormData forms) because the Preview
// tab must render the UNSAVED state live. Validation runs on every edit through the same module
// the API route uses (lib/seo/validation.ts); the server stays the authority. The preview runs
// the storefront's own resolver and JSON-LD builder, so what it shows is what will be emitted.
import { useEffect, useMemo, useState } from "react";
import type { SeoRouteOverrideData, SeoSnapshot } from "@harolds/types";
import { adminApi, AdminApiError } from "@/components/admin/admin-api";
import { SaveBar } from "@/components/admin/SaveBar";
import { AdminFormSkeleton } from "@/components/admin/AdminSkeletons";
import { DAY_NAMES, validateSeoSaveRequest, DESCRIPTION_WARN_CHARS, TITLE_WARN_CHARS } from "@/lib/seo/validation";
import { resolveRouteMeta } from "@/lib/seo/resolve";
import { jsonLdForRoute } from "@/lib/seo/jsonld";
import {
  fromSnapshot,
  previewSnapshot,
  toRequest,
  type BusinessForm,
  type DayForm,
  type DayMode,
  type SeoFormState,
} from "@/lib/seo/form";
import type { DriftReport } from "@/lib/seo/drift";
import { SEO_ADMIN_ROUTES, type SeoRouteDef } from "@/lib/seo/routes";

type AdminView = { snapshot: SeoSnapshot; drift: DriftReport; routes: SeoRouteDef[] };
type SaveResponse = AdminView & { warnings: Record<string, string>; changedFields: string[]; live: boolean };
type Tab = "business" | "site" | "pages" | "preview";
type Flash = { kind: "ok" | "err"; text: string } | null;

/** The form's shape lives in lib/seo/form.ts so its round trip can be tested without a DOM. */
type FormState = SeoFormState;

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "business", label: "Business details" },
  { key: "site", label: "Site defaults" },
  { key: "pages", label: "Pages" },
  { key: "preview", label: "Preview" },
];

const TAB_OF = (path: string): Tab => (path.startsWith("site") ? "site" : path.startsWith("routes") ? "pages" : "business");

const FIELD_LABELS: Record<string, string> = {
  displayName: "Display name",
  legalName: "Legal name",
  description: "Description",
  streetAddress: "Street address",
  addressLocality: "City",
  addressRegion: "State",
  postalCode: "Postal code",
  addressCountry: "Country",
  telephone: "Telephone",
  telephoneDisplay: "Display telephone",
  latitude: "Latitude",
  longitude: "Longitude",
  priceRange: "Price range",
  servesCuisine: "Cuisines",
  logoUrl: "Logo URL",
  imageUrl: "Business image URL",
  sameAs: "Profile links",
  isConfigured: "Configured",
  hours: "Opening hours",
  siteName: "Site name",
  canonicalHost: "Canonical host",
  defaultTitle: "Default title",
  titleTemplate: "Title template",
  defaultDescription: "Default description",
  defaultOgImageUrl: "Default share image",
  locale: "Locale",
  twitterHandle: "X / Twitter handle",
  title: "Title",
  ogImageUrl: "Share image",
  breadcrumbLabel: "Breadcrumb label",
  noindex: "Hide from search",
};

/** "business.hours.3.closes" → "Business details › Opening hours". Names the failing field. */
export function describeField(path: string): string {
  const parts = path.split(".");
  const tab = TABS.find((t) => t.key === TAB_OF(path))?.label ?? "SEO";
  if (parts[0] === "routes" && parts[1]) {
    return `${tab} › ${parts[1]} › ${FIELD_LABELS[parts[2] ?? ""] ?? "page"}`;
  }
  return `${tab} › ${FIELD_LABELS[parts[1] ?? ""] ?? path}`;
}

function FieldMsg({ error, warning, id }: { error?: string; warning?: string; id: string }) {
  if (error) {
    return (
      <span className="adm-field-err" id={id} role="alert">
        {error}
      </span>
    );
  }
  if (warning) {
    return (
      <span className="adm-field-help adm-field-warn" id={id}>
        {warning}
      </span>
    );
  }
  return null;
}

function TextField({
  label,
  path,
  value,
  onChange,
  errors,
  warnings,
  help,
  multiline = false,
  type = "text",
  placeholder,
  counter,
}: {
  label: string;
  path: string;
  value: string | null;
  onChange: (v: string) => void;
  errors: Record<string, string>;
  warnings?: Record<string, string>;
  help?: string;
  multiline?: boolean;
  type?: string;
  placeholder?: string;
  /** Show a live character count against this approximate limit. */
  counter?: number;
}) {
  const id = `seo-${path.replace(/\./g, "-")}`;
  const msgId = `${id}-msg`;
  const error = errors[path];
  const common = {
    id,
    value: value ?? "",
    placeholder,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error || warnings?.[path] ? msgId : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
  };
  return (
    <label className="adm-field" htmlFor={id}>
      {label}
      {multiline ? <textarea rows={3} {...common} /> : <input type={type} {...common} />}
      {help ? <span className="adm-field-help">{help}</span> : null}
      {counter ? (
        <span className="adm-field-help">
          {(value ?? "").length} characters · approximate limit {counter}
        </span>
      ) : null}
      <FieldMsg error={error} warning={warnings?.[path]} id={msgId} />
    </label>
  );
}

/** Warn on reload/close, and on in-app navigation (a capture-phase click guard ahead of <Link>). */
function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm("You have unsaved SEO changes. Leave without saving them?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}

export function SeoView() {
  const [view, setView] = useState<AdminView | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [tab, setTab] = useState<Tab>("business");
  const [flash, setFlash] = useState<Flash>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const adopt = (v: AdminView) => {
    setView(v);
    setForm(fromSnapshot(v.snapshot, v.routes));
    setServerErrors({});
  };

  useEffect(() => {
    adminApi<AdminView>("/api/internal/admin/seo")
      .then(adopt)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Could not load SEO settings."));
  }, []);

  const request = useMemo(() => (form && view ? toRequest(form, view.snapshot.version, view.routes) : null), [form, view]);
  const savedRequest = useMemo(
    () => (view ? toRequest(fromSnapshot(view.snapshot, view.routes), view.snapshot.version, view.routes) : null),
    [view],
  );
  const dirty = request !== null && JSON.stringify(request) !== JSON.stringify(savedRequest);
  const validation = useMemo(() => (request ? validateSeoSaveRequest(request) : null), [request]);
  const errors = { ...(validation && !validation.ok ? validation.errors : {}), ...serverErrors };
  const warnings = validation?.warnings ?? {};

  useUnsavedChangesGuard(dirty);

  if (loadError) {
    return (
      <>
        <h1 className="adm-h1">SEO</h1>
        <div className="adm-error">{loadError}</div>
      </>
    );
  }
  if (!view || !form || !request) return <AdminFormSkeleton />;

  const setBusiness = (patch: Partial<BusinessForm>) => {
    setServerErrors({});
    setForm((f) => (f ? { ...f, business: { ...f.business, ...patch } } : f));
  };
  const setSite = (patch: Partial<FormState["site"]>) => {
    setServerErrors({});
    setForm((f) => (f ? { ...f, site: { ...f.site, ...patch } } : f));
  };
  const setRoute = (key: string, patch: Partial<SeoRouteOverrideData>) => {
    setServerErrors({});
    setForm((f) => (f ? { ...f, routes: { ...f.routes, [key]: { ...f.routes[key]!, ...patch } } } : f));
  };
  const setDay = (day: number, next: DayForm) => {
    const days = form.business.days.map((d, i) => (i === day ? next : d));
    setBusiness({ days });
  };

  async function save() {
    if (!validation || !request) return;
    if (!validation.ok) {
      const [path, message] = Object.entries(validation.errors)[0]!;
      setTab(TAB_OF(path));
      setFlash({ kind: "err", text: `Not saved. ${describeField(path)}: ${message}` });
      return;
    }
    setBusy(true);
    try {
      const res = await adminApi<SaveResponse>("/api/internal/admin/seo", { method: "PUT", body: JSON.stringify(request) });
      adopt(res);
      setFlash({
        kind: "ok",
        text: res.live
          ? `Saved ${res.changedFields.length} change${res.changedFields.length === 1 ? "" : "s"}. Live on the storefront from the next page load.`
          : "Nothing had changed.",
      });
    } catch (err) {
      // The operator's work stays in the form whatever went wrong.
      if (err instanceof AdminApiError && err.details && typeof err.details.fieldErrors === "object") {
        const fieldErrors = err.details.fieldErrors as Record<string, string>;
        setServerErrors(fieldErrors);
        const [path, message] = Object.entries(fieldErrors)[0] ?? ["request", err.message];
        setTab(TAB_OF(path));
        setFlash({ kind: "err", text: `Not saved. ${describeField(path)}: ${message}` });
      } else {
        setFlash({
          kind: "err",
          text: `Not saved. ${err instanceof Error ? err.message : "The server did not respond."} Your edits are still in the form.`,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  const savedConfigured = view.snapshot.business.isConfigured;
  const b = form.business;
  const errorCount = Object.keys(errors).length;

  return (
    <>
      <h1 className="adm-h1">SEO</h1>
      <p className="adm-lead">
        What search engines and link previews say about the site. Owner only: everything here is published to Google.
      </p>

      {/* Critical rule 8. Persistent and not dismissible: it goes away only when the SAVED record is configured. */}
      {!savedConfigured ? (
        <div className="adm-banner" role="status" data-testid="seo-incomplete-banner">
          Structured data is incomplete. The business details below are placeholders, so the storefront is NOT publishing
          the restaurant&apos;s address, phone or hours to search engines. Replace every placeholder, then switch on
          “Business details are configured” and save.
        </div>
      ) : null}
      {flash ? <div className={flash.kind === "ok" ? "adm-ok" : "adm-error"}>{flash.text}</div> : null}

      <div className="adm-tabs" role="tablist" aria-label="SEO sections">
        {TABS.map((t) => {
          const count = Object.keys(errors).filter((p) => TAB_OF(p) === t.key).length;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              className="mtab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key !== "preview" && count > 0 ? <span className="adm-badge adm-badge-hot adm-tab-count">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {tab === "business" ? (
        <>
          <section className="adm-panel adm-formcard">
            <h3>Publishing</h3>
            <div className="dev-card">
              <button
                type="button"
                className="toggle"
                aria-pressed={b.isConfigured}
                aria-labelledby="seo-configured-label"
                onClick={() => setBusiness({ isConfigured: !b.isConfigured })}
              />
              <div>
                <div className="nm" id="seo-configured-label">
                  Business details are configured
                </div>
                <div className="adm-muted">
                  Off: no Restaurant schema is published at all. On: the details below are published as structured
                  data. Turning it on requires a real phone number and no placeholder text anywhere.
                </div>
                <FieldMsg error={errors["business.isConfigured"]} id="seo-configured-msg" />
              </div>
            </div>
          </section>

          <DriftPanel drift={view.drift} />

          <section className="adm-panel adm-formcard">
            <h3>Name and description</h3>
            <div className="adm-form-wide">
              <TextField label="Display name" path="business.displayName" value={b.displayName} onChange={(v) => setBusiness({ displayName: v })} errors={errors} />
              <TextField label="Legal name" path="business.legalName" value={b.legalName} onChange={(v) => setBusiness({ legalName: v })} errors={errors} />
            </div>
            <div className="adm-form" style={{ maxWidth: "none" }}>
              <TextField label="Description" path="business.description" value={b.description} onChange={(v) => setBusiness({ description: v })} errors={errors} multiline />
            </div>
          </section>

          <section className="adm-panel adm-formcard">
            <h3>Address</h3>
            <div className="adm-form-wide">
              <TextField label="Street address" path="business.streetAddress" value={b.streetAddress} onChange={(v) => setBusiness({ streetAddress: v })} errors={errors} />
              <TextField label="City" path="business.addressLocality" value={b.addressLocality} onChange={(v) => setBusiness({ addressLocality: v })} errors={errors} />
              <TextField label="State" path="business.addressRegion" value={b.addressRegion} onChange={(v) => setBusiness({ addressRegion: v })} errors={errors} />
              <TextField label="Postal code" path="business.postalCode" value={b.postalCode} onChange={(v) => setBusiness({ postalCode: v })} errors={errors} />
              <TextField label="Country (ISO code)" path="business.addressCountry" value={b.addressCountry} onChange={(v) => setBusiness({ addressCountry: v.toUpperCase() })} errors={errors} help="Two letters, e.g. US." />
              <TextField label="Latitude" path="business.latitude" value={b.latitude} onChange={(v) => setBusiness({ latitude: v })} errors={errors} type="number" help="-90 to 90" />
              <TextField label="Longitude" path="business.longitude" value={b.longitude} onChange={(v) => setBusiness({ longitude: v })} errors={errors} type="number" help="-180 to 180" />
            </div>
          </section>

          <section className="adm-panel adm-formcard">
            <h3>Contact and profile</h3>
            <div className="adm-form-wide">
              <TextField label="Telephone (E.164)" path="business.telephone" value={b.telephone} onChange={(v) => setBusiness({ telephone: v })} errors={errors} placeholder="+17085550123" help="+ then country code and number, no spaces." />
              <TextField label="Display telephone" path="business.telephoneDisplay" value={b.telephoneDisplay} onChange={(v) => setBusiness({ telephoneDisplay: v })} errors={errors} placeholder="(708) 555-0123" help="Optional. Display only; structured data uses E.164." />
              <TextField label="Price range" path="business.priceRange" value={b.priceRange} onChange={(v) => setBusiness({ priceRange: v })} errors={errors} placeholder="$" />
              <TextField label="Cuisines" path="business.servesCuisine" value={b.servesCuisine} onChange={(v) => setBusiness({ servesCuisine: v })} errors={Object.fromEntries(Object.entries(errors).filter(([p]) => p.startsWith("business.servesCuisine")).map(([, m]) => ["business.servesCuisine", m]))} help="Comma-separated, e.g. American, Chicken." />
              <TextField label="Logo URL" path="business.logoUrl" value={b.logoUrl} onChange={(v) => setBusiness({ logoUrl: v })} errors={errors} type="url" placeholder="https://" />
              <TextField label="Business image URL" path="business.imageUrl" value={b.imageUrl} onChange={(v) => setBusiness({ imageUrl: v })} errors={errors} type="url" placeholder="https://" />
            </div>
            <p className="adm-muted" style={{ margin: "8px 0" }}>Reservations: not accepted (fixed — pickup counter).</p>
            <h3 style={{ marginTop: 16 }}>Profile links (in order)</h3>
            <p className="adm-formcard-desc">Google Business Profile, Facebook, Yelp, Instagram. Each must be an https:// link.</p>
            {b.sameAs.map((url, i) => (
              <div key={i} className="adm-seo-listrow">
                <TextField
                  label={`Profile ${i + 1}`}
                  path={`business.sameAs.${i}`}
                  value={url}
                  onChange={(v) => setBusiness({ sameAs: b.sameAs.map((u, k) => (k === i ? v : u)) })}
                  errors={errors}
                  type="url"
                  placeholder="https://"
                />
                <div className="adm-seo-listrow-actions">
                  <button type="button" className="adm-btn adm-btn-ghost" disabled={i === 0} aria-label={`Move profile ${i + 1} up`} onClick={() => {
                    const next = [...b.sameAs];
                    [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                    setBusiness({ sameAs: next });
                  }}>↑</button>
                  <button type="button" className="adm-btn adm-btn-ghost" disabled={i === b.sameAs.length - 1} aria-label={`Move profile ${i + 1} down`} onClick={() => {
                    const next = [...b.sameAs];
                    [next[i + 1], next[i]] = [next[i]!, next[i + 1]!];
                    setBusiness({ sameAs: next });
                  }}>↓</button>
                  <button type="button" className="adm-btn adm-btn-danger" onClick={() => setBusiness({ sameAs: b.sameAs.filter((_, k) => k !== i) })}>Remove</button>
                </div>
              </div>
            ))}
            {b.sameAs.length < 10 ? (
              <button type="button" className="adm-btn" onClick={() => setBusiness({ sameAs: [...b.sameAs, ""] })}>Add profile link</button>
            ) : null}
          </section>

          <HoursPanel days={b.days} setDay={setDay} errors={errors} />
        </>
      ) : null}

      {tab === "site" ? (
        <section className="adm-panel adm-formcard">
          <h3>Site defaults</h3>
          <div className="dev-card">
            <div>
              <div className="nm">Canonical host</div>
              <div className="adm-seo-mono">{view.snapshot.site.canonicalHost}</div>
              <div className="adm-muted">
                Read-only. Every canonical URL, sitemap entry and structured-data ID is built on this. Changing it is a
                deployment step, not a form edit — see the operator handbook.
              </div>
            </div>
          </div>
          <div className="adm-form-wide">
            <TextField label="Site name" path="site.siteName" value={form.site.siteName} onChange={(v) => setSite({ siteName: v })} errors={errors} />
            <TextField label="Title template" path="site.titleTemplate" value={form.site.titleTemplate} onChange={(v) => setSite({ titleTemplate: v })} errors={errors} help="Must contain {pageTitle}. May contain {siteName}." />
            <TextField label="Locale" path="site.locale" value={form.site.locale} onChange={(v) => setSite({ locale: v })} errors={errors} help="e.g. en_US" />
            <TextField label="X / Twitter handle" path="site.twitterHandle" value={form.site.twitterHandle} onChange={(v) => setSite({ twitterHandle: v })} errors={errors} placeholder="@handle" help="Optional." />
          </div>
          <div className="adm-form" style={{ maxWidth: "none" }}>
            <TextField label="Default title" path="site.defaultTitle" value={form.site.defaultTitle} onChange={(v) => setSite({ defaultTitle: v })} errors={errors} warnings={warnings} counter={TITLE_WARN_CHARS} help="Used as-is on any page without its own title (including Home)." />
            <TextField label="Default description" path="site.defaultDescription" value={form.site.defaultDescription} onChange={(v) => setSite({ defaultDescription: v })} errors={errors} warnings={warnings} counter={DESCRIPTION_WARN_CHARS} multiline />
            <TextField label="Default share image URL" path="site.defaultOgImageUrl" value={form.site.defaultOgImageUrl} onChange={(v) => setSite({ defaultOgImageUrl: v })} errors={errors} type="url" placeholder="https://" help="Shown in link previews. Without one, the site logo is used." />
          </div>
        </section>
      ) : null}

      {tab === "pages" ? (
        <>
          <p className="adm-lead">
            Titles here are page titles; the site title template is applied to them. Leave a field blank to use the
            site default. There are no category or item pages yet — the whole menu is one page — so there are no page
            templates to edit and no breadcrumbs are published.
          </p>
          {SEO_ADMIN_ROUTES.map((r) => {
            const route = form.routes[r.key]!;
            const p = `routes.${r.key}`;
            return (
              <section key={r.key} className="adm-panel adm-formcard">
                <h3>
                  {r.label} <span className="adm-seo-mono adm-muted">{r.path}</span>{" "}
                  {r.indexable && !route.noindex ? (
                    <span className="adm-badge adm-badge-ok">In search</span>
                  ) : (
                    <span className="adm-badge">Hidden from search</span>
                  )}
                </h3>
                <p className="adm-formcard-desc">{r.note}</p>
                <div className="dev-card">
                  <button
                    type="button"
                    className="toggle"
                    aria-pressed={route.noindex}
                    aria-label={`Hide ${r.label} from search engines`}
                    disabled={!r.indexable}
                    onClick={() => setRoute(r.key, { noindex: !route.noindex })}
                  />
                  <div>
                    <div className="nm">Hide from search engines</div>
                    <div className="adm-muted">
                      {r.indexable
                        ? "On: marked noindex and removed from the sitemap."
                        : "Always on for this page. It is noindex, left out of the sitemap and blocked in robots.txt."}
                    </div>
                    <FieldMsg error={errors[`${p}.noindex`]} id={`seo-${r.key}-noindex-msg`} />
                  </div>
                </div>
                <div className="adm-form" style={{ maxWidth: "none" }}>
                  <TextField label="Title" path={`${p}.title`} value={route.title} onChange={(v) => setRoute(r.key, { title: v })} errors={errors} warnings={warnings} counter={TITLE_WARN_CHARS} />
                  <TextField label="Description" path={`${p}.description`} value={route.description} onChange={(v) => setRoute(r.key, { description: v })} errors={errors} warnings={warnings} counter={DESCRIPTION_WARN_CHARS} multiline />
                </div>
                <div className="adm-form-wide">
                  <TextField label="Share image URL" path={`${p}.ogImageUrl`} value={route.ogImageUrl} onChange={(v) => setRoute(r.key, { ogImageUrl: v })} errors={errors} type="url" placeholder="https://" />
                  <TextField label="Breadcrumb label" path={`${p}.breadcrumbLabel`} value={route.breadcrumbLabel} onChange={(v) => setRoute(r.key, { breadcrumbLabel: v })} errors={errors} help="Stored for when category/item pages exist. Nothing shows a breadcrumb today." />
                </div>
              </section>
            );
          })}
        </>
      ) : null}

      {tab === "preview" ? <PreviewPanel form={form} view={view} dirty={dirty} /> : null}

      <SaveBar open={dirty} busy={busy} label="Save SEO settings" onSave={save} onDiscard={() => {
        setForm(fromSnapshot(view.snapshot, view.routes));
        setServerErrors({});
        setFlash(null);
      }}>
        {errorCount > 0
          ? `Unsaved SEO changes — ${errorCount} field${errorCount === 1 ? "" : "s"} to fix first.`
          : "Unsaved SEO changes."}
      </SaveBar>
    </>
  );
}

function DriftPanel({ drift }: { drift: DriftReport }) {
  return (
    <section className="adm-panel adm-formcard" data-testid="seo-drift-panel">
      <h3>Compared with the store record</h3>
      <p className="adm-formcard-desc">
        The address, phone and hours here are a separate record from the ones in Store settings, on purpose. They are
        compared, never synced: if they disagree, edit whichever one is wrong. Compared against the SAVED SEO record.
      </p>
      {drift.inAgreement ? (
        <div className="adm-ok">The SEO record agrees with the store record on address, phone and hours.</div>
      ) : (
        <div className="adm-warn" role="status">
          <div>
            <strong>
              {drift.differences.length} difference{drift.differences.length === 1 ? "" : "s"} with the store record:
            </strong>{" "}
            {drift.differences.map((d) => `${d.label} (SEO: “${d.seo}” · Store: “${d.store}”)`).join("; ")}.
          </div>
        </div>
      )}
      <div className="adm-table-wrap">
        <table className="adm-table adm-seo-static">
          <thead>
            <tr>
              <th>Field</th>
              <th>SEO record</th>
              <th>Store record</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {drift.rows.map((row) => (
              <tr key={row.field}>
                <td>{row.label}</td>
                <td>{row.seo}</td>
                <td>{row.store}</td>
                <td>
                  {row.agrees ? (
                    <span className="adm-badge adm-badge-ok">Agrees</span>
                  ) : (
                    <span className="adm-badge adm-badge-hot">Differs</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HoursPanel({
  days,
  setDay,
  errors,
}: {
  days: DayForm[];
  setDay: (day: number, next: DayForm) => void;
  errors: Record<string, string>;
}) {
  // Validation indexes hours in the flattened order; track it while rendering.
  let index = 0;
  return (
    <section className="adm-panel adm-formcard">
      <h3>Opening hours (published)</h3>
      <p className="adm-formcard-desc">
        “Not set” publishes nothing for that day. “Closed” publishes the day as closed. A day may have several ranges;
        tick “Closes next day” for a range that runs past midnight.
      </p>
      {days.map((d, day) => {
        const base = index;
        if (d.mode === "closed") index += 1;
        if (d.mode === "open") index += d.ranges.length;
        const dayErrors = Object.entries(errors).filter(([p]) => {
          const m = p.match(/^business\.hours\.(\d+)/);
          return m && Number(m[1]) >= base && Number(m[1]) < index;
        });
        return (
          <div key={day} className="adm-seo-hours">
            <div className="nm">{DAY_NAMES[day]}</div>
            <label className="adm-field">
              <span className="sr-only">{DAY_NAMES[day]} status</span>
              <select
                value={d.mode}
                onChange={(e) => {
                  const mode = e.target.value as DayMode;
                  setDay(day, { mode, ranges: mode === "open" ? (d.ranges.length ? d.ranges : [{ opens: "10:30", closes: "23:00", overnight: false }]) : [] });
                }}
              >
                <option value="unset">Not set</option>
                <option value="closed">Closed</option>
                <option value="open">Open</option>
              </select>
            </label>
            <div>
              {d.mode === "open"
                ? d.ranges.map((r, k) => (
                    <div key={k} className="adm-seo-range">
                      <label className="adm-field">
                        Opens
                        <input type="time" value={r.opens} aria-invalid={errors[`business.hours.${base + k}.opens`] ? true : undefined} onChange={(e) => setDay(day, { ...d, ranges: d.ranges.map((x, j) => (j === k ? { ...x, opens: e.target.value } : x)) })} />
                      </label>
                      <label className="adm-field">
                        Closes
                        <input type="time" value={r.closes} aria-invalid={errors[`business.hours.${base + k}.closes`] ? true : undefined} onChange={(e) => setDay(day, { ...d, ranges: d.ranges.map((x, j) => (j === k ? { ...x, closes: e.target.value } : x)) })} />
                      </label>
                      <label className="adm-field adm-seo-check">
                        <input type="checkbox" checked={r.overnight} onChange={(e) => setDay(day, { ...d, ranges: d.ranges.map((x, j) => (j === k ? { ...x, overnight: e.target.checked } : x)) })} />
                        Closes next day
                      </label>
                      {d.ranges.length > 1 ? (
                        <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setDay(day, { ...d, ranges: d.ranges.filter((_, j) => j !== k) })}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))
                : null}
              {d.mode === "open" && d.ranges.length < 4 ? (
                <button type="button" className="adm-btn adm-btn-ghost" onClick={() => setDay(day, { ...d, ranges: [...d.ranges, { opens: "", closes: "", overnight: false }] })}>
                  Add a range
                </button>
              ) : null}
              {dayErrors.map(([p, m]) => (
                <span key={p} className="adm-field-err" role="alert">
                  {m}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** Split pretty-printed JSON into tokens for read-only highlighting. React renders them as TEXT. */
function highlightJson(json: string) {
  const out: React.ReactNode[] = [];
  const re = /("(?:\\.|[^\\"])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(json))) {
    if (m.index > last) out.push(json.slice(last, m.index));
    if (m[1]) {
      out.push(<span key={k++} className={m[2] ? "k" : "s"}>{m[1]}</span>);
      if (m[2]) out.push(m[2]);
    } else if (m[3]) out.push(<span key={k++} className="b">{m[3]}</span>);
    else out.push(<span key={k++} className="n">{m[4]}</span>);
    last = re.lastIndex;
  }
  out.push(json.slice(last));
  return out;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

function PreviewPanel({ form, view, dirty }: { form: FormState; view: AdminView; dirty: boolean }) {
  const [routeKey, setRouteKey] = useState("home");
  // The snapshot the storefront WOULD read if this form were saved now — same helper the
  // round-trip and preview-fidelity tests use.
  const snapshot = previewSnapshot(form, view.snapshot, view.routes);
  const omitted: string[] = [];
  const resolved = resolveRouteMeta(snapshot, routeKey);
  const graph = jsonLdForRoute(snapshot, resolved, (node, reason) => omitted.push(`${node}: ${reason}`));
  const display = resolved.url.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/").join(" › ");

  return (
    <section className="adm-panel adm-formcard">
      <h3>Preview {dirty ? <span className="adm-badge adm-badge-hot">unsaved changes</span> : null}</h3>
      <p className="adm-formcard-desc">Read-only. Built from the form as it is now, by the same code the storefront runs.</p>
      <label className="adm-field" style={{ maxWidth: 320 }}>
        Page
        <select value={routeKey} onChange={(e) => setRouteKey(e.target.value)}>
          {SEO_ADMIN_ROUTES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <h3 style={{ marginTop: 20 }}>Search result</h3>
      {resolved.indexable ? (
        <div className="adm-seo-snippet" data-testid="seo-snippet">
          <div className="url">{display}</div>
          <div className="ttl">{truncate(resolved.title, TITLE_WARN_CHARS)}</div>
          <div className="desc">{truncate(resolved.description, DESCRIPTION_WARN_CHARS)}</div>
        </div>
      ) : (
        <p className="adm-muted">This page is hidden from search engines, so it has no search result.</p>
      )}
      <p className="adm-field-help">
        Truncation is approximate: Google cuts by pixel width, around {TITLE_WARN_CHARS} characters for titles and{" "}
        {DESCRIPTION_WARN_CHARS} for descriptions. Title source: {resolved.titleSource}.
      </p>

      <h3 style={{ marginTop: 20 }}>Structured data (JSON-LD)</h3>
      {graph ? (
        <pre className="adm-jsonld" data-testid="seo-jsonld" aria-label="Generated JSON-LD, read-only">
          {highlightJson(JSON.stringify(graph, null, 2))}
        </pre>
      ) : (
        <p className="adm-muted">None: a hidden page emits no structured data.</p>
      )}
      {omitted.length > 0 ? (
        <div className="adm-warn">
          <div>
            <strong>Not published:</strong> {omitted.join(" · ")}
          </div>
        </div>
      ) : null}
    </section>
  );
}
