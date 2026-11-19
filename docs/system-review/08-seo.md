# 08. SEO

_2026-11-19. Made from the code and the Sprint 18 notes. Not yet walked by checklist. Marks: see
[README.md](README.md)._

## Planned changes

| Change | Kind | What will change | Triage | State |
|---|---|---|---|---|
| — | | None yet | | |

## What it is for

Controls what search engines publish about the business: page titles and descriptions, the business details in
structured data, `robots.txt` and the sitemap.

## Who uses it, and where

- **People:** the owner edits it; search engines and link previews read it [code]
- **Screens or routes:** `/admin/seo` (owner only, `components/admin/SeoView.tsx`); public `/robots.txt`
  (`app/robots.ts`), `/sitemap.xml` (`app/sitemap.ts`); JSON-LD on `/` and `/menu`
  (`components/seo/json-ld.tsx`) [code]
- **Backend:** `GET` and `PUT /api/internal/admin/seo` [code]
- **Code:** `apps/web/src/lib/seo/*.ts`, `packages/db/src/seo.ts`, `packages/types/src/seo.ts` [code]

## How it works

- **Route metadata:** each storefront route has a stable key (`seo/routes.ts`); its title and description come from
  a documented fallback chain: route override, then site defaults (`seo/resolve.ts`, `seo/page.ts`). [code]
- **JSON-LD:** one graph per page, built only in `seo/jsonld.ts`, from the SEO business record and opening hours.
  [code]
- **Drift:** the SEO business record is a second copy of facts also held in `StoreConfig` (name, address, hours);
  `seo/drift.ts` reports where they disagree. [code]
- Seen on 2026-11-19: `/robots.txt` disallows `/checkout`, `/cart`, `/order`, `/api/`, `/admin`, `/kitchen` and
  `/design-system`; `/sitemap.xml` lists `/` and `/menu` on `https://haroldsburnham.com`, even on a local server
  ([run](../runs/2026-11-19-smoke.md), S-13). [observed]
- **Save:** validate (`seo/validation.ts`), commit, then invalidate the cached snapshot (`seo/save.ts`). [code]
- **Data:** `SeoBusiness`, `SeoOpeningHours`, `SeoSiteDefaults`, `SeoRouteOverride`. [code]

## Rules it enforces

- Only the owner can read or change SEO settings (`admin-route-registry.ts`). [code]
- One validation module serves both the API and the form (`seo/validation.ts`). [code]
- Country codes are ISO 3166-1 alpha-2 (`seo/countries.ts`). [code]

## Problems found

| # | Problem | Status |
|---|---|---|
| — | None yet | |

## Questions

1. ~~Does production show the Prisma checksum mismatch on `20260919120000_sprint18_seo`?~~ No: production's
   checksum equals the file in git; only the local database recorded an earlier version (TR-006, closed
   2026-11-19).

## How to test it

Checklist: smoke row S-13 in [checklists/00-smoke.md](checklists/00-smoke.md). Test data: the seeded SEO rows.
Automated: `apps/web/src/lib/seo/seo.test.ts`, `seo/save.test.ts`; scripts `apps/web/scripts/sprint18-seo-e2e.ts`,
`sprint18-schema-validate.ts`.

## Not yet checked

How search engines actually render the pages (Search Console) is an owner check.
