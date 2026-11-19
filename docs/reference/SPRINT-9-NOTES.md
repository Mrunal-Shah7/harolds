<!-- SPRINT-9: security hardening, observability, backups, failure testing — decisions, gates, leftovers. -->

# Sprint 9 Notes — Security Hardening, Observability, Backups & Failure Testing

Harold's Chicken Oak Lawn. Pickup only, guest checkout, ASAP only. Public contract remains **1.2.0**. No new storefront features.

---

## Phase 1 — Carry-forward audit

| Item | State |
|---|---|
| Sprint 5 printer failure drills (paper / cover / power / network) | **Blocked** — needs a person at the TM-m30III. Unchanged since Sprint 5. |
| Physical kitchen ticket showing modifiers | **Blocked** — no printer in this environment. Layout + XML escape tests cover the bytes. |
| Android audio unlock on the kitchen display | **Blocked** — no Android / Swan device. |
| Swan 1 Pro kiosk walkthrough | **Blocked** — runbook exists; device not on hand. |
| Seeded test staff accounts | **Capability ready** — `/admin/staff` can create real accounts and deactivate these. Seed still upserts the three `test-*@localhost` rows. |
| Eight placeholder-priced items | **Capability ready** — editing a price clears `isUnverifiedPrice`. Count remains 8 until business input. |
| Four provisional modifier groups | **Capability ready** — editing clears `isProvisional`. Real per-item data was not supplied. |
| Empty featured / most-ordered | **Capability ready** — `/admin/menu/curation`. Still empty. |
| Manager alert phone and email | **Capability ready** — Store screen. Seeded placeholders remain. |
| Contact phone | **Blocked** — business input. |
| Exact per-day opening hours | **Blocked** — seeded uniform week is still provisional. |
| Workbook CONFLICT / DUPLICATE? / REVIEW rows | **Blocked** — business input. Seeded verbatim since Sprint 1. |
| Item photographs | **Blocked** — not supplied. |
| A2P 10DLC | **Blocked** — not started (Sprint 7). |
| Production Square, production domain, TLS | **Blocked** — Sprint 10. |
| Unresolved Sprint 8 code debt that this sprint could fix | **None blocking.** Kitchen/admin `console.error` on failure paths now go through `emitLog`. |

Phase 1 verification: existing tests passed before hardening; `pnpm db:verify` exited 0 (87 items, 8 unverified, 4 provisional).

---

## Rate limits and exemptions

In-process sliding window. One Node process; no Redis. Clients are keyed by address: with `TRUST_PROXY=1`, the **left-most** `X-Forwarded-For` hop; without it, forwarded headers are ignored (`direct`) so a client cannot spoof the key.

Limits live in Node route handlers, not Edge middleware — isolates do not share the Map.

| Bucket | Limit / window | Surface |
|---|---|---|
| `quote` | 20 / 60s | `POST /api/v1/quote` |
| `orders` | 8 / 60s | `POST /api/v1/orders` (volume; Sprint 4 idempotency still covers double-charge) |
| `menu` | 120 / 60s | public menu GETs |
| `storeStatus` | 120 / 60s | `GET /api/v1/store/status` |
| `orderStatus` | 30 / 60s | `GET /api/v1/orders/status/[lookupToken]` |
| `kitchenSignin` | 20 / 60s | kitchen PIN sign-in |
| `adminSignin` | 20 / 60s | admin password sign-in |
| `adminApi` | 120 / 60s | every authenticated admin route via `requireAdmin` |
| `kitchenOther` | 60 / 60s | kitchen session + transition (not the queue) |
| `clientError` | 20 / 60s | `POST /api/internal/client-error` |

429 body uses operational code `RATE_LIMITED` with `Retry-After` and `X-RateLimit-Limit`. **Not** added to the frozen OpenAPI `ApiErrorCode` enum (public contract unchanged).

### Exemptions (deliberate)

