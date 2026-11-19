<!-- SPRINT-13: carry-forward remediation, prerequisites gate, and (when unblocked) production cutover notes. -->

# Sprint 13 notes — Harold's Chicken Oak Lawn

## Phase 1 — Carry-forward remediation

### 1.1 Menu cache invalidation over HTTP

Script: `scripts/sprint13-menu-cache-http.mjs` (against a running `pnpm dev` / `pnpm start`).

Observed for each mutation class on the **immediately following** `GET /api/v1/menu`:

| Mutation | Evidence |
|---|---|
| Price edit | New `basePriceCents` and changed ETag |
| Item deactivation | Item absent from public catalogue; ETag changed |
| Sold-out toggle | `isSoldOut: true`; ETag changed |
| Image attach | `imageUrl` + `imageDerivatives`; derivatives HTTP 200 |
| Image removal | `imageUrl` / derivatives cleared; ETag changed |
| Reorder | First two item ids swapped in category; ETag changed |
| Category change | Item appears under the target category; ETag changed |

**Both cache layers:**

- **In-process:** mutations call `invalidateMenuCache()`; next HTTP read rebuilds and returns a new ETag.
- **Framework / HTTP:** route keeps `dynamic = "force-dynamic"`, `revalidate = 0`, and `Cache-Control: no-cache, must-revalidate` (confirmed on every probe response). Conditional `If-None-Match` still returns **304** when nothing changed (before and after the mutation sweep).

### 1.2 Restore drill (images included)

Script: `scripts/sprint13-restore-drill.mjs`. Also extended `scripts/restore-postgres.mjs` to accept an optional images backup directory.

| Field | Value |
|---|---|
| Scratch DB | `harolds_sprint13_restore` |
| Scratch images | `data/uploads-sprint13-restore` |
| Restore duration | **2408 ms** (wall clock planting+backup+restore **3407 ms**; see `backups/sprint13-restore-drill-2026-08-24T17-43-58-956Z.json`) |
| Result | DB rows with `imageUrl` and all original + thumb/modal/preview derivatives present |

### 1.3 Test concurrency race

**Race:** `packages/db/src/admin-menu.test.ts` used `findFirst({ isActive: true })`. Parallel `admin-reports.test.ts` creates temporary `s8rep-*` items and deletes them. The menu suite could pick a temporary row, then hit “record not found” on `setItemSoldOut` after the reports suite deleted it.

**Fix:** Scope admin-menu fixtures to seeded catalogue rows (`workbookId: { startsWith: "itm_" }`). Removed `--test-concurrency=1` (already absent from `packages/db/package.json` for this sprint). Suite must pass repeatedly with default parallel file execution.

### 1.4 Processor 404 → payment-failed

**Change:** In `packages/square/src/errors.ts`, payment-mode `statusCode === 404` maps to `transport_failure` (checkout → `PAYMENT_FAILED`), not `client_error` / `INTERNAL_ERROR`. Covers sandbox `cnon:card-nonce-rejected`.

**Audit of other paths that can surface as internal / client_error:**

| Path | Classification | Verdict |
|---|---|---|
| Payment 5xx / timeout / network / idempotency reuse | `transport_failure` → `PAYMENT_FAILED` | Correct (indeterminate) |
| Mapped decline codes (402 etc.) | `declined_payment` → `PAYMENT_DECLINED` | Correct |
| Payment 401 / 403 | `client_error` (auth) → thrown → internal | Correct — our credentials, not a customer retry case |
| Payment 400 unmapped validation | `client_error` (invalid_request) → thrown → internal | Correct — request construction bug |
| Payment **404** (unknown source_id) | **was** `client_error`; **now** `transport_failure` | Fixed — customer must not immediate-retry |
| Missing fields on success response | thrown `SquareClientError` | Correct — unexpected processor shape |
| `getPayment` 404 | returns `null` (not classified) | Correct for lookup |
| Refund declines / transport / auth | refund taxonomy | Unchanged; refund UI is staff-facing |

### 1.5 Wallet verification preparation

Checklist: [`docs/WALLET-VERIFICATION-CHECKLIST.md`](./WALLET-VERIFICATION-CHECKLIST.md).

Summary without a domain:

- Apple Pay requires Square domain registration + file at `/.well-known/apple-developer-merchantid-domain-association` (Square-hosted source file).
- Proxy must serve that path as 200 without exempting the whole `.well-known` tree from policy.
- Existing CSP already allows Square CDN / PCI connect; Phase 8 must confirm the production header after the proxy.
- Google Pay and Cash App Pay need HTTPS + real devices; Cash App may need a same-origin HTTPS redirect URL.

## Phase 1 verification gate

| Check | Result |
|---|---|
| Mutation classes visible on next HTTP menu request; both cache layers | **Passed** (`scripts/sprint13-menu-cache-http.mjs`) |
| Conditional 304 when unchanged | **Passed** |
| Restore recovers DB + images; duration recorded | **Passed** — restore **2408 ms** |
| Test race fixed; concurrency restored; suite parallel | **Passed** — race was admin-menu `findFirst({isActive})` vs admin-reports `s8rep-*`; scoped to `itm_*` |
| Processor 404 → payment-failed; audit complete | **Passed** |
| Wallet checklist exists | **Passed** — `docs/WALLET-VERIFICATION-CHECKLIST.md` |
| Typecheck / lint / build / full suite ×2 identical | **Passed** — typecheck 0, lint 0 (warnings only), build 0; tests EXIT 0 / 0 with identical package pass counts |

---

## Phase 2 — Prerequisites gate

| # | Prerequisite | Status | Notes |
|---|---|---|---|
| 1 | Ubuntu server with sudo | **Absent** | No production host supplied |
| 2 | Registered domain + DNS | **Absent** | Do not invent a domain |
| 3 | Production Square credentials | **Absent** | `.env` is `SQUARE_ENVIRONMENT=sandbox` |
| 4 | Twilio A2P 10DLC **complete** | **Partial → absent** | Twilio vars present; campaign approval not verified as complete |
| 5 | Email provider + **verified** sending domain | **Absent** | `EMAIL_API_KEY` / `EMAIL_FROM_ADDRESS` empty |
| 6 | Real store / manager phones & email | **Absent** | Placeholders remain |
| 7 | Tip preset sign-off | **Absent** | Unsigned since Sprint 1 |
| 8 | Verified prices (eight placeholders) | **Absent** | Still unverified flags in catalogue |
| 9 | Real staff names | **Absent** | Test accounts only |
| 10 | Decision on third-party ordering platform | **Absent** | Not decided |

**Verification (not mere presence):**

- Square: sandbox environment selector — **not** production-ready.
- Twilio: credentials present but A2P completion not confirmed → treat as absent.
- Email: no key / from address → authentication records not checkable.

### Go / no-go

**NO-GO for Phases 3–10.** Phase 1 remediation completes. Phases 3 onward are **blocked**, not failed, until prerequisites 1–10 are supplied and verified.

Cutover window: **not scheduled** (blocked on server, domain, and credentials).

---

## Phases 3–10

**Blocked** — see Phase 2. No production server, domain, or production credentials were provisioned in this sprint.

---

## Deviations

- Did not invent a domain, server, or production Square credentials.
- Did not charge a real card (no production Square).
- Phase 1 was the last application-behaviour change set; Phase 2+ stopped at the gate.
