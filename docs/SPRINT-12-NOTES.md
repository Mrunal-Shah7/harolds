    <!-- SPRINT-12: sprint notes — Phase 1 inventory and continuing decisions -->

    # Sprint 12 Notes — Admin Merchandising, Image Pipeline, Store Messaging & Square Bring-Up

    Harold's Chicken Oak Lawn. Pickup only, guest checkout, ASAP only.

    ---

    ## Phase 1 — Carry-Forward Audit (passed)

    ### 1.1 Admin surface inventory (exercised via code + live routes)

    Default role gate: `requireAdmin(request)` → **MANAGER** minimum (OWNER also passes). OWNER-only where noted.

    | Area | Routes | Read | Write | Role | Sprint 12 status |
    |------|--------|------|-------|------|------------------|
    | **Auth** | `POST …/auth/signin`, `POST …/auth/signout`, `GET …/auth/session` | session | establish / destroy | public signin; session = MANAGER+ | Keep |
    | **Dashboard** | `GET …/dashboard` | KPIs, jobs, print | — | MANAGER+ | Keep |
    | **Menu items** | `GET/POST …/menu/items`, `GET/PATCH …/menu/items/[id]`, `POST …/sold-out`, `POST …/sold-out/clear`, `PUT …/bindings` | list/detail | create, edit, deactivate (isActive), sold-out, bindings, imageUrl **as text** | MANAGER+ | **Mostly satisfied.** Missing: upload pipeline (image URL is free text only). No hard delete. Sold-out ≠ active already. Price via `parseCurrencyInput` → `dollarsToCents`. Unverified flag clears on price edit. |
    | **Categories** | `GET/POST …/menu/categories`, `GET/PATCH …/categories/[id]` | list/detail | create, edit, deactivate | MANAGER+ | **Satisfied** (verify reorder atomicity in Phase 4) |
    | **Curation** | `GET/PUT …/menu/curation` | featured / most-ordered | replace lists | MANAGER+ | **Satisfied** |
    | **Modifiers** | `GET/POST …/modifiers`, `GET/PATCH …/[id]`, `POST …/options`, `PATCH …/options/[id]`, `PUT …/bindings` | groups/options | create, edit, deactivate, bind | MANAGER+ | **Mostly satisfied.** Binding count shown on list (`_count.items`). Confirm min≤max validation + atomic reorder + binding-count warning before save in Phase 4. |
    | **Store config** | `GET/PATCH …/store` | config, hours, closures | patch config (tax/tip owner-only in service) | MANAGER+; tax/tip OWNER | **Partial.** Accepting-orders + not-accepting message editable. No announcement, closed message, prep phrasing, or trading overrides. |
    | **Hours** | `PUT …/store/hours` | via store GET | weekly rows | MANAGER+ | **Satisfied** for weekly hours |
    | **Closures** | `POST …/closures`, `DELETE …/closures/[id]` | via store GET | create/remove | MANAGER+ | **Satisfied** (past retained) |
    | **Orders** | `GET …/orders`, `GET …/[id]`, status/cancel/refund/reprint | list/detail | corrections, refunds, reprints | MANAGER+ | Keep (out of sprint build scope) |
    | **Reports** | `GET …/reports`, `GET …/reports/export` | aggregates / CSV | — | MANAGER+ | Keep |
    | **Staff** | `GET/POST …/staff`, `PATCH …/staff/[id]`, sessions | users | create/update/revoke | **OWNER** | Keep |
    | **Jobs / print / audit / reconcile** | various | ops | retry, reprint, reconcile | MANAGER+; audit OWNER | Keep |

    **Already satisfied by Sprint 8 (do not rebuild):** item/category/modifier CRUD, sold-out vs active, currency parsing via Sprint 1 function, unverified-price clear on price edit, weekly hours, closures, accepting-orders + paused message field, featured/most-ordered curation, modifier bindings.

    **Gaps this sprint must fill:** image upload/storage/serving; trading overrides; announcement + closed/prep message editing; storefront image + banner composition; payment client config; contract 1.3.0; auth hardening for new endpoints.

    ### 1.2 Payments failure — evidence

    **Symptom:** Checkout shows "Loading secure payment form…" then "Payments are not configured yet. Please try again later."

    **Emitting path:** `apps/web/src/components/storefront/square-payment-form.tsx` lines 56–58. Guard: `!appId || !locationId` where those are `process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID` and `NEXT_PUBLIC_SQUARE_LOCATION_ID`.

    **Actual cause (confirmed):** Root `.env` has server-side `SQUARE_APPLICATION_ID` / `SQUARE_LOCATION_ID` / `SQUARE_ENVIRONMENT` / `SQUARE_ACCESS_TOKEN` / webhook key, but **does not set** `NEXT_PUBLIC_SQUARE_APPLICATION_ID`, `NEXT_PUBLIC_SQUARE_LOCATION_ID`, or `NEXT_PUBLIC_SQUARE_ENVIRONMENT`. Next.js inlines `NEXT_PUBLIC_*` at **build** time into the client bundle. Empty public IDs → guard fires every time. `.env.example` already documents the public trio; the live `.env` was never given them.

    **Ruled out:**

    | Hypothesis | Evidence |
    |------------|----------|
    | CSP blocking Square SDK | `packages/config/src/security.ts` already allows `*.squarecdn.com`, `web.squarecdn.com`, `sandbox.web.squarecdn.com` in script/frame/connect. Sprint 9/11 tests assert this. |
    | SDK script not loading | Script tag loads sandbox CDN URL; failure is the empty-ID guard **before** `Square.payments()`, not a load failure. |
    | Server-side Square config missing | Startup summary logs `squareEnvironment: sandbox`; `packages/config` requires all five server Square vars. Access token present. |

    ### 1.3 Banner provenance

    Source: `store-status-banner.tsx` when `isOpen && acceptingOrders`:

    | Segment | Source today |
    |---------|----------------|
    | `Open now` | **Literal string.** Conditioned on derived `status.isOpen` + `acceptingOrders`, but the words are hardcoded, not from API. |
    | `Ready in about {N} min` | **Hybrid.** `N` = `status.prepMinutes` (derived from store config busy/normal). Phrasing `Ready in about … min` is literal. |
    | `Pickup only` | **Literal constant** (v1 fulfilment mode). |

    Closed / paused states use other hardcoded or `notAcceptingMessage` strings.

    ### Credentials for Phase 2

    - **Sandbox:** present in `.env` (application ID, access token, location ID, webhook signature key). Proceed.
    - **Production Square credentials:** not supplied (`SQUARE_ENVIRONMENT=sandbox`). Production payment leg → **blocked**, not failed.

    ---

    ## Phase 2 — Square payments (passed; production leg blocked)

    **Guard:** `assertPublicSquareIdentifiersForBuild` in `next.config.ts`; production `missingProductionVariables` requires server + public Square IDs; startup summary includes `squareClientIdsAtBuild`. Missing-config UI posts to `/api/internal/client-error` naming the absent variable.

    **Methods:**

    | Method | Result |
    |--------|--------|
    | Card | **Working** — sandbox `cnon:card-nonce-ok` → PAID / CAPTURED (`HC-001`, `HC-002`). Decline `cnon:card-nonce-declined` → `PAYMENT_DECLINED`. |
    | Apple Pay | **Blocked** — origin is not a secure context (HTTP localhost); domain not registered. |
    | Google Pay | **Blocked** — same as Apple Pay. |
    | Cash App Pay | **Blocked in this environment** — probe recorded; no HTTPS domain association. |

    **Idempotency:** duplicate key returned the same order id / number (exactly one charge).

    **Storefront money fields:** `createOrder` sends `cart` (tip as `{type:'preset',presetIndex}`), `customer`, `paymentToken`, `idempotencyKey` only — proven by reading `storefront-api.ts` + checkout page.

    **Webhook:** `POST /api/v1/webhooks/square` returns 401 without a valid signature (path exists; not a root swallow).

    **Production leg:** blocked — no production credentials supplied.

    ---

    ## Phase 3 — Image storage (passed)

    - **Decision:** local disk under `IMAGE_UPLOAD_DIR` (default `data/uploads` at repo root), outside `.next` and gitignored.
    - **Abstraction:** `writeStoredImage` / `readStoredImage` / `buildMediaUrls` only.
    - **Formats:** JPEG / PNG / WebP by magic bytes; SVG and text rejected; re-encode strips EXIF; content-addressed SHA-256.
    - **Cap:** 8 MiB before full consume (Content-Length + buffer length).
    - **Derivatives (at upload):** thumb 128, modal 640, preview 320 — from 64px card / modal hero / admin preview.
    - **Retention grace:** 7 days before sweep of unreferenced hashes.
    - **Backup:** `scripts/backup-postgres.mjs` copies the upload directory beside the dump.

    ---

    ## Phase 4 — Admin menu (verified + extended)

    Sprint 8 already delivered CRUD, currency parsing, unverified clear, bindings, curation. Added: image upload/detach, atomic `POST …/menu/reorder`, binding-count warning before group save, sold-out vs active labels.

    ---

    ## Phase 5 — Trading overrides (passed)

    Kinds: `CLOSE_EARLY`, `OPEN_LATE`, `CLOSED_REST_OF_DAY`, `OPEN_ANYWAY`. Default expiry = end of business date via `resolveBusinessDate` + reset hour.

    **Precedence (single place: `packages/db/src/trading-state.ts`):**

    1. `acceptingOrders` switch OFF → authoritative (reason `ACCEPTING_ORDERS_OFF`)
    2. Active override → authoritative over schedule
    3. Weekly hours + closures → base schedule

    `closedReason` reported on store-status.

    ---

    ## Phase 6 — Banner (passed)

    - Trading + prep remain derived; fulfilment stays `Pickup only`.
    - Editable: announcement (≤280, plain text, scheduled), closed message, paused message, prep phrase with `{minutes}`.
    - Reserved announcement row avoids layout shift. Markup escaped by React text rendering.

    ---

    ## Phase 7 — Auth review (passed; redesign deferred)

    - Admin sessions: password, 4h TTL, `purpose=ADMIN`, hashed tokens — appropriate for prices/refunds/uploads.
    - Kitchen PIN sessions remain separate (`purpose=KITCHEN`) — still appropriate for shared devices.
    - **Deferred (not this sprint):** step-up / shorter TTL for refunds+price+upload; hardware-backed session binding.
    - Default-deny: `ADMIN_ROUTE_REGISTRY` + `requireAdmin` refuses undeclared paths.
    - Audit: `details` JSON with before/after on price and config mutations.

    ---

    ## Phase 8–9 — Storefront + contract 1.3.0

    Additive fields: `imageDerivatives`, `closedReason`, `closedMessage`, `prepEstimatePhrase`, `announcement`. Version `1.3.0` everywhere published. Mock health bumped. OpenAPI updated.

    ---

    ## Phase 10 — Outstanding business inputs

    Unchanged business work now doable in `/admin`: eight unverified prices, photos, modifiers, hours, curation, announcements, overrides.

    ---

    ## Deviations

    1. Wallet methods (Apple/Google/Cash App) marked **blocked** on HTTP localhost rather than failed — cannot tokenise without HTTPS + domain registration.
    2. Production Square leg **blocked** — credentials not supplied.
    3. Admin auth redesign deferred per sprint scope; recorded in Phase 7.
    4. `cnon:card-nonce-rejected` returns processor 404 → INTERNAL_ERROR; documented decline path uses `cnon:card-nonce-declined` → `PAYMENT_DECLINED`.
