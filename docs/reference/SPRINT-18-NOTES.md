<!-- SPRINT-18: SEO foundation and admin SEO configuration. This is a NEW file at a reused path:
     the earlier "Sprint 18 — SMS and Twilio Removed" notes were folded into SPRINT-17-NOTES.md
     (see its §14 item 5) and that file was deleted. Nothing here revives the SMS notes. -->

# Sprint 18 — SEO foundation and admin SEO configuration

Status is kept at the top and updated as phases close.

| Phase | Owner | State |
|---|---|---|
| 0 Prerequisites and inventory | Agent | Complete |
| 1 SEO data model | Agent | Complete |
| 2 JSON-LD graph builder | Agent | Complete |
| 3 Per-route metadata | Agent | Complete |
| 4 robots.txt and sitemap.xml | Agent | Complete |
| 5 Admin SEO section | Agent | Complete in code — proven at the data and API layer; **the screen itself has not been rendered in a browser** (§5.1) |
| 6 Cache invalidation | Agent | Complete |
| 7 Contract, tests, documentation | Agent | Complete — **except** the pre-existing `openapi:validate` failure (F4) |
| 8 Deploy and verify | **Operator** | Not started — not the agent's |
| 9 Suite, blast radius, handover | Agent | Complete |

Environment, stated once: a Windows development machine, local PostgreSQL (`harolds` database),
Node v24.11.0 (the root `engines` field still says `22.x`; `DEPLOYMENT.md` says 24.x), pnpm 9.15.0.
No production access. Nothing in this sprint touched production.

---

## 0. Phase 0 findings

### 0.1 Sprint state

**Sprint 17 — NMI is the payment provider, and the tree is stable.** Square is gone
(`e9e4b60 Added NMI and removed square.`); `apps/web/src/lib/webhooks-nmi.ts`,
`/api/v1/webhooks/nmi`, `nmi-payment-form.tsx` and the `20260915120000_sprint17_nmi_charge_claim`
migration are present, and `prisma migrate status` reports all 14 migrations applied. The
uncommitted diff in the working tree at the start of this sprint is Sprint 17's own retagging of
the SMS removal from "SPRINT-18" to "SPRINT-17" (31 files, plus the staged deletion of the old
`SPRINT-18-NOTES.md`, `packages/db/src/__check.ts` and `packages/payments/src/__probe.ts`). It is
coherent and was **left exactly as found**: not committed, not reverted, not continued.

**Sprint 15 — halted at Phase 1, but the admin is already on design v1.1.** `SPRINT-15-NOTES.md`
records the stop and says no code changed. The admin reskin landed afterwards through ordinary
commits (`38c0a0d UI revamp`, `06383d0 Refactor … for Burnham`, `6785c5b Improved validation and
UI`): `app/(admin)/admin.css` opens with *"ADMIN SCOPE — design v1.1, ported from
harolds-design-v1_1.html"*, and the shell, `SaveBar`, `adm-panel`, `badge`, `toggle` primitives
all come from it. **The SEO section is built on design v1.1** — the `adm-*` primitives in
`admin.css` and the tokens in `globals.css` — and is mirrored into `harolds-design-v1_1.html`.

**Local environment runs.** `@prisma/client` generated into `packages/db/src/generated/prisma`;
database migrated ("Database schema is up to date!"); seed data present. Baseline suite before
any Sprint 18 change: **401 tests, 0 failures** (config 31, email 4, payments 19, print 25,
pricing 65, db 145, notify 17, web 95). Baseline `pnpm build` passed.

### 0.2 Route inventory

| Route | Rendering | Indexable | Reason |
|---|---|---|---|
| `/` | server component, dynamic | **Yes** | Home |
| `/menu` | server component, dynamic | **Yes** | The whole menu, one page |
| `/checkout` | `"use client"` page | No | Transactional; cart contents |
| `/order/[lookupToken]` | `"use client"` page | No | Order status **and** confirmation (one route): customer name-adjacent data, order lines, pickup time |
| `/design-system` | `"use client"`, `notFound()` in production | No | Internal showcase |
| `/admin/*`, `/admin/signin` | admin route group | No | Back office |
| `/kitchen` | kitchen route group | No | Kitchen display |
| `/cart` | **does not exist** | — | The cart is a sheet on every page, not a route. `robots.txt` disallows `/cart` anyway, as asked, so a future route inherits the block. |

1. **Per-category URLs: no. Per-item URLs: no.** The menu is one page; the category rail links to
   hash anchors (`category-rail.tsx:23` → `/menu#cat-${cat.id}`) and items open in a modal. The
   API has `/api/v1/menu/categories/{categorySlug}/items/{itemSlug}`, but that is a JSON endpoint,
   not a page.
2. Consequence, as the prompt directs: **no `BreadcrumbList` is emitted anywhere** (the homepage
   is excluded by rule, and `/menu` would be a one-entry trail pointing at itself — the same
   meaningless case), **the sitemap is `/` and `/menu` only**, and **no dynamic-route templates
   are stored**, because there is no dynamic indexable route to template. The resolver still
   implements the template level of the fallback chain and it is tested, so the first category
   route plugs in without redesign. The missing route structure is a finding (§F1) and is in
   `SPRINT-18-OUTSTANDING.md`.
