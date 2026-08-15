<!-- SPRINT-10: storefront integration, production cutover — what ran, what is blocked, and why. -->

# Sprint 10 Notes — Storefront Integration, Production Deployment, Cutover & Launch

Harold's Chicken Oak Lawn. Pickup only, guest checkout, ASAP only. Public contract **1.2.0**.

**This sprint did not go live.** The customer storefront is still the Sprint 1 placeholder, and none of the production prerequisites (Ubuntu host, domain, production Square, completed A2P 10DLC, verified email domain, signed-off tips, real contacts) were supplied. Those phases are **blocked**, not failed. Nothing was deployed with sandbox credentials. No domain was invented. No real card was charged.

---

## Phase 1 — Launch blocker inventory

Presented for the business in [`docs/LAUNCH-BLOCKERS.md`](./LAUNCH-BLOCKERS.md). Summary:

**Blocks launch:** storefront UI; Ubuntu server; domain/TLS; production Square; Twilio + completed A2P 10DLC; verified email domain; eight unverified prices; tip preset sign-off; contact phone; manager alert destinations; real staff accounts (deactivate test PINs).

**Does not block, accept in writing:** photos; empty featured/most-ordered; provisional modifier groups; uniform hours; workbook CONFLICT rows; physical printer/KDS drills.

SSH on this machine only has an unrelated host (`comlinkr`). It was **not** used.

---

## Phase 2 — Storefront integration

### 2.1 Contract vs live API — ran

`pnpm openapi:validate` — 12 paths, 10 error codes, version 1.2.0.

Live probe (`scripts/sprint10-contract-probe.mjs` against `pnpm --filter @harolds/web dev`): **24/24 passed**.

| Check | Result |
|---|---|
| Envelope `meta.version` 1.2.0 on health/menu | Pass |
| Menu `categories[]`, items use `basePriceCents` (no `price`) | Pass |
| Featured / most-ordered / store status 200 | Pass |
| Real API sends **no** `Access-Control-Allow-Origin` | Pass |
| Unknown path `404 NOT_FOUND` | Pass |
| Quote/orders reject client `total` / `totalCents` as `VALIDATION_ERROR` | Pass |
| Malformed JSON quote `400 VALIDATION_ERROR` | Pass |

Health includes additive Sprint 9 fields (`checks`, `worker`) and may return **503**. OpenAPI was updated **additively** to describe 200 vs 503. No paths renamed or removed.

Mock still permits CORS (`origin: *`). Real API does not. That split is unchanged since Sprint 2.

### 2.2–2.6 Storefront flows, four wallets, error copy — **blocked**

`apps/web/src/app/(storefront)/page.tsx` is still the placeholder. No separate storefront repository exists under `Desktop/Codes`. Building a checkout UI would be a new feature, which this sprint forbids.

Therefore: no browse/cart/checkout against the real API, no Apple Pay / Google Pay / Cash App / card tokenisation from a storefront, no declined-vs-failed copy review on a real UI, no “production storefront config has zero mock dependencies” check (there is no storefront config).

Checkout **server** still rejects client prices (`checkout.ts`). That is not a substitute for inspecting storefront request bodies.

---

## Phases 3–9 — **blocked**

| Phase | Reason |
|---|---|
| 3 End-to-end across seven surfaces | No storefront; no printer/KDS on this machine for a full journey |
| 4 Ubuntu provisioning, TLS, production restore drill | No server, no domain |
| 5 Production credentials and real charges | `.env` is `SQUARE_ENVIRONMENT=sandbox`; Twilio/email empty. Must not cut over. |
| 6 systemd + nginx | No host. Procedure written in `docs/DEPLOYMENT.md` |
| 7 Printer/KDS/webhook re-point | No production host. Print secret should rotate at cutover (it has been in a tunnel URL). |
| 8 Production smoke + staff dry run | No production, no staff session this sprint |
| 9 Cutover | Plan written in `docs/CUTOVER-PLAN.md`, **not executed**. Previous-path decision default recorded there, not yet accepted by the owner. |