| Path | Reason |
|---|---|
| `/api/v1/print/poll` | Printer polls every five seconds, forever. A limit here stops kitchen tickets. |
| `/api/v1/print/complete` | Same device, same secret, completion posts. |
| `/api/v1/webhooks/square` | Square retries and bursts. A limited webhook recreates Sprint 4's payment-state divergence. |
| `/api/v1/webhooks/twilio` | Same class of provider retry/burst. Extra exemption, documented so it is not mistaken for a forgotten Square-only rule. |
| `/api/internal/kitchen/queue` | Kitchen display polls every three seconds during service. |
| `/api/v1/health` | External uptime monitors must not 429 the dependency check. |

`enforceRateLimit` also no-ops when the request path is exempt, so a future caller cannot accidentally wrap the printer.

Body caps: public JSON 32 KiB, admin JSON 64 KiB, webhooks 1 MiB, print 256 KiB. Oversized or malformed JSON is `400 VALIDATION_ERROR`, never 500. Content-Length is checked before parse.

---

## Validation sweep (Phase 3)

Gaps found and fixed:

1. Public POST quote/orders and kitchen/admin sign-in now use `readBoundedJson` (oversize before parse; malformed JSON → validation).
2. Square webhook and print SDP already read text; added explicit byte caps.
3. `handleRouteError` / `adminAuthError` / `kitchenAuthError` map `SyntaxError` to validation (remaining admin `request.json()` sites).
4. Kitchen/admin unhandled errors no longer `console.error` the raw `err` object (could contain request-adjacent fields).

Already solid (confirmed, not re-written): Sprint 3 cart parser; Sprint 8 admin form validation; Prisma tagged-template raw SQL in `order-numbers.ts`, `jobs.ts` `claimDueJobs`, `print-jobs.ts` `claimNextPrintJob`.

Output encoding: ticket `preparePrintText` (fold + `escapeXml`); email `escapeHtml`; React text on admin and kitchen. A customer note containing `<script>` / `<img>` is text in all three. Ampersands in item names are escaped in XML and HTML.

---

## Secrets

See `docs/SECURITY.md` for the inventory. None are in git (`git ls-files` has no `.env`). None have a working default in `parseEnv`.

Print secret residual risk: query string on the device URL. Nginx must use `combined_no_query` for `/api/v1/print/` (`docs/PRINT-RUNBOOK.md` §6). Rotation: `node scripts/rotate-print-secret.mjs`, then `.env` + printer page in the same window. Invalid secret → 401, no serial in body or unauth logs.

Did **not** enforce a 32-character minimum at env parse — tests and local `.env` use shorter values; production operators generate long secrets with the helper. Enforcing length would have broken `next build` / the test suite rather than production hygiene.

---

## Transport, headers, sessions (Phase 5)

- Production + `TRUST_PROXY` + `X-Forwarded-Proto: http` → 308 HTTPS. Node itself speaks HTTP to nginx; without `TRUST_PROXY` a local `next start` is not redirected (Next injects `X-Forwarded-Proto: http` on localhost). HSTS still only when the request is actually HTTPS.
- HSTS only when production **and** HTTPS (six months, includeSubDomains).
- CSP allows Square CDN / `squareup.com` / sandbox equivalents on script, frame, and connect. `unsafe-inline` / `unsafe-eval` required for App Router without nonces.
- Real API: no CORS headers. Mock: `origin: *` still.
- Kitchen: `localStorage`. Admin: httpOnly cookie. Documented as an intentional split.

**Card payment with CSP active:** **blocked** for a live browser click-through. The storefront is still the Sprint 1 placeholder (`apps/web/src/app/(storefront)/page.tsx`). Inventing a checkout UI is out of sprint. CSP unit tests assert Square origins. Checkout service tests still pass against mocked Square. Sprint 10 / a storefront sprint must re-test a sandbox card with this CSP before going live.

---

## Logging and redaction (Phase 6)

