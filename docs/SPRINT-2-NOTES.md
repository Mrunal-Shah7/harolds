# Sprint 2 Notes — Menu API, Contract & Mock

Harold's Chicken Oak Lawn — public read API, frozen contract, mock server.

**Contract version frozen:** `1.0.0` on **2026-08-09**.

---

## Phase 1 remediations

1. **pnpm pin** — `packageManager` set to `pnpm@11.8.0`. pnpm 11 settings live in `pnpm-workspace.yaml` (`nodeLinker`, `allowBuilds`, `minimumReleaseAge: 0`). `.npmrc` is auth/registry only.
2. **Daily order numbering** — `OrderNumberCounter` is one row per `businessDate`. `Order.businessDate` added; uniqueness is `(businessDate, orderSequence)`; `orderNumber` is indexed non-unique. Config: `orderNumberResetHour` (default 5), `orderNumberPadWidth` (default 3), prefix `HC-`, start `1`. Pure function `resolveBusinessDate` uses Luxon + IANA zone.
3. **Admin identity** — `AdminUser`, `AdminSession`, `AdminRole` enums. No auth logic.
4. **JobType alerts** — `ALERT_MANAGER_PRINT_FAILED`, `ALERT_MANAGER_JOB_DEAD`, `ALERT_MANAGER_ORDER_UNACKNOWLEDGED`. StoreConfig: optional `managerAlertPhone`, `managerAlertEmail`.
5. **Item slug** — `MenuItem.slug` unique per `(categoryId, slug)`; seeded via `slugify(display_name)`.
6. **Singleton check** — `StoreConfig_singleton_check` re-asserted in sprint2 migration SQL.

Migration: `20260809164500_sprint2_remediation`.

---

## Business date vs open/closed

**Business date** (order numbers): rolls at `orderNumberResetHour` store-local (default 05:00). An order at 23:50 and 00:30 share the earlier calendar date until reset.

**Open/closed** (ordering): follows weekly hours + closure dates in store-local time. Does not call business-date logic.

Worked example (reset 05:00, America/Chicago):
- 2026-08-09 04:59 local → business date `2026-08-08`
- 2026-08-09 05:00 local → business date `2026-08-09`

---

## Framework caching (Phase 2.5)

Route handlers set `dynamic = "force-dynamic"` and `revalidate = 0` so Next.js does not statically cache menu/status at the framework layer. HTTP `Cache-Control: public, max-age=30, stale-while-revalidate=60` is set on menu responses for browsers/proxies. Store status uses `no-store`. Menu ETag + `If-None-Match` → 304. In-process menu cache (60s TTL) sits below that with explicit `invalidateMenuCache()`.

---

## Full-menu query count

**2 queries** cold (categories+items, then item–group bindings with options).  
**0 queries** on a hot in-process cache hit (etag + menu served from memory).

Recorded: Phase 3.3 / Phase 9.

---

## Status ↔ error code mapping

| Code | HTTP |
|---|---:|
| NOT_FOUND | 404 |
| VALIDATION_ERROR | 400 |
| STORE_CLOSED | 409 |
| STORE_NOT_ACCEPTING_ORDERS | 409 |
| ITEM_UNAVAILABLE | 409 |
| INTERNAL_ERROR | 500 |

---

## Surprises in migration SQL

- Prisma's auto-diff wanted `slug TEXT NOT NULL` and counter alter without backfill — hand-written SQL backfills slugs and rebuilds `OrderNumberCounter`.
- `ALTER TYPE ... ADD VALUE IF NOT EXISTS` used for JobType extensions (PG 18).
- Singleton CHECK dropped/re-added explicitly after StoreConfig alters.

---

## Deviations

1. Debug-only `GET /api/v1/_debug/internal-error` for Phase 2 gate (non-production).
2. Fixture-only mutations: sold-out flags and one required group for storefront edge cases (not written back to DB).
3. Featured/most-ordered empty until curated in admin (Sprint 8).
4. A Sprint 2 helper committed the mock package early mid-session; remaining work continued on top.

---

## Outstanding business inputs (updated)

- Street address, postal code, contact phone (`TODO` placeholders)
- Verified prices for 8 PLACEHOLDER items
- Real modifier groups per item (replace provisional)
- Item photographs
- Manager alert phone / email
- Curated featured / most-ordered lists
- Yellow-flagged menu conflict resolutions

---

## Commands

```bash
pnpm install
cp .env.example .env   # real API only
pnpm db:generate && pnpm db:migrate:deploy && pnpm db:seed && pnpm db:verify
pnpm db:export-fixtures   # refresh mock fixtures from DB
pnpm mock                 # :4001 no DB
pnpm dev                  # :3000 real API
pnpm openapi:validate
```