3. **Metadata before this sprint:** the root layout exported a static `title` / `description`
   (`"Harold's Chicken Burnham"`), so every storefront route — including checkout and order
   status — rendered the same title and no canonical, no Open Graph, no Twitter card, no JSON-LD.
   Admin and kitchen layouts set their own titles. No `metadataBase` anywhere.
4. **Crawlability before this sprint:** only the admin layout set `robots: noindex, nofollow`.
   **Checkout, order status, and the kitchen display were all indexable**, and there was no
   `robots.txt` (404) and no `sitemap.xml` (404). Confirmed from the rendered HTML of a baseline
   production build (§0.5). Admin and kitchen are not linked from the storefront, but nothing
   told a crawler to stay out if it found them (§F2).

### 0.3 Infrastructure

1. **Canonical host: `https://haroldsburnham.com`**, apex. `www` redirects to it. The repository
   did not establish this — `.env` has `NEXT_PUBLIC_APP_URL="http://localhost:3000"`, every doc
   uses a `https://<domain>` placeholder, and `LAUNCH-BLOCKERS.md` row 3 still says the domain is
   "not supplied" — so the sprint **stopped and asked**. The operator answered with the host and
   the redirect direction. No `metadataBase` was set anywhere before this sprint.
2. **Process topology.** Storefront, admin, kitchen and API are route groups in the single
   `apps/web` Next application (`app/(storefront)`, `app/(admin)`, `app/(kitchen)`, `app/(api)`);
   one `next.config.ts`, one build, one server. **pm2 mode: fork, 1 instance** — source: **the
   operator's answer** in this session, not `pm2 describe` output. The repository could not
   establish it: there is no ecosystem file in the tree or its history
   (`git log --all -S ecosystem` and `-S pm2` are both empty), pm2 is not installed here, and the
   agent has no VPS access. The docs also **contradict each other**: `DEPLOYMENT.md` §2 describes
   a **systemd** unit running `node server.js`, while `SPRINT-17-NOTES.md` §12 records the
   operator running `pm2 restart harolds --update-env`. The operator's answer settles the mode;
   `DEPLOYMENT.md` is stale on the supervisor (§F3). Phase 8 should still paste the
   `pm2 describe harolds` output into the notes.
3. **Store record.** `StoreConfig` (singleton, `id = "default"`, `StoreConfig_singleton_check`):
   `storeName`, `addressLine1`, `addressLine2`, `city`, `state`, `postalCode`, `contactPhone`,
   `timezone` (IANA). Hours are a separate table, `StoreHours`: one row per `dayOfWeek` (0 = Sun),
   `openTime` / `closeTime` as `"HH:mm"` wall-clock, `isClosed`, and close < open meaning the
   session crosses midnight. One-off closures are `StoreClosure`; temporary changes are
   `TradingOverride`. Seeded values: `4709 W 95th St, Burnham, IL 60453-2515`,
   `contactPhone = "TODO: CONFIRM PHONE"`, 10:30–23:00 every day. The drift detector compares
   against `StoreConfig` address/phone and `StoreHours`.
4. **Roles.** `AdminRole` = `OWNER`, `MANAGER`, `STAFF`. `STAFF` has no back-office access at all
   (every registry entry is MANAGER or OWNER, enforced by `admin-routes.test.ts`). **`OWNER` is
   the highest role and gates the SEO section**, alongside Staff and Audit, which are already
   owner-only in both `admin-route-registry.ts` and the nav.
5. **Jobs.** `BackgroundJob` with `JobType` (Postgres enum: `SMS_ORDER_READY`,
   `SMS_ORDER_CONFIRMATION` — both retired to permanent skips — `EMAIL_ORDER_RECEIPT`,
   `EMAIL_ORDER_READY`, four `ALERT_MANAGER_*`), `JobStatus` (`PENDING`, `RUNNING`, `SUCCEEDED`,
   `FAILED` = will retry, `DEAD` = attempt ceiling, `CANCELLED`), `maxAttempts` default 5,
   `runAfter` pushed forward for backoff, polled in-process from `instrumentation.node.ts`.
   **Phase 6 does not use it** — see §6. Worth stating for the cluster-mode question: the job
   worker, print sweeper, kitchen sweeper and reconcile scheduler all start inside the one Node
   process, so cluster mode would also run N copies of each. That is a pre-existing reason fork
   mode is the only correct mode for this app, independent of SEO.

### 0.4 Admin write path — what "server action" means here

There are **no server actions in this codebase** (`grep "use server"` is empty). The admin is a
client SPA (`AdminApp.tsx`) calling `/api/internal/admin/*` route handlers behind a default-deny
role registry. The SEO section follows that pattern: an OWNER-gated internal route handler does
what the prompt calls "the admin server action", and calls `revalidateTag` in-process after the
transaction commits. See §6 and deviation D1.

### 0.5 Baseline measurements (before any Sprint 18 change)

