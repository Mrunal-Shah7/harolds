<!-- SPRINT-11: production safety, verification debt, launch readiness — what ran, what was found, what remains. -->

# Sprint 11 Notes — Production Safety, Verification Debt & Launch Readiness

Harold's Chicken Oak Lawn. Pickup only, guest checkout, ASAP only. Public contract **1.2.0** (unchanged).

This sprint built no features. It closed gaps the last four sprints deferred, restored a weakened test, and proved several behaviours over HTTP that had only been unit-tested.

---

## Phase 1 — Production seed safety

Seed logic lives in `packages/db/src/seed/run.ts`. CLI: `pnpm db:seed` (all), `pnpm db:seed:menu`, `pnpm db:seed:accounts`.

**Observed production refusal** (`NODE_ENV=production pnpm db:seed` against the development database):

```
Refusing to create, update, or reactivate test accounts against a production database.
Test logins (test-staff@localhost, test-manager@localhost, test-owner@localhost) must not exist in production.
To correct catalogue data, run the menu seed only: pnpm db:seed:menu
```

`--allow-existing-orders` still cannot create test accounts in production. Menu-only against a database that already had 12 orders refused until that flag is passed.

**Previously overwriting (now insert-if-absent / preserved):** store contact phone, tip presets, tax, hours, manager alerts, `acceptingOrders`, `isBusy`, order-number counter, curated flags, `isSoldOut`, `imageUrl`, option sold-out. Catalogue name/price/slug still update from the workbook on `--menu-only` so production menu correction remains possible without touching accounts.

Development seed on a fresh database is unchanged (accounts + menu + insert-if-absent config).

---

## Phase 2 — Required production configuration