JSON lines via `emitLog`. Fields: `ts`, `level`, `event`, optional `requestId` / `orderId` / `jobId` / `scope`. `x-request-id` is set in middleware and bound with `AsyncLocalStorage` (`enterWith`). Paid-order jobs store `correlationId` on the payload; the worker logs it as `requestId`.

Redaction is by field name in `packages/config/src/log.ts`. A deliberate `{ password, token, customerEmail }` capture becomes `[redacted]` without the call site knowing.

### Prior-sprint log audit

| Finding | Resolution |
|---|---|
| `@harolds/sms` / `@harolds/email` `console.info` JSON with `to:` (already masked, but bypassed the central layer) | Routed through `emitLog` as `toMasked`. |
| `@harolds/square` logger | Already `emitLog`. |
| `print-jobs.ts` / `jobs.ts` / `order-status.ts` string `console.warn` | `emitLog`; session ids no longer interpolated into kitchen transition lines. |
| Kitchen/admin route `console.error(err)` | Event name + error `name` only. |
| Print idle polls at info | `print.poll_idle` at **debug**. Unknown serial logged without the serial. |
| Seed, verify, reconcile CLI, tests | Left as human consoles — not the request path. |

Production log volume: info-level, polls at debug. Rotation documented in `docs/SECURITY.md` (14 days, `copytruncate`). Applied on the Ubuntu host in Sprint 10.

---

## Health check (Phase 7)

`GET /api/v1/health` (unauthenticated, rate-limit exempt):

- `ok` is true only when **both**:
  - database: `SELECT 1` succeeds within 2s
  - worker: last `markWorkerPass()` (after every job-worker tick, including idle) is newer than `WORKER_STALE_MS` (default 30s). During the first 30s after start, `startedAt` counts as up so boot is not a false outage.
- Otherwise HTTP **503**, body still the snapshot (`checks.database`, `checks.worker`, `squareEnvironment`, `nodeEnv`).
- Additive fields; contract version stays `1.2.0`.

**Database unreachable:** unit test injects `databaseUp: async () => false` → `ok: false`, `checks.database: "down"`. Did **not** stop the operator's local PostgreSQL service (shared with this workspace). Equivalent to a down database for the checker's contract.

**Worker stale:** `resetWorkerHeartbeat()` → `checks.worker: "down"`, `ok: false`.

Heartbeat is stored on `globalThis`. A first live `next start` showed `checks.worker: down` while `jobs.started` had logged — instrumentation and the health route do not share module-scope `let`s. Same pattern as the Prisma client singleton. After the fix, `GET /api/v1/health` returned `ok: true`, `checks.database: up`, `checks.worker: up`.

**Error tracking:** `captureException` writes a redacted ring buffer, structured `error.captured`, and optionally POSTs to Sentry if `SENTRY_DSN` is set. Wired from `handleRouteError`, the job worker `tick` catch, and `ClientErrorReporter` (browser). Deliberate capture in tests includes `{ password, token, customerEmail }` and asserts they are `[redacted]`. `SENTRY_DSN` stays optional so `NODE_ENV=production` during `next build` does not fail parse.

**External uptime alerts to a human:** **blocked** until production domain + an account that is not Twilio/Resend (Sprint 10). The health endpoint is the probe target. The alerting gap Sprint 7 named (SMS-channel failure cannot be alerted by SMS) is closed *architecturally* by using an independent monitor; it is not subscribed yet.

---

## Backup and restore (Phase 8)

| Knob | Value |
|---|---|
| Command | `pnpm backup` → `pg_dump --format=custom --no-owner` |
| Prisma `?schema=public` | Stripped before `pg_dump` (otherwise "invalid URI query parameter: schema") |
| Local output | `backups/` (gitignored) |
| Production storage | Off the database disk (Sprint 10 object storage / second host). A same-disk copy is not the production plan. |
| Schedule | Daily, plus immediately before any production migration |
| Retention | ≥ 14 days |
| Restore | `pnpm backup:restore <dump> harolds_sprint9_restore` — refuses target name `harolds` |
| Verify | `scripts/verify-restore.mjs` — every table count, StoreConfig singleton, sample orders with line counts |