`pnpm build`, then `next start -p 3000` against the local database, rendered HTML fetched with
curl:

| Route | Route JS | First Load JS | HTML bytes |
|---|---|---|---|
| `/` | 1.73 kB | 126 kB | 73,315 |
| `/menu` | 2.02 kB | 127 kB | 137,849 |
| `/checkout` | 10.3 kB | 129 kB | 23,478 |
| `/order/[lookupToken]` | 2.38 kB | 121 kB | 21,317 |
| `/kitchen` | 5.2 kB | 108 kB | 9,239 |
| `/admin/[[...slug]]` | 14 kB | 123 kB | 10,786 |
| shared by all | | 103 kB | |
| `/robots.txt`, `/sitemap.xml` | — | — | 404 |

---

## 1. Phase 1 — the data model

One migration, `20260919120000_sprint18_seo`, additive only: four new tables; no existing table,
column, index or constraint touched.

- **`SeoBusiness`** — singleton (`id = 'default'`, CHECK), the facts that become the `Restaurant`
  node. CHECK constraints pin `acceptsReservations = false` and bound latitude/longitude, so even a
  hand-edited row cannot hold an impossible coordinate.
- **`SeoOpeningHours`** — structured rows, several per day allowed. **A day with no rows is unset
  and claims nothing; a row with `isClosed` is an explicit closed day.** `overnight` marks a range
  that ends the next day.
- **`SeoSiteDefaults`** — singleton: site name, canonical host, default title, title template,
  default description, OG image, locale, X handle, and the monotonic **`version`**.
- **`SeoRouteOverride`** — keyed on the stable route key from `apps/web/src/lib/seo/routes.ts`,
  never a raw path.

**Reversibility** is `packages/db/prisma/rollbacks/20260919120000_sprint18_seo.down.sql`, and it was
proven rather than asserted. On a scratch database (`harolds_s18_scratch`): the migration applied;
`prisma migrate diff` reported **no difference** against `schema.prisma`; the down script ran; a
second diff reported **no difference against the pre-sprint schema at HEAD**; the migration
re-applied cleanly. The scratch database was dropped. The same down script then ran twice more
against the development database while the seed was corrected.

**The seed lives in the migration, not in `pnpm db:seed`**, because the seed refuses to run against
a database that has orders — i.e. production — and production needs these rows. Every free-text
business field is visibly `PLACEHOLDER`; the fields that cannot hold the word (phone, coordinates,
URLs) are **NULL rather than invented**, and no opening hours are seeded at all. `isConfigured` is
seeded `false`.

> A defect the tests caught, worth recording: the first seed used `'PLACEHOLDER postal code'`
> (23 characters) against a 20-character validation limit, so an operator's very first save would
> have failed on a field they had not touched. The seed is now `'PLACEHOLDER ZIP'`.

**Validation** (`apps/web/src/lib/seo/validation.ts`) is one module used by both the API route (the
authority) and the admin form (immediate feedback). Requirements are two-tier: format rules apply
to every non-empty value always; the fields a `Restaurant` cannot exist without are required only
once `isConfigured` is switched on — and at that point **no field may still contain the word
PLACEHOLDER**. Title and description length are **warnings, never errors** (see §7).

**Audit and version** are written in the same transaction as the change: one `AdminAuditLog` row per
changed field (`action: "SEO_UPDATE"`, `details: { field, before, after, version }`), attributed to
the acting user, plus `SeoSiteDefaults.version` incremented. A save that changes nothing writes
nothing and does not bump the version. A stale `expectedVersion` is a **409 conflict**, never a
silent overwrite — the row is locked `FOR UPDATE` first, so two concurrent saves serialise.

## 2. Phase 2 — the JSON-LD builder

`apps/web/src/lib/seo/jsonld.ts` is the only module in the repository that constructs schema.org
data, and a test enforces it by scanning every `.ts`/`.tsx` file under `apps/web/src` and
`packages` for `"@context"`, a `"@type":` key, and `application/ld+json`.

**`Restaurant`, and no `Organization` node.** `Restaurant` is a subtype of `FoodEstablishment` →
`LocalBusiness` → `Organization`, so the organisation-level properties (`legalName`, `logo`,
`sameAs`, `telephone`) belong on it. A sibling `Organization` describing the same business splits
the entity in Google's eyes and is a net negative. This is a deliberate deviation from the original
request; the reason is entity consolidation.

Also deliberate: **no `SearchAction`** (Google deprecated the sitelinks searchbox), and
`acceptsReservations: false` stated explicitly rather than implied.

**Omission over invention.** A node missing any required value is dropped whole with a logged
reason, never emitted with an empty or fabricated one. Optional properties are simply absent when
unset, and every omission is logged at debug level (`seo.jsonld.node_omitted`). Defence in depth
behind validation: a row marked configured **by hand in the database** that still contains
`PLACEHOLDER` in a required field also drops the node.

**The CSP does not block it.** A `<script>` with a non-JavaScript type is a data block, not an
executable script, so the inline-script rules never apply to it; and this app's policy allows
`'unsafe-inline'` on `script-src` regardless, with no `require-trusted-types-for` directive.
Checked against the header the running app actually serves, so the next reader does not have to
re-derive it. No CSP change was needed or made.

