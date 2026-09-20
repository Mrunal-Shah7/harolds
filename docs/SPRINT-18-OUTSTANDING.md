<!-- SPRINT-18: everything the SEO sprint could not do, and why. Written at the end of the agent
     phases (0–7, 9). Phase 8 is the operator's and is listed first because most of this is his. -->

# Sprint 18 — outstanding

Ordered by what blocks the most. Nothing in this list was started.

---

## 1. Operator work (Phase 8) — none of it can be done from a development machine

| # | Item | Why it is the operator's |
|---|---|---|
| 1.1 | **Deploy and restart the pm2 process** | No production access from here. |
| 1.2 | **Replace every `PLACEHOLDER` in the SEO business record with real data** — NAP block, real coordinates, real hours, real profile URLs — then switch `isConfigured` on | The agent must not invent a business's address, phone or hours. Until this is done the `Restaurant` node is not published at all, which is the designed behaviour, not a bug. |
| 1.3 | **Set a real, dialable phone number — this is a live customer-facing defect, not just drift.** `StoreConfig.contactPhone` on the development database is `8320472305`, which is not a valid US number (an exchange code cannot start with 0), and the storefront footer and confirmation page render it as a `tel:` link. Check what production holds, fix it there, and set the same number in the SEO record so the drift panel agrees | Both are business facts, and only the operator knows the real number. The two records are deliberately not synced (§4.1). |
| 1.4 | **Confirm the pm2 execution mode on the VPS** (`pm2 describe harolds`) and paste the output into `SPRINT-18-NOTES.md` §0.3 | Fork mode was stated by the operator, not read from the server. Phase 6's design depends on it; cluster mode would make in-process invalidation wrong. See notes §6.3. |
| 1.4b | **Open the admin SEO section and check the screen renders and behaves.** It was never driven in a browser: no browser driver exists on the development machine and the admin is behind authentication. Check each tab opens; a field edit shows in Preview without saving; the drift panel lists the store record beside the SEO record; the unsaved-changes prompt appears when navigating away mid-edit; and a manager account sees the owner-only notice | The screen's data and API are tested; its rendering is not. See notes §5.1. |
| 1.5 | Fetch `/robots.txt` and `/sitemap.xml` on the real host and read them | Needs the live domain. |
| 1.6 | Rich Results Test + Schema.org validator on the homepage and a menu page; record warnings | Google's own tools need a public URL. The local validator (notes §2) is not a substitute for Google's parser. |
| 1.7 | Search Console: submit the sitemap, request indexing on the homepage | Needs the verified property. |
| 1.8 | Change a title in the admin SEO section and confirm the storefront updates | Proven locally; unproven on production hardware. |
| 1.9 | Confirm an order-status URL is `noindex` by viewing source on the real host | Same. |
| 1.10 | **Google Business Profile, reviews, citations, backlinks** | Explicitly out of this sprint. This is the half of local SEO that actually moves the ranking for `harolds chicken burnham`, and it is running in parallel. |

---

## 2. Route structure — the biggest technical gap

**There are no per-category or per-item URLs.** The menu is one page with hash anchors
(`/menu#cat-<id>`); items open in a modal. This was a Phase 0.2 finding, and creating those routes
is a restructure that Sprint 18 was told not to attempt.

What that costs, today:

- **No `BreadcrumbList` is published anywhere.** There is no page whose trail has more than one
  entry. The builder supports breadcrumbs and is tested; nothing feeds it.
- **The sitemap has two URLs**, `/` and `/menu`. A restaurant with 87 items offers Google two
  documents.
- **No `Menu` / `MenuSection` / `MenuItem` schema.** Worth real traffic — it is what produces menu
  rich results — but it belongs on pages that describe one item, and those do not exist.
- **Per-item metadata and per-record SEO overrides** have nothing to attach to. The data model
  stores templates-by-route rather than rows-per-record precisely so this is additive later.
- `SeoRouteOverride.breadcrumbLabel` is stored and editable but **unused** until such routes exist.

