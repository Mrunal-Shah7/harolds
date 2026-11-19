# 06. Admin: menu and store

_2026-11-19. Made from the code, [../reference/ADMIN-OPERATOR-GUIDE.md](../reference/ADMIN-OPERATOR-GUIDE.md) and
the Sprint 8 and 12 notes. Not yet walked by checklist. Marks: see [README.md](README.md)._

## Planned changes

| Change | Kind | What will change | Triage | State |
|---|---|---|---|---|
| — | | None yet | | |

## What it is for

Lets managers run the menu and the store's trading without a developer: prices, items, modifiers, photos,
sold-out, featured lists, opening hours, closures, temporary overrides and storefront wording.

## Who uses it, and where

- **People:** managers and the owner (admin needs role `MANAGER` or `OWNER`; `STAFF` is kitchen-only) [code]
- **Screens or routes:** `/admin/menu`, `/admin/menu/new`, `/admin/categories`, `/admin/modifiers`, `/admin/store`
  (`apps/web/src/components/admin/AdminApp.tsx`, `AdminShell.tsx:24-36`) [code]
- **Backend:** `/api/internal/admin/menu/*`, `/api/internal/admin/modifiers/*`, `/api/internal/admin/store/*`
  (every path listed in `apps/web/src/lib/admin-route-registry.ts`) [code]
- **Code:** `packages/db/src/admin-menu.ts`, `admin-store.ts`, `admin-trading.ts`; `apps/web/src/lib/media/storage.ts`,
  `media-sweeper.ts` [code]

## How it works

- **Items and categories:** create, edit, activate or deactivate, reorder, set sold-out, clear all sold-out, set a
  per-order purchase limit (`admin-menu.ts`). Prices are typed as currency and converted to integer cents without
  floating point (`parseCurrencyInput`). [code]
- **Modifiers:** groups with options; bindings between items and groups can be replaced from either side
  (`replaceItemBindings`, `replaceGroupBindings`). [code]
- **Curation:** the featured and most-ordered lists are set by hand (`setCuration`). [code]
- **Photos:** upload for items, categories and the store hero; JPEG, PNG or WebP detected from the bytes, with a
  pixel-count ceiling and an 8 MiB body cap; WebP and fallback derivatives at fixed widths are written to
  `IMAGE_UPLOAD_DIR`; unreferenced files are swept after a grace period (`media/storage.ts`,
  `media-sweeper.ts`). [code]
- **Store:** name, address, contact phone, prep time, the accepting-orders switch, announcement and
  closed/paused wording, tipping, manager alert destinations (`admin-store.ts:52`); weekly hours; one-off closures;
  trading overrides (early close, late open, closed rest of day, open anyway) that expire at the end of their
  business date by default (`admin-trading.ts`). [code]
- Seen on 2026-11-19: one tap on "Available" in `/admin/menu` made the item "Sold out" and `/api/v1/menu` reported
  `isSoldOut: true` at once; a second tap undid it ([run](../runs/2026-11-19-smoke.md), S-11). [observed]
- **Data:** the menu tables, `StoreConfig`, `StoreHours`, `StoreClosure`, `TradingOverride`; every write lands in
  `AdminAuditLog` (module 09). [code]
- **Loading and caching:** every menu write invalidates the public menu cache, and store writes invalidate the
  store caches (`admin-menu.ts`, `admin-store.ts` headers). [code]

## Rules it enforces

- Precedence for open/closed: switch > override > schedule (`trading-state.ts`). [code]
- Admin JSON bodies capped at 64 KiB; admin API limited to 120 calls per client per minute (`security.ts`). [code]
- Undeclared admin routes refuse at module load (`admin-route-registry.ts`). [code]

## Problems found

| # | Problem | Status |
|---|---|---|
| — | None yet | |

## Questions

1. Have the eight unverified beverage and dessert prices and the contact phone been settled in the live admin?
   They were launch blockers 7 and 9 in [../reference/LAUNCH-BLOCKERS.md](../reference/LAUNCH-BLOCKERS.md).
   [question] Tip presets are set in production: tipping on, 15%, 18%, 20%, 25% (read-only query, 2026-11-19).
   [observed]

## How to test it

Checklist: smoke row S-11 in [checklists/00-smoke.md](checklists/00-smoke.md). Test data: the seeded menu and the
seeded test manager. Automated: `packages/db/src/admin-menu.test.ts`, `admin-store.test.ts`, `open-closed.test.ts`,
`trading-state.test.ts`; `apps/web/src/lib/media/storage.test.ts`, `admin-routes.test.ts`, `admin-body-enum.test.ts`.

## Not yet checked

Photo upload from a phone camera, override expiry across midnight, and the cache invalidation over HTTP have not
been walked in this cycle (Sprint 13 recorded them as proven at the time).