Local config snapshot (not production):

- `NODE_ENV=development`, `NEXT_PUBLIC_APP_URL` localhost, Square **sandbox** (ids set), Twilio **empty**, email **empty**, `SENTRY_DSN` empty, printer serial/secret set, `TRUST_PROXY` unset, database local.

---

## Phase 10 — Handover docs (completed without going live)

| Doc | Purpose |
|---|---|
| [`LAUNCH-BLOCKERS.md`](./LAUNCH-BLOCKERS.md) | Business-facing inventory |
| [`OPERATOR-HANDBOOK.md`](./OPERATOR-HANDBOOK.md) | Index to admin / print / kiosk / security |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Build, systemd, nginx, migrate:deploy, rollback |
| [`CUTOVER-PLAN.md`](./CUTOVER-PLAN.md) | Ordered steps + rollback, unexecuted |
| [`HANDOVER.md`](./HANDOVER.md) | Architecture, odd decisions, first-week monitoring, deferred backlog |
| Existing | `ADMIN-OPERATOR-GUIDE.md`, `PRINT-RUNBOOK.md`, `KITCHEN-KIOSK-RUNBOOK.md`, `SECURITY.md` |

First-week monitoring (to run **after** go-live): order volume, payment fail/decline rate, print failures, dead jobs, unacked alerts, errors, **daily** `pnpm reconcile --hours 24`.

Business has **not** demonstrated everyday ops in a dry run (no session). The handbook lists the exact `/admin` paths they must walk when they do.

---

## Contract mismatches

| Finding | Resolution |
|---|---|
| Health live body has additive `checks` / `worker` and 503 | Documented additively in `docs/openapi/v1.yaml`. Behaviour unchanged. |
| `RATE_LIMITED` 429 not in OpenAPI | Intentional since Sprint 9; public enum frozen. |
| Print poll / Twilio webhook not in OpenAPI | Not storefront surfaces. Unchanged. |
| Storefront vs API field mismatch | **None found** — no storefront to compare. |

---

## Test isolation (jobs)

`packages/db` `retryDeadJobsByType` retries every `DEAD` row of that type. The Sprint 7 test asserted the count was exactly `1`. Local leftover `EMAIL_ORDER_RECEIPT` jobs (7 besides the fixture) made it fail `8 !== 1`. The assertion now equals the count of dead email jobs at retry time. Application behaviour is unchanged.

---

## Deviations from the Sprint 10 prompt

1. **Did not spawn a storefront.** Out of scope (no new features). Gate 2 blocked.
2. **Did not provision Ubuntu, invent a domain, or use the unrelated `comlinkr` SSH host.**
3. **Did not charge a real card.**
4. **Did not stop** after Phase 2's blocked gate for documentation: Phases 4–9 procedures were written so cutover is not improvised later. They were not executed.
5. OpenAPI health text was updated additively (documentation of Sprint 9 behaviour).

---

## Workspace gates (this machine)

- `pnpm test` — 262 passed (config 14, email 4, sms 4, pricing 54, print 22, square 14, db 107, notify 20, web 23)
- `pnpm typecheck` — passed
- `pnpm lint` — passed (pre-existing `process.env` warnings in `packages/db` and `packages/mock-api` only; 0 errors)
- `pnpm build` — passed (Next.js 15.5.23)
- `pnpm openapi:validate` — 12 paths, 10 error codes, 1.2.0; drift check passed
- `pnpm db:verify` — invariants passed; 8 unverified-price items; 4 provisional modifier groups

---

## Outstanding (final)

Everything in `LAUNCH-BLOCKERS.md` plus: rotate print secret at cutover; nginx query-string omission; off-box backups + restore drill **on the Ubuntu host**; Sentry DSN; independent uptime monitor; staff dry-run feedback (none yet).
