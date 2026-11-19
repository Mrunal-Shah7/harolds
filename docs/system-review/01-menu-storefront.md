# 01. Menu and storefront browsing

_2026-11-19. Made from the code and the earlier sprint notes in [../reference/](../reference/). Not yet walked by
checklist. Marks: see [README.md](README.md)._

## Planned changes

| Change | Kind | What will change | Triage | State |
|---|---|---|---|---|
| — | | None yet | | |

## What it is for

Lets a guest see the menu, whether the store is open, and build a pickup cart before checkout.

## Who uses it, and where

- **People:** guests (no accounts in v1) [code]
- **Screens or routes:** `/` home, `/menu`, the item modal and cart sheet on both; `/design-system` (returns 404 in
  production builds) [code]
- **Backend:** `GET /api/v1/menu`, `/api/v1/menu/categories`, `/api/v1/menu/categories/[categorySlug]/items/[itemSlug]`,
  `/api/v1/menu/items/[id]`, `/api/v1/menu/featured`, `/api/v1/menu/most-ordered`, `/api/v1/store/status`,
  `/api/v1/media/[hash]` and `/api/v1/media/[hash]/[variant]` [code]
- **Code:** `apps/web/src/app/(storefront)/page.tsx`, `menu/page.tsx`, `apps/web/src/components/storefront/`,
  `apps/web/src/lib/cart-context.tsx`, `apps/web/src/lib/storefront-fetch.ts`, `packages/db/src/repositories/menu.ts`,
  `packages/db/src/menu-cache.ts`, `packages/db/src/repositories/store.ts`, `packages/db/src/trading-state.ts`,
  `packages/db/src/mappers/` [code]

## How it works

- **Home** (`/`): server-renders a hero, the category rail and the curated "most ordered" list; the section is
  hidden when the list is empty. Fetches menu, store status and most-ordered in parallel (`page.tsx`). [code]
- Seen on 2026-11-19: hero, category rail and an "OPEN" pill on `/`; an "Order delivery" button links out to the
  store's DoorDash page, so delivery stays outside this product ([run](../runs/2026-11-19-smoke.md), S-02).
  [observed]
- **Menu** (`/menu`): every category and item on one page with sticky tabs; no pagination
  (`menu-browser.tsx`). Seen: 17 category tabs and 88 prices on one page (S-03). [observed]
- **Cart:** held in the browser in `localStorage` (`cart-context.tsx:144`, `:172`); quantity is capped at the
  item's `maxQuantityPerOrder` (`cart-context.tsx:262`, `:282`). Prices in the cart are for display only; the
  server reprices at quote and checkout (module 02). [code] Seen: the cart, stored under `harolds.cart.v1`, kept
  its item and option across a reload (S-04). [observed]
- **Store status pill and banner:** from `/api/v1/store/status`. Open/closed follows the precedence in
  `trading-state.ts`: the "accepting orders" switch, then an active trading override, then the weekly schedule
  and closures. [code]
- **Theme:** light and dark storefront scheme with a toggle (`theme-toggle.tsx`, `lib/theme.ts`). [code]
- **Google Ads tag** (gtag.js) loads on storefront pages only, not admin or kitchen
  (`app/(storefront)/layout.tsx`, `packages/config/src/google-tag.ts`). [code]
- **API:** responses use the success/error envelope in `apps/web/src/lib/api.ts`. `/api/v1/menu` returns an ETag
  and answers `If-None-Match` with 304 (`api/v1/menu/route.ts`). The contract is in
  [../openapi/v1.yaml](../openapi/v1.yaml); `pnpm openapi:validate` checks it against the code. [code]
- **Data:** `Category`, `MenuItem`, `ModifierGroup`, `ModifierOption`, `ItemModifierGroup`, `StoreConfig`,
  `StoreHours`, `StoreClosure`, `TradingOverride` (`packages/db/prisma/schema.prisma`). Money is integer cents.
  [code]
- **Loading and caching:** the full menu is cached in process with an ETag and invalidated by every admin menu
  write (`menu-cache.ts`, `admin-menu.ts`). Store config has a short in-process TTL cache (`store-config.ts`).
  Images are content-addressed files under `IMAGE_UPLOAD_DIR` (default `data/uploads`) served through
  `/api/v1/media` (`apps/web/src/lib/media/storage.ts`). [code]

## Rules it enforces

- The storefront never calls the database directly; it goes through the public API (README, "For the storefront
  developer"). [code]
- Inactive items and categories are not served; sold-out items are served with a flag
  (`repositories/menu.ts` header). [code]
- Rate limits per client per minute: menu 120, store status 120 (`packages/config/src/security.ts:27`). [code]
- Quantity per line cannot exceed the item's purchase limit in the cart; the server enforces it again
  (`packages/pricing/src/item-limit.test.ts`). [code]

## Problems found

| # | Problem | Status |
|---|---|---|
| — | None yet | |

## Questions

1. Is the curated "most ordered" list still meant to be manual? The old handover lists computed rankings as
   deferred work ([../reference/HANDOVER.md](../reference/HANDOVER.md)). [question]

## How to test it

Checklist: smoke rows S-01 to S-04 in [checklists/00-smoke.md](checklists/00-smoke.md). Test data: the seeded menu
(`pnpm db:seed:menu`). Automated: `packages/pricing/src/*.test.ts`, `apps/web/src/lib/storefront-fetch.test.ts`.

## Not yet checked

Phone-width layout, dark scheme, sold-out display on the page, closed-store banner and the 304 path have not been
walked in this cycle. The earlier sprint notes describe them as checked at the time.