Production start requires, named together when missing:

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`
- `PRINTER_SDP_SHARED_SECRET` length ≥ 32 (Phase 4, same list)

Then, once the database is reachable: manager alert phone/email must not be the seeded placeholders (`TODO: SET MANAGER ALERT PHONE`, `todo-manager-alerts@localhost`) and at least one sendable destination must exist.

**Deviation:** `next build` sets `NODE_ENV=production` while collecting page data. Those guards are skipped when `NEXT_PHASE` is set so CI can compile without live credentials. They apply at `node server.js` / `next start`. Sprint 9 did the same kind of split for Sentry.

Startup summary event: `app.startup_summary` (`nodeEnv`, `squareEnvironment`, `smsConfigured`, `emailConfigured`, `alertingConfigured`, `errorTrackerConfigured`, `printerSerial`). `emailConfigured` was initially redacted by the Sprint 9 field-name rule; capability flags ending in `Configured` are no longer treated as secrets.

Development start with Twilio/email empty succeeded. Full test suite runs without provider credentials.

---

## Phase 3 — Scheduled reconciliation

Interval: check every **15 minutes** (`RECONCILE_CHECK_INTERVAL_MS`, default 900000). Due at store-local hour **4** (`RECONCILE_HOUR_LOCAL`). Lookback **48 hours**. Uses Sprint 2 `resolveBusinessDate`, not the calendar date.

One `ReconciliationRun` row per business date (unique). Restarts skip with `already_ran`. Observed: first process start on 2026-08-15 ran (`findingCount: 0`); the next start the same business date logged `reconcile.skipped reason=already_ran`.

The scheduled pass writes only `ReconciliationRun` plus **one** `ALERT_MANAGER_PAYMENT_DISCREPANCY` job when findings exist (the Sprint 4 CLI's per-finding alerts are disabled on this path so a discrepancy raises exactly one manager alert). Tests create an orphan Square payment and assert that.

Dashboard card: last run, business date, finding count, overdue if never run or last run > 26 hours.

**Deviation:** the scheduler ticks immediately on start as well as on the interval, so a process that comes up after hour 4 does not wait 15 minutes. The print sweeper still waits one interval; reconciliation is daily and a missed morning pass is worse.

---

## Phase 4 — Residual validation and secret hardening

Every JSON body-accepting route uses `readBoundedJson` / `readAdminJson`. No `request.json()` remains under `apps/web`. Enumeration test walks every `route.ts`.

**JSON body routes (bounded reader):**

Public: `POST /api/v1/quote`, `POST /api/v1/orders`, `POST /api/internal/client-error`.

Admin: signin; store PATCH; hours PUT; closures POST/PATCH; staff POST/PATCH; print POST; orders cancel/refund/reprint/status; modifiers CRUD/bindings/options; menu items/categories/curation/sold-out; jobs POST and jobs/[id] POST.

Kitchen: signin; order transition.

**Non-JSON bodies, still capped before use:** Square webhook and Twilio webhook (`BODY_LIMITS.webhookBytes`); print poll/complete via `sdp-handler` (`BODY_LIMITS.printBytes`).

**No body:** admin/kitchen signout, sold-out/clear, most GETs.

Oversized body without Content-Length is rejected after `request.text()` and before `JSON.parse`. Malformed JSON sweep over HTTP: quote, orders, admin signin, kitchen signin, admin sold-out — all **400**, none **500**.

Print secret: production start fails if shorter than 32; development accepts `secret`.

---

## Phase 5 — Test integrity

Sprint 10 changed `retryDeadJobsByType` to assert whatever count existed. Restored: `assert.equal(n, 1)` with `{ testPrefix: MARKER }` — the Sprint 7 isolation mechanism.

**Isolation approach chosen:** tests clean up after themselves **and** use `testPrefix` / client-idempotency prefixes. Not a dedicated test database (this machine's suite already targets the development Postgres; splitting would be a new operational surface).

**Audit of similar patterns:** `report.counts.PENDING >= 1` and print-queue `QUEUED >= 2` are lower bounds on a shared database, not runtime-derived expected values. They can still pass if leftover rows exist; they cannot hide a zero when the fixture failed to insert. Left as-is. No other Sprint-10-style “assert the count we just observed” tests were found.

Suite passed against leftover rows, against the same database after seeding-style fixtures, and twice in succession with identical counts.

---

## Phase 6 — Reporting reconciliation

**Origin of the non-reconciling fixture:** hand-built in `packages/db/src/admin-reports.test.ts` (Sprint 8), not an engine-produced checkout. It stored `totalCents: 879`, `taxCents: 89`, `tipCents: 0`. 89¢ is 1010 bps of 879, not of the implied subtotal 790. The live development order that *does* reconcile (`HC-S6-HTTP`, 1598 + 161 + 200 = 1959) was produced through checkout in Sprint 6.

**Fix:** reporting tests now call `quoteCart` and persist those cents. Invariant: `subtotal + tax + tip === total` per order; report aggregates equal stored sums. `admin-reports.ts` still never calls `applyBasisPoints`.

**Development database (after this sprint's sandbox e2e, 9 paid rows):** every row summed; report totals matched stored sums (gross 4898 after the new 968¢ order). Earlier in the sprint, 8 paid rows summed to gross 3930 / tax 342 / tip 200.

---

## Phase 7 — Verification debt

**Sold-out over HTTP:** public menu, conditional 304, admin toggle, immediately following GET showed `isSoldOut: true` and a new ETag (`menu-1786801088361` → `menu-1786801685010`). Restored after. No delay.

**Health with DB unreachable:** second Next instance on :3002, `DATABASE_URL` rewritten to `harolds_s11_does_not_exist`. Working `harolds` database left running. `GET /api/v1/health` → **503**, `ok: false`, `checks.database: down`.

**Kitchen ticket with modifiers:** printer not reachable. Recorded `docs/sprint11-kitchen-ticket-preview.txt` — 1/2 CHICKEN with MILD, ADD FRIES, ADD CHEESE, and a wrapped customer note, plus the ePOS-print XML. Still on the hardware list.

---

## Phase 8 — Storefront readiness

`pnpm mock` (no `.env`, no database) served the documented journey. Drift found and **fixed:** the mock accepted orders without `customer.smsConsent` / `email` / `paymentToken`. It now matches the real checkout contract. Documented triggers (forceError, X-Mock-Error, forceStore, forceSoldOut, forcePayment declined/transport, create + lookupToken status) all passed.

**Clean clone caveat:** git `HEAD` is still the Sprint 2 commit; sprints 3–11 are uncommitted on this working tree. A clone of `HEAD` would not include quote/orders. The handoff steps were exercised on the current tree with no env file.

[`docs/STOREFRONT-REQUIREMENTS.md`](./STOREFRONT-REQUIREMENTS.md) consolidates Square tokenisation, idempotency, lookupToken, validation classes, declined vs failed, orderable+priced cart, explicit SMS consent, never sending prices, and CSP origins (do not silently loosen).

---

## Phase 9 — Deployment rehearsal

**Errors found in the written procedure:**

1. Standalone `server.js` is `apps/web/.next/standalone/apps/web/server.js`, not `apps/web/.next/standalone/server.js`. Caused by the monorepo; `outputFileTracingRoot` is now the repo root.
2. `static` and `public` must be copied into that nested tree.
3. systemd `WorkingDirectory` / `ExecStart` in Sprint 10's unit file were wrong.
4. Twilio/email are required at **start**, not at **build**.

**Rehearsed:** `pnpm build`; `pnpm db:migrate:deploy` on `harolds_s11_scratch` (10 migrations, then dropped); production-mode `node server.js` with dummy (not live) Twilio/email and a 32-character print secret against the scratch DB with sendable alert destinations; `app.startup_summary` showed sms/email/alerting configured, Square still sandbox on this machine; rollback by starting an identical copy of the standalone tree.

**Not rehearsed:** Ubuntu provisioning, TLS, nginx, systemd on a real host, a previous git-tagged build (none exists after Sprint 2).

**Irreversible migrations:** documented in `DEPLOYMENT.md`. Sprint 11 `ReconciliationRun` is additive and droppable; money/print/kitchen/jobs/admin are not.

---

## Phase 10 — Tests and docs

Tests cover seed guards, production env requirements, scheduled reconcile single-run, bounded reader enumeration, restored `n === 1`, reporting summing invariant. No live credentials or hardware required.

[`LAUNCH-BLOCKERS.md`](./LAUNCH-BLOCKERS.md) updated. Storefront absence is the prominent remaining block.

---

## Deviations from this prompt

1. Production provider checks skip during `next build` (`NEXT_PHASE`). Start still fails.
2. Reconcile scheduler ticks once immediately on start.
3. Mock checkout fields aligned with the real API (drift fix, not a new feature).
4. Log redaction allows `*Configured` booleans.
5. Missing `emitLog` / printer imports in `sdp-handler.ts` restored so typecheck passes.
6. Did not physically print a ticket.
7. Did not clone git `HEAD` for the handoff (would omit this sprint).
8. Rollback used a copy of this build, not an older tag.
9. Temporarily widened store hours for the sandbox e2e (store closed at ~08:50 Chicago), then restored.
10. Production standalone rehearsal used dummy Twilio/email, not live credentials.
11. No subagents (as required). Every process started was stopped.

---

## Workspace gates

| Check | Result |
|---|---|
| `pnpm test` run 1 | 287 passed, 0 failed (config 22, email 4, sms 4, pricing 54, print 22, square 14, db 120, notify 20, web 27) |
| `pnpm test` run 2 | identical counts |
| `pnpm typecheck` | passed |
| `pnpm lint` | passed (0 errors; pre-existing `process.env` warnings in `packages/db` and `packages/mock-api`) |
| `pnpm build` | passed after start-vs-build split |
| `pnpm openapi:validate` | 12 paths, 10 error codes, **1.2.0** |
| `pnpm db:verify` | invariants passed; 8 unverified prices; 4 provisional groups |

End-to-end against sandbox: menu → quote → order (`cnon:card-nonce-ok`, `HC-001` / 968¢) → two print jobs queued → kitchen `PAID → IN_PROGRESS` → notification jobs on the dashboard.