**Serialisation.** `JSON.stringify`, then `<`, `>`, `&`, U+2028 and U+2029 escaped to `\uXXXX`
before the string reaches the `<script>` tag. The escaped form parses back to the identical value,
so the escaping changes nothing a consumer reads.

**Schema.org validation is real, and local.** `apps/web/scripts/sprint18-schema-validate.ts` reads
schema.org's own published vocabulary (`schemaorg-current-https.jsonld`, 3,256 definitions) and
checks every node type, every property, every property's `domainIncludes` against the node's type
and its ancestors, and every value against `rangeIncludes` — including enumeration members given by
label, which is how `dayOfWeek: "Monday"` is written. Both emitted graphs pass. The validator was
itself checked against a deliberately broken graph and caught all five planted faults (unknown
type, unknown property, wrong domain, wrong literal type, invalid enumeration member).

## 3. Phase 3 — per-route metadata

`metadataBase` is set once, in the root layout, from `SeoSiteDefaults.canonicalHost`.

**The fallback chain** (`apps/web/src/lib/seo/resolve.ts`), in order:

1. the route's **override** title/description, if non-empty → run through the site title template;
2. the **dynamic-route template** with its tokens substituted → also through the title template;
3. the **site default** title, used as-is (it is already a whole title, so templating it would
   produce "Harold's Chicken Burnham | Harold's Chicken Burnham");
4. the **site name**, with `seo.metadata.title_fallback_to_site_name` logged as a warning.

A route therefore never emits an empty title. A template whose token has no value falls through
rather than rendering literal `{braces}`. **Level 2 has no producer today** — there are no dynamic
indexable routes — so it is proven by unit test and waits for the first category route.

Client components forced one structural change, metadata-only and not touching the ordering path:
`/checkout` and `/order/[lookupToken]` are `"use client"` pages and cannot export metadata, so each
gained a sibling **server `layout.tsx` that exports `generateMetadata` and renders its children
untouched**. `/design-system` gained the same for its `noindex`.

Share images resolve override → site default → the business image (only once configured) →
`/logo.jpeg`, the site's own mark, so `og:image` is never absent. The logo is not a claim about the
business, so it is safe to use before the business record is reviewed.

## 4. Phase 4 — robots.txt and sitemap.xml

Both are generated (they carry the canonical host, which is configuration) and both are
`force-dynamic` — see §6.2 for why that is load-bearing.

`/api/v1/media/` is explicitly **allowed** while `/api/` is disallowed. That is a deviation: menu
photographs and the share image are served from that path, Twitterbot obeys `robots.txt`, and
blocking it would stop menu photos being indexed and link previews rendering. Longest-match wins,
so the `Allow` carves the media path out of the API block. Nothing blocks `/` or `/menu` — checked
explicitly, because a stray `Disallow: /` inherited from staging is the most common way a site
stays invisible.