**Restore drill (this sprint):**

- Dump: `backups/harolds-2026-08-15T12-21-41-210Z.dump` (local drill copy; discarded after verification)
- Target: `harolds_sprint9_restore` (separate database, then dropped)
- `pg_restore` duration: **562 ms** (earlier drill of a previous dump: 609 ms)
- Verification: 22/22 tables matched live at restore time, including Category 17, MenuItem 87, Order 12 / OrderLine 13, StoreConfig `default|1010|HC-`, five most recent orders with matching line counts. An earlier restore of a dump taken *before* a test run differed on `BackgroundJob` (61 vs 63) and `AdminAuditLog` (148 vs 169) — that is point-in-time correctness, not data loss. The matching drill is the recorded one.

Windows `pg_dump` lives at `C:\Program Files\PostgreSQL\18\bin`. Override with `PG_BIN`.

---

## Failure scenarios (Phase 9)

Exercised via existing Sprint 4–7 tests, new health/rate-limit tests, and the restore drill. Live Square/Twilio/disk-fill were not used (no live credentials/hardware; filling the disk is unsafe on a shared Windows machine).

| # | Scenario | Customer | Staff | Logs | Alerts | Recovery |
|---|---|---|---|---|---|---|
| 1 | Database unreachable | Storefront/API fail clearly (health 503; handlers → `INTERNAL_ERROR` envelope, not a hang). No partial paid order: pending insert and capture are ordered so a down DB fails before Square or fails closed. | Admin/kitchen cannot load. | `api.unhandled` / health checks `database: down`. | External monitor (Sprint 10) — app cannot self-alert if DB is the outage. | Automatic when Postgres returns. |
| 2 | Square unreachable at checkout | `PAYMENT_FAILED`, told not to retry. `processorPaymentId` recorded when known. Order `UNKNOWN`. | Reconcile surfaces it. | `transport_failure` via Square logger (redacted). | Manager payment-discrepancy job if webhook later disagrees. | Webhook or `pnpm reconcile`. Do not retry the card. |
| 3 | Square webhooks stop | Sync capture still pays and allocates the number, enqueues print + notify. | Reconcile lists divergence if any unpaid completed charges exist. | Webhook route silent. | Reconcile `--alerts`. | Restore webhook URL; replay/retries. |
| 4 | Twilio unreachable | Order still paid, printed, on the KDS. SMS job retries with backoff, then `DEAD`. | Dashboard jobs; kitchen unaffected. | `sms.failed`, `jobs.executed` / dead. | `ALERT_MANAGER_JOB_DEAD` — **not** via SMS if SMS is the failure (recursion guard). | Restart Twilio; retry dead job from admin. |
| 5 | Email provider unreachable | Same as 4 for the receipt job. Fulfilment unaffected. | Same. | `email.failed`. | Same dead-job path. | Retry dead `EMAIL_ORDER_RECEIPT`. |
| 6 | Printer offline | Order still on kitchen display. Ticket queues. | KDS shows the order; unack escalation then manager print-failed / unacked jobs (Sprint 5/6). | `print.poll_idle` at debug; sweeper warnings at info/warn. | Unacknowledged-order alert once per window. | Printer returns; claim resumes. |
| 7 | Kitchen display offline | Tickets still print; orders still complete via printer-driven PAID→PRINTED. Ready SMS waits for a tap that is not happening — staff use admin status or bring the KDS back. | No board. | Print completions still apply. | Unack alert if nobody advances the order. | KDS reload; localStorage session survives. |
| 8 | Worker stops | New jobs stay `PENDING` (not lost). Health 503 (`worker` stale/down). | Dashboard shows pending. | No `jobs.pass` lines. | External health monitor (independent path). | Restart process; worker drains the queue. |
| 9 | Disk full | Postgres and Node fail loudly (cannot write WAL / cannot append logs). Risk is halt, not silent success. Do not expect silent corruption — Postgres refuses commits. | Everything down. | May be unable to log. | External monitor. | Free disk, restore from off-box backup if files are damaged. **Not physically filled in this environment.** |
| 10 | Sustained load | Order numbers remain contiguous (Sprint 4: 45 concurrent allocators, unique sequences). Rate limiter sheds excess quote/order volume with 429. | Kitchen/print exempt so tickets keep moving. | 429s on quote/orders. | None for 429. | Automatic after the window. Full checkout-vs-Square load was not run (no live charges). |

