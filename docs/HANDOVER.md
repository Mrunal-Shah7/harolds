<!-- SPRINT-10: technical handover — architecture, odd decisions, monitoring, deferred work. -->

# Technical handover — Harold's Chicken Oak Lawn

v1: pickup only, guest checkout, ASAP only. Public API contract **1.2.0** (additive after freeze).

Read this with [`DEPLOYMENT.md`](./DEPLOYMENT.md), [`SECURITY.md`](./SECURITY.md), [`LAUNCH-BLOCKERS.md`](./LAUNCH-BLOCKERS.md).

---

## Shape

One Next.js 15 App Router process on Ubuntu:

| Surface | Path |
|---|---|
| Storefront (placeholder until integrated) | `/` |
| Admin | `/admin` |
| Kitchen PWA | `/kitchen` |
| Public API | `/api/v1/*` |
| Print SDP | `/api/v1/print/poll` |
| Square / Twilio webhooks | `/api/v1/webhooks/*` |

Packages: `pricing` (integer cents, one rounding point), `square` / `sms` / `email` (each the only importer of its SDK), `print` (ePOS XML), `notify` (job worker), `db` (Prisma), `config` (env + logs + rate limits), `mock-api` (storefront contract mock).

PostgreSQL is local on the same box. No Redis. Menu cache, job queue, and rate limits are in-process because production is **one** long-lived Node process.

---

## Decisions that look strange (do not “fix” them without this)

| Decision | Why |
|---|---|
| Order numbers allocated **after** payment | Failed/abandoned checkouts must not consume HC-001. Unique `(businessDate, orderSequence)` allows multiple nulls until paid. |
| Pricing engine has a **single rounding point** | Integer cents; tax via `applyBasisPoints`. Never recompute tax later from a rate. Reports use stored cents. |
| Print shared secret in the **URL query** | TM-m30III firmware does not send Digest auth reliably. Residual risk: access logs. nginx omits query string for `/api/v1/print/`. |
| **Polling** everywhere (printer 5s, KDS 3s) | No websocket/push dependency; devices already poll. Rate-limit **exempt** those paths. |
| **No external queue** | Same process as Sprint 7 worker. Jobs are Postgres rows with `FOR UPDATE SKIP LOCKED`. |
| Kitchen token in **localStorage**; admin **httpOnly cookie** | Kiosk must survive reload. Admin can refund — cookie flags matter. |
| HTTPS redirect only if `TRUST_PROXY=1` | Node speaks HTTP to nginx. Next injects `X-Forwarded-Proto: http` on local `next start`. |

---

## Monitoring (first week, once live)

Watch daily:

- Order volume vs expectation
- Payment failure / decline rate
- Print failure rate and printer last-polled
- Dead job count (dashboard)
- Unacknowledged-order alerts
- Error tracker (Sentry if `SENTRY_DSN` set)
- `pnpm reconcile --hours 24` **every day for the first week**

Health: `GET /api/v1/health` — 200 only if DB `SELECT 1` and worker heartbeat (on `globalThis`) is fresh. Probe this from an **uptime service that is not Twilio or Resend**.

Backups: daily off-box; restore drill measured in Sprint 9 at **562 ms** on the Windows dev dump. Re-measure on Ubuntu.

---

## Credential rotation

See `docs/SECURITY.md` §5. Square webhook key and print secret need a coordinated two-sided change.

---

## Deferred work (not gaps — a backlog)

- Delivery, customer accounts, loyalty, promo codes, scheduled orders, native apps
- Computed most-ordered rankings (curation is manual)
- Second printer / second kitchen display
- Nonce-based CSP (currently `unsafe-inline` / `unsafe-eval` for Next)
- Redis rate limits if we ever run more than one Node process
- Staff dry-run UX items (none yet — dry run not held)
- Historical order import from the previous platform (explicitly out of v1)

---

## Known residual risks

Print secret in URL. In-process limits reset on restart. CSP unsafe-inline. Kitchen XSS = kitchen session. Seeded test accounts if someone forgets to deactivate them.