The sitemap contains only routes whose **resolved metadata** is indexable — the same resolver the
pages use — so "listed in the sitemap" and "marked noindex" cannot disagree; a test walks both
lists in both directions, and the end-to-end run walks them against the running server.
`lastModified` is the newest real record timestamp (the route row, site defaults, the business row
**only when configured**, and the menu's own `updatedAt` aggregate), never the build or request
time. `changefreq` and `priority` are omitted; Google ignores both.

**Sitemap validation is structural, not XSD.** The served XML is checked against the sitemaps.org
0.9 requirements — XML declaration and UTF-8, root `urlset` carrying the 0.9 namespace, one
`loc` per `url`, no foreign child elements, every `loc` absolute and under 2048 characters and
XML-safe, every `lastmod` a W3C datetime, entry count and document size within the 50,000 / 50 MB
limits, and no `changefreq` or `priority` — and the entry set is checked again as data in the unit
tests. It was **not** run through an XSD validator: that needs a dependency this sprint should not
add, and the operator's Phase 8 pass through Search Console is the authoritative check.

A noindex page is deliberately **not** added to `robots.txt`: a crawler blocked from fetching a
page never sees the `noindex` on it. The three independent controls apply to the permanently
private routes (checkout, order status), which are noindex **and** out of the sitemap **and**
disallowed.

## 5. Phase 5 — the admin SEO section

A new OWNER-only section built from design v1.1's existing parts — `adm-panel`, `adm-formcard`,
`dev-card`, `toggle`, `adm-badge`, `adm-table`, the floating `SaveBar`, and the storefront's own
`.mtab` for the tab row, so the admin gains no new tab language. Mirrored into
`harolds-design-v1_1.html` (329 lines added, nothing removed).

Four tabs: **Business details** (NAP, geo, cuisines, price range, hours, profile links, the
`isConfigured` toggle and the drift panel), **Site defaults** (canonical host shown read-only),
**Pages** (per-route overrides and the noindex toggle, locked on for routes the code fixes as
non-indexable), **Preview** (read-only).

**Structured fields only.** Every input is a text, URL, number, time, select or toggle control
whose value is validated as data. There is no raw JSON-LD editor, no raw HTML and no raw `<meta>`
input anywhere in the section — the generated JSON-LD is displayed read-only, rendered as React
text with syntax colouring applied by wrapping tokens in spans, never by injecting markup.

The form is **controlled**, unlike the other admin screens' `FormData` forms, because the Preview
tab renders unsaved state through the storefront's own resolver and builder. Client-side validation
runs on every edit from the same module the server uses; the server remains the authority. A failed
save keeps the operator's work in the form and names the failing field (tab, label, message), and
unsaved changes warn on reload and on in-app navigation (a capture-phase click guard that runs
ahead of `<Link>`).

**The drift panel** compares the SEO record against `StoreConfig` (address, phone) and `StoreHours`
(the weekly schedule), showing both values side by side and naming every difference. It is
forgiving about formatting — case, spacing, `.` and `,`, ZIP vs ZIP+4 — and strict about substance.
There is **no sync button in either direction** (Critical rule 7): the operator resolves a
difference by editing whichever record is wrong. One-off closures and trading overrides are
temporary and have no structured-data counterpart, so they are not compared.

A manager who reaches `/admin/seo` gets an explicit owner-only notice rather than the blank screen
the existing Staff section shows a non-owner, and the API refuses them independently.

### 5.1 What is proven about this screen, and what is not

**Not proven: the rendered screen.** There is no browser driver on this machine — Sprint 15
established that and rejected installing one — and the admin is behind authentication, so nothing
here clicked a tab, typed in a field or looked at the drift panel. Every claim about the SEO
screen is a claim about its data and its API, not its pixels. Specifically **not** verified:
that each control is wired to the field it is labelled with, that the tab switching works, that
the layout holds at any width, and that the unsaved-changes guard actually fires. Those belong to
the operator's first visit in Phase 8, and are listed there.

**Proven, and how:** the API refuses a manager and serves an owner (403 / 200 against the running
app); a save persists, bumps the version and writes attributed audit rows; `isConfigured` false
then true changes what the storefront emits; the drift detector's rows and differences come from
the same function the panel renders. The form's own logic is extracted into
`apps/web/src/lib/seo/form.ts` and tested directly, which covers the two things most likely to
break unseen: the **round trip** (loading a snapshot into the form and converting it back yields
exactly the canonical save body — otherwise the screen would look dirty the instant it loaded and
a save nobody intended would rewrite values, including hours, where unset / closed / multi-range /
overnight days must each survive), and **preview fidelity** (the preview's snapshot, run through
the storefront's own resolver and builder, produces the same graph the storefront would emit).

## 6. Phase 6 — cache invalidation

### 6.1 Reading

Every storefront consumer — route metadata, the JSON-LD builder, `sitemap.xml`, `robots.txt` —
reads through **one** accessor, `getSeoSnapshot()` in `apps/web/src/lib/seo/data.ts`, an
`unstable_cache` tagged `seo`. A test asserts that the only files mentioning the SEO tables are
that accessor, the database layer, and the admin route. The admin route reads the **uncached** rows
on purpose: an editor working from a cached copy would save against a stale version.

**Backstop `revalidate`: 3600 s.** With tag invalidation working it never fires. It exists so that a
bug in the invalidation path degrades to *stale for up to an hour* instead of *stale until
restart*. An hour is short enough that a wrong public business fact is corrected within the same
service, and long enough that the cache still does its job. If the database cannot be read at all
the accessor logs and returns a fallback snapshot with `isConfigured: false`: an outage degrades to
*no structured data*, never to a 500 on every storefront page, and the failure is not cached.

### 6.2 Writing

`saveSeoSettings` validates, calls the transactional write, and **only then** calls
`revalidateTag("seo")`. The transaction function resolves after commit, so the ordering is
structural rather than a comment. A test proves it twice: the recorded event order is
`["committed", "revalidate:seo"]`, and at the moment the revalidation callback runs a **separate
database connection** already sees the new version — which an in-transaction revalidation could not
(READ COMMITTED). A save that changes nothing does not revalidate.

**Which surfaces the tag actually reaches, checked rather than assumed.** `sitemap.ts` and
`robots.ts` would be **prerendered at build time** by default in Next 15 — exactly the "cached by a
mechanism the tag does not reach" case — so both are `export const dynamic = "force-dynamic"`, and
the tagged accessor is then the only cache in front of them. `/checkout` and `/design-system` stay
statically prerendered (the build reports them with a 1 h revalidate inherited from the accessor),
and the end-to-end run shows the tag **does** reach them: a checkout title change appeared on the
very first request after the save.

### 6.3 The cluster-mode branch

**pm2 mode: fork, one instance** — the operator's answer, not `pm2 describe` output (§0.3). In fork
mode `revalidateTag` is correct, and Phase 6 proceeded as written. If the mode is ever found to be
**cluster**, this design is wrong: the tag reaches only the worker that handled the save, and the
bug is invisible in testing because a single request usually lands on that worker. The three routes
then available, unchanged from the prompt: (1) run in fork mode, almost certainly sufficient for
this traffic and the simplest correct answer; (2) a shared Next cache handler backed by the
existing Postgres — no Redis, that constraint stands from Sprint 1; (3) accept a short TTL with no
tag invalidation and state the staleness window plainly. **Option 1 is the recommendation**, and
not only for SEO: the job worker, print sweeper, kitchen sweeper and reconcile scheduler all start
inside the Node process, so cluster mode would run N copies of each.

### 6.4 The canonical host

It is read-only in the admin and **rejected by the API** (400, "The canonical host is a deployment
setting"), so changing it is a database update plus a deploy. The end-to-end run records the honest
consequence: after a direct database update the storefront still served the old host — the cache is
genuinely caching — and the new host reached route metadata, the JSON-LD `@id`s, `sitemap.xml` and
the `robots.txt` `Sitemap:` line as soon as the next admin save revalidated the tag. Without a save
it would take the backstop hour. Procedure for the operator: update the row, bump `version`, then
either make any SEO save or accept up to an hour.

### 6.5 What this phase did NOT add

No new environment variable, no new HTTP endpoint for invalidation, no shared secret, no signed
request, no retry job, no new `JobType`. Invalidation is a function call in the same process.

## 7. Phase 7 — contract and tests

**No API surface change.** No endpoint added, changed or removed; the contract version does not
move. `docs/openapi/v1.yaml` documents only `/api/v1/*`, and this sprint's diff to it is **empty**
(the single changed line in the working tree is Sprint 17's own `SPRINT-18 → SPRINT-17` comment
retag). The drift check passes: 12 paths, unchanged. The admin SEO route is an internal admin route
(`/api/internal/admin/seo`), the same class as every other admin endpoint, declared OWNER in the
default-deny registry, and outside the documented contract — see deviation D1.

**The OpenAPI document itself validates.** `SwaggerParser.validate()` runs first in
`openapi-validate.ts` and passes — checked directly: *"Harold's Chicken Oak Lawn — Public API |
version 1.3.0 | 12 paths"*. What fails is the script's **last** assertion, a hard-coded
`info.version === "1.2.0"` that has been stale since Sprint 17 bumped the document to `1.3.0`.
So `pnpm openapi:validate` exits non-zero on a clean checkout, and did so before this sprint. The
document is valid, the drift half passes (12 paths, unchanged), and the stale constant is finding
F4 — not fixed here, because the contract version is Sprint 17's decision and this sprint touches
no endpoint.

Tests added: **40 pure tests** (validation, the fallback chain at every level including the
all-empty case, the graph in both `isConfigured` states, `@id` resolution, breadcrumb rules,
script-injection escaping, the robots/sitemap/noindex walk, drift, the single-boundary scans) and
**6 database-backed tests** (version bump and audit in one transaction, stale-version conflict,
no-op, rollback on a mid-transaction failure, revalidate-after-commit proven two ways). **Every
test that writes to the SEO singleton rows lives in one file**, because `pnpm -r test` can run
packages in parallel and two processes racing a shared version counter is a flaky test waiting to
happen.

The end-to-end run (`apps/web/scripts/sprint18-seo-e2e.ts`) drives the real built app over HTTP,
signed in as the seeded owner and manager, and restores every row it touches.

**A Next 15 behaviour worth knowing:** `generateMetadata` output is **streamed** to any client that
supports it — including Googlebot, which renders the page and hoists it — and is blocking inside
`<head>` only for "HTML-limited" bots (Twitterbot, facebookexternalhit, Slurp). Proofs that read
`<head>` therefore use Twitterbot's user agent. The metadata is identical either way; only its
position in the document differs.

**Next strips the trailing slash from the root canonical**, rendering `https://haroldsburnham.com`
where the sitemap lists `https://haroldsburnham.com/`. An empty path normalises to `/` (RFC 3986),
so these are the same URL and Google treats them identically; the consistency walk compares
normalised URLs rather than raw strings.

---

## 8. Findings — recorded, not implemented

| # | Finding |
|---|---|
| **F1** | **No per-category or per-item URLs exist.** The menu is one page with hash anchors. This is why no `BreadcrumbList` is published, why the sitemap has two URLs, and why there is no `Menu`/`MenuItem` schema and no per-record SEO override. Creating those routes is a restructure and was out of scope. See `SPRINT-18-OUTSTANDING.md` §2. |
| **F2** | **The kitchen display was indexable** before this sprint, as were checkout and order status; only the admin layout set `noindex`. Fixed here — one line for the kitchen, segment layouts for the two client routes — because it is squarely this sprint's subject. |
| **F3** | **`DEPLOYMENT.md` documents systemd; the operator runs pm2.** The docs and the last sprint's deploy log disagree about the supervisor. Not rewritten here. |
| **F4** | **`pnpm openapi:validate` fails at HEAD** — the validator asserts contract `1.2.0`, the document says `1.3.0`. Pre-existing, Sprint 17's. |
| **F5** | **3 pre-existing lint errors** in `packages/db/src/order-status.ts` / `.test.ts` (unused imports) from the uncommitted Sprint 17 retag. Untouched: order-state code is forbidden to this sprint by Critical rule 6. |
| **F6** | **`engines` says Node 22.x / pnpm 9.x**; the machine runs Node 24.11 and `DEPLOYMENT.md` says Node 24. Every pnpm command warns. |
| **F7** | **The store's contact phone is not a dialable number, and the drift detector caught it on its first run.** `StoreConfig.contactPhone` on this development database is `8320472305`, which `normalizePhoneToE164` rejects — a US exchange code cannot begin with 0, so `832-047-2305` does not exist. The storefront footer renders it as a `tel:` link and the confirmation page shows it, so a customer tapping it reaches nothing. Whether production holds the same value is unknown from here. The seeded default is `TODO: CONFIRM PHONE`, also invalid. Either way the operator must set a real number in **both** records (Phase 8). |
| **F9** | **The test suite mutates development data and does not restore it.** `packages/db/src/admin-menu.test.ts` writes menu items, and after a run no item carries the `isMostOrdered` curation flag, so the home page stops rendering its "Most ordered" section (this is what made the homepage HTML measurement shrink, §10.3). Pre-existing, and Sprint 16 already treats the empty state as normal locally. Sprint 18 own tests write only to the SEO tables and `AdminAuditLog`, and restore both. |
| **F8** | The repository calls the business **Oak Lawn** in `package.json`, `DEPLOYMENT.md` and `API-CONTRACT-HANDOFF.md`, and **Burnham** everywhere else. |

## 9. Deviations from the sprint prompt

| # | Deviation | Why |
|---|---|---|
| **D1** | **The admin save is an internal API route handler, not a server action.** This codebase has **no server actions** (`grep "use server"` is empty); the admin is a client SPA calling `/api/internal/admin/*` behind a default-deny role registry. The SEO route follows that pattern and calls `revalidateTag` in-process after commit — a route handler is as in-process as an action. It adds no endpoint to the documented contract, so Phase 6.6 and 7.1 hold. |
| **D2** | **`Restaurant` without `Organization`** — instructed by the prompt; recorded here as asked. See §2. |
| **D3** | **`/api/v1/media/` is allowed in `robots.txt`** although the prompt says to disallow every API path. Blocking it would stop menu photographs being indexed and break link-preview images for crawlers that obey robots.txt. See §4. |
| **D4** | **No `BreadcrumbList` is emitted anywhere**, including `/menu`. The prompt allows breadcrumbs on category and item pages only, and none exist (F1). The capability is built and tested. |
| **D5** | **No dynamic-route templates are stored.** Phase 1.3 makes them conditional on such routes existing; they do not. The resolver's template level exists and is tested. |
| **D6** | **The business record's "default Open Graph image" is modelled as `imageUrl`** (the `Restaurant.image`), with the OG default living only on site defaults, rather than storing the same idea in two places. |
| **D7** | **A final `og:image` fallback to `/logo.jpeg`**, so `og:image` is never absent. Not a claim about the business, so it is safe before the record is configured. |
| **D8** | **`sitemap.ts` and `robots.ts` are `force-dynamic`.** Phase 6.2 asks which surfaces the tag cannot reach; build-time prerendering is one, and this is the "invalidate by the appropriate means" answer. |
| **D9** | **A stale `version` returns 409** rather than overwriting. The prompt specifies the version but not its use on write; a second editor's save is not silently discarded. |

---

## 10. Phase 9 — suite, blast radius, handover

### 10.1 The suite, twice, identical

| Workspace | Tests (run 1) | Tests (run 2) | Failures |
|---|---|---|---|
| `apps/web` | 141 | 141 | 0 |
| `packages/db` | 145 | 145 | 0 |
| `packages/pricing` | 65 | 65 | 0 |
| `packages/config` | 31 | 31 | 0 |
| `packages/print` | 25 | 25 | 0 |
| `packages/payments` | 19 | 19 | 0 |
| `packages/notify` | 17 | 17 | 0 |
| `packages/email` | 4 | 4 | 0 |
| **Total** | **447** | **447** | **0** |

Baseline before this sprint was 401; the 46 new tests are Sprint 18's (40 pure, 6 database-backed).
The two runs are identical, checked by diffing the counts rather than by eye.

- **`pnpm typecheck`** — passes, twice, every workspace.
- **`pnpm build`** — passes, twice; the two route tables are byte-identical.
- **`pnpm lint`** — **fails, twice, identically, on 3 pre-existing errors** in
  `packages/db/src/order-status.ts` and `order-status.test.ts` (unused `JobType` / `JobStatus`
  imports from the uncommitted Sprint 17 retag). No Sprint 18 file produces a lint error or
  warning. Untouched deliberately: that is order-state code, which Critical rule 6 forbids this
  sprint from changing. Finding F5.
- **`pnpm openapi:validate`** — fails on the pre-existing contract-version assertion (F4). Its
  drift half passes: 12 paths, unchanged.

### 10.2 JavaScript — no storefront movement

| Route | Route JS before → after | First Load JS before → after |
|---|---|---|
| `/` | 1.73 kB → **1.73 kB** | 126 kB → **126 kB** |
| `/menu` | 2.02 kB → **2.02 kB** | 127 kB → **127 kB** |
| `/checkout` | 10.3 kB → **10.3 kB** | 129 kB → **129 kB** |
| `/order/[lookupToken]` | 2.38 kB → **2.38 kB** | 121 kB → **121 kB** |
| `/kitchen` | 5.2 kB → **5.2 kB** | 108 kB → **108 kB** |
| shared by all | 103 kB → **103 kB** | — |
| `/admin/[[...slug]]` | 14 kB → **26.9 kB** | 123 kB → **136 kB** |

**Storefront JavaScript did not move at all**, which is the expected result: everything this sprint
added to the customer-facing pages is server-rendered. The JSON-LD component is a server component
and the resolver, builder and accessor never reach the browser.

**The admin grew by 12.9 kB of route JS (+13 kB first load)** and that is accounted for: the SEO
screen is a client component, and it deliberately imports the shared validation module, the
resolver and the JSON-LD builder so the Preview tab renders unsaved state through exactly the code
the storefront runs. The alternative — a second, admin-only copy of those rules — is the thing
Critical rules 4 and 5 exist to prevent. No storefront route imports it.

Two new dynamic routes appear, `/robots.txt` and `/sitemap.xml` (312 B each, the standard route
handler stub). Every API route handler stub also reads 312 B where it read 297 B before: a uniform
+15 B on Next's own handler shim across all 40-odd handlers, not app code.

### 10.3 HTML — where the bytes went

Measured against the running production build with the same user agent the baseline used:

| Route | HTML before | HTML after | Delta | SEO bytes in it |
|---|---|---|---|---|
| `/` | 73,315 | 72,052 | **−1,263** | +1,631 |
| `/menu` | 137,849 | 139,550 | **+1,701** | +1,705 |
| `/checkout` | 23,478 | 23,636 | **+158** | +143 |
| `/order/{token}` | 21,317 | 21,471 | **+154** | +143 |
| `/kitchen` | 9,239 | 9,368 | **+129** | +129 (the `noindex` tag) |
| `/admin` | 10,786 | 10,786 | **0** | already `noindex` |
| `/robots.txt` | 404 | 224 | new | — |
| `/sitemap.xml` | 404 | 306 | new | — |

SEO adds **about 1.6–1.7 kB** to an indexable page (metadata tags plus a ~600-byte JSON-LD block,
which grows to roughly 1.2 kB once the `Restaurant` node is published) and **143 bytes** to a
noindex one. That is the HTML payload cost, and it is the intended trade.

**The homepage's −1,263 is not an SEO effect and was chased down rather than waved through.** The
baseline capture rendered a "Most ordered" section; the current one does not, because no menu item
carries the `isMostOrdered` curation flag any more (~2.9 kB of section). The flags were cleared by
`packages/db/src/admin-menu.test.ts`, which mutates development menu data — `MenuItem.updatedAt`
last moved at 23:49, during the final suite runs, and the audit log shows the test suite's
`ITEM_BINDINGS`, `HOURS_UPDATE` and `STAFF_CREATE` rows at the same moment. Sprint 16 already
recorded this state as normal locally. Sprint 18's tests write to the SEO tables and `AdminAuditLog`
only, and restore both. Recorded as finding F9; the home page hiding an empty curated section is
Sprint 16's designed behaviour, not a regression.

### 10.4 Processes started, and how each was terminated

| # | Process | Purpose | Terminated |
|---|---|---|---|
| 1 | `pnpm test` (background) | Baseline suite before any change | Exited on its own, code 0 |
| 2 | `pnpm build` (background) | Baseline bundle sizes | Exited on its own, code 0 |
| 3 | `next start -p 3000` (background) | Baseline HTML capture | `Stop-Process -Id 9752 -Force`; port 3000 confirmed free |
| 4 | `next start -p 3000` (background) | Sprint 18 end-to-end runs | `Stop-Process -Id 16968 -Force`; port 3000 confirmed free |
| 5 | `next start -p 3000` (background) | Final HTML measurements | `Stop-Process -Id <pid> -Force`; port 3000 confirmed free (§10.5) |
| 6 | `psql` (foreground, several) | Scratch database, rollback proof, row inspection | Each exited on its own |
| 7 | `prisma migrate deploy` / `diff` / `generate` | Migration apply and reversibility proof | Each exited on its own |
| 8 | `tsx` test and script runs (foreground) | Suites, end-to-end, schema validation | Each exited on its own |

The scratch database `harolds_s18_scratch` was created for the reversibility proof and **dropped**.

### 10.5 State left behind on this machine

- The development database holds the **seeded placeholder** SEO rows with `isConfigured = false`,
  exactly as the migration created them. The end-to-end run restored every row it changed and
  deleted the audit rows it wrote; `SeoSiteDefaults.version` is higher than 1, which is correct —
  the version is monotonic and never rewinds.
- No production system was touched. No deployment, no live Search Console submission, no real
  business data entered anywhere.
- Artifacts kept outside the repository (scratchpad): the end-to-end report, the two captured
  JSON-LD graphs, the schema.org vocabulary, and the build/test logs.