**No scenario produces a paid order invisible to both printer and KDS** — print jobs and the queue read the same paid rows. **No scenario duplicates a charge** — Square idempotency key `pay:{orderId}`. **No gap/duplicate in order numbers** — row lock + unique `(businessDate, orderSequence)`. Alerts that should fire do so once per window (`JOB_ALERT_MAX_PER_WINDOW`).

---

## Tests added

- `packages/config`: redaction (including print `?key=`), rate-limit exemptions, Square CSP sources.
- `apps/web`: limiter threshold/recovery/Retry-After, trusted-proxy left-most address, printer/webhook/queue exemption at printer rate for several simulated minutes plus a Square burst, health DB-down and worker-stale, capture redaction, body cap before parse, malformed JSON → 400, invalid print secret.
- `packages/notify`: email HTML escapes customer notes and item names.

No test requires live provider credentials or a physical printer.

Full suite this sprint: **262 passing** (config 14, email 4, sms 4, print 22, pricing 54, square 14, db 107, notify 20, web 23).

---

## Deviations

1. **`RATE_LIMITED` is not in OpenAPI** — public contract frozen.
2. **Twilio webhook also exempt** — same burst/retry class as Square.
3. **`SENTRY_DSN` optional** — required-in-production would fail `next build`.
4. **Print secret length not enforced at parse.**
5. **CSP `unsafe-inline` / `unsafe-eval`** for Next without nonces.
6. **Health DB-down tested by injected checker**, not by stopping the operator's Postgres.
7. **Live several-minute printer HTTP poll** — **passed.** `next start` on port 3000: 36 authenticated polls at 5s over 175.6s, **0** limited; Square webhook burst of 40, **0** limited. CSP Square origins, `X-Frame-Options: DENY`, `nosniff`, no CORS, `x-request-id` present. Malformed quote → 400.
8. **Card-pay-with-CSP and full browse→pay E2E** blocked by placeholder storefront. Quote/menu/health/print-auth still covered.
9. **External human uptime alerts** blocked until Sprint 10 domain + independent monitor account.
10. **Disk-full** documented, not executed.
11. **ALS `enterWith`** instead of wrapping every handler in `run`.
12. **Not all admin POSTs rewritten to `readBoundedJson`** — sign-in is; others rely on SyntaxError mapping + 64 KiB is not universal there. Public quote/orders are capped. Residual: a huge admin JSON might parse before rejecting if Content-Length is missing; admin is authenticated and rate-limited.
13. **`pg_dump` URI** must drop `schema=` (Prisma query param).

---

## Outstanding business inputs (updated)

1. Real prices for the eight unverified beverage/dessert items.
2. Real per-item modifier data replacing the four provisional groups.
3. Featured and most-ordered curation.
4. Manager alert phone and email (replace placeholders).
5. Exact store contact phone.
6. Exact per-day hours.
7. Workbook CONFLICT / DUPLICATE? / REVIEW rows.
8. Deactivate seeded test accounts after creating real staff.
9. A2P 10DLC brand + campaign; Twilio; verified email domain.
10. Item photographs.
11. Android kitchen audio; Swan 1 Pro walkthrough; printer failure drills; physical modifier ticket.
12. Production Square, domain, TLS, nginx query-string omission, off-box backups, logrotate, Sentry DSN, independent uptime monitor (Sprint 10).
13. Storefront payment UI — required before a CSP card-payment click-through can be confirmed.