The follow-on sprint is: add `/menu/[categorySlug]` and `/menu/[categorySlug]/[itemSlug]` (the API
route `/api/v1/menu/categories/{categorySlug}/items/{itemSlug}` already serves exactly this shape),
then register them in `apps/web/src/lib/seo/routes.ts` with their tokens, add the template rows,
and turn on breadcrumbs and `MenuItem` schema. The resolver's template level already exists and is
tested against a synthetic dynamic route, so it plugs in rather than being designed.

---

## 3. Deliberately not built in this sprint

- **`llms.txt`** — no crawler officially consumes it; no bearing on ranking.
- **A dedicated location or about page** — would be the natural home for the `Restaurant` entity
  and a second indexable document, but it is new storefront route structure (§2).
- **The review-request QR on thermal receipts** — a print-path change, and this sprint touches no
  print code.
- **Core Web Vitals, image optimisation, font loading** — untouched. Note the storefront still
  serves `<img>` rather than `next/image` (six existing lint warnings, all pre-existing), and
  `/menu` ships a 137 kB HTML document because all 87 items render on one page.
- **Any pricing, menu, ordering, printing, notification or payment change** — forbidden by the
  sprint's Critical rule 6 and not made.
- **Sprint 15's remaining admin/kitchen redesign work** and **Sprint 17's NMI production work**.
- **The 51-state regression walk**, still outstanding, still Sprint 14's deployment's.

---

## 4. Decisions that must not be quietly undone

1. **The SEO business record and `StoreConfig` are never synced.** The drift panel names
   disagreements and offers no sync button, in either direction, by operator decision. If a future
   sprint adds "sync", it erases the separation the second record was created for.
2. **`isConfigured` is the publish switch.** While it is false no `Restaurant` node is emitted.
   Do not default it to true, and do not "helpfully" fall back to `StoreConfig` values to fill it.
3. **The canonical host is not an admin form field.** It is read-only in the UI and rejected by the
   API; changing it is a deployment step (notes §6.4).
4. **No raw JSON-LD, HTML or `<meta>` input.** Every SEO field is structured and validated; the
   JSON-LD is generated and shown read-only. This is the only thing standing between an admin form
   and a script tag on every customer's browser.
5. **pm2 stays in fork mode** unless someone deliberately handles the cache (and the job worker,
   print sweeper and reconcile scheduler, which also assume one process).

---

## 5. Known issues found but not fixed (out of scope)

| # | Issue | Why it was left |
|---|---|---|
| 5.1 | **`pnpm openapi:validate` fails on a clean checkout.** `apps/web/scripts/openapi-validate.ts` asserts `info.version === "1.2.0"`; `docs/openapi/v1.yaml` has said `1.3.0` since Sprint 17. Present at HEAD, unrelated to Sprint 18 | The contract version is Sprint 17's decision (its notes record shipping two renames under `1.3.0` as a deviation). Changing the assertion is a statement about the contract, and this sprint touches no endpoint. One-line fix once someone owns the version. The **drift** half of the check passes: 12 paths, unchanged. |
| 5.2 | **3 pre-existing lint errors** in `packages/db/src/order-status.ts` and `order-status.test.ts` (unused `JobType` / `JobStatus` imports), from the uncommitted Sprint 17 retag | Order-state code. Critical rule 6 forbids this sprint from touching it. |
| 5.3 | `engines` in the root `package.json` still says Node `22.x` / pnpm `9.x`; the machine runs Node 24.11 and `DEPLOYMENT.md` says Node 24 | Toolchain, not SEO. Every command warns on every run. |
| 5.4 | `DEPLOYMENT.md` §2 documents a **systemd** unit; the operator actually runs **pm2** | Documented as finding F3 in the notes. Rewriting the deployment doc is not this sprint's, but it will mislead whoever deploys next. |
| 5.5 | The repository is named for **Oak Lawn** in several documents (`package.json` description, `DEPLOYMENT.md`, `API-CONTRACT-HANDOFF.md`) while the storefront, seed and design all say **Burnham** | Cosmetic, but it is the business's name in a file a stranger reads first. |
