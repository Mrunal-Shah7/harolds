# 09. Platform

_2026-11-19. Made from the code, [../reference/SECURITY.md](../reference/SECURITY.md),
[../reference/DEPLOYMENT.md](../reference/DEPLOYMENT.md) and the Sprint 7, 9 and 11 notes. Not yet walked by
checklist. Marks: see [README.md](README.md)._

## Planned changes

| Change | Kind | What will change | Triage | State |
|---|---|---|---|---|
| — | | None yet | | |

## What it is for

What every other module stands on: configuration and its production guards, admin sign-in and roles, staff
accounts and the audit log, rate limits and security headers, the background job worker, health, logging, error
tracking and backups. Production is one long-lived Node process, so the worker, sweepers and limits all run in
process.

## Who uses it, and where

- **People:** the owner (staff accounts, audit); every signed-in admin; operators reading health and logs [code]
- **Screens or routes:** `/admin/signin`, `/admin/staff`, `/admin/jobs`; `GET /api/v1/health`;
  `POST /api/internal/client-error`; `/api/internal/admin/auth/*`, `/staff/*`, `/audit` [code]
- **Code:** `packages/config/src/` (env, production guards, security, log, jobs), `apps/web/src/middleware.ts`,
  `instrumentation.node.ts`, `lib/startup.ts`, `health.ts`, `job-worker.ts`, `rate-limit.ts`,
  `enforce-rate-limit.ts`, `client-ip.ts`, `errors.ts`, `request-context.ts`, `admin-auth.ts`, `admin-http.ts`,
  `admin-route-registry.ts`; `packages/db/src/admin-auth.ts`, `admin-staff.ts`, `admin-audit.ts`, `password.ts`,
  `jobs.ts`; `packages/notify/src/worker.ts`, `registry.ts`; `scripts/backup-postgres.mjs`,
  `restore-postgres.mjs`, `drop-restore-db.mjs`, `verify-restore.mjs`, `rotate-print-secret.mjs`,
  `ensure-env.mjs` [code]

## How it works

- **Configuration:** `packages/config/src/env.ts` validates the environment when the module loads and names every
  missing variable. The root `.env` is loaded by `apps/web/next.config.ts`; Prisma reads `packages/db/.env`.
  [code]
- **Production guards:** a production start refuses missing email, a print secret shorter than 32 characters, an
  incomplete active NMI key set, and the seeded placeholder manager destinations (`production-guards.ts`). The
  build skips these when `NEXT_PHASE` is set. [code]
- **Startup:** `instrumentation.node.ts` sets the log level, runs the startup checks and logs one
  `app.startup_summary` line, then starts the print sweeper, kitchen alert sweeper, job worker, reconciliation
  scheduler and image sweeper. [code]
- **Admin sign-in:** email and password, scrypt hashes with a per-row salt (`password.ts`); session in an
  `httpOnly`, `SameSite=Lax` cookie (`admin-http.ts:108`); 4-hour lifetime; 5 failures lock for 15 minutes
  (`.env.example`, `config/src/admin.ts`). Every admin route checks the role listed for it in
  `admin-route-registry.ts`; an undeclared route refuses. [code]
- **Staff accounts** (owner only): create, edit, deactivate, set or generate a distinct PIN, see and revoke
  sessions (`admin-staff.ts`). [code]
- **Audit:** back-office actions are written to `AdminAuditLog` with who, what and when, without secrets
  (`admin-audit.ts`); the owner reads it at `/api/internal/admin/audit`. [code]
- **Job worker:** every 5 s by default, recovers jobs stranded in `RUNNING`, claims up to 10 with
  `FOR UPDATE SKIP LOCKED`, runs the handler, retries with backoff or marks `DEAD`; a dead job raises
  `ALERT_MANAGER_JOB_DEAD`. Manager alerts are capped per type per window (`packages/notify/src/worker.ts`,
  `config/src/jobs.ts`). Missing handlers fail at startup (`registry.ts`). [code]
- **Health:** `GET /api/v1/health` is 200 only when the database answers `SELECT 1` within 2 s and the worker ran
  within `WORKER_STALE_MS` (30 s); it also reports the payment environment, gateway origin, Collect.js URL and wallet
  flags (`lib/health.ts`). [code] Seen: 200 with database and worker `up` on a local start; after admin sign-out
  `/admin/orders` redirects to `/admin/signin` ([run](../runs/2026-11-19-smoke.md), S-01, S-14). [observed]
- **Security headers and CSP** are set in middleware for every page and API (`middleware.ts`,
  `config/src/security.ts`); the CSP allows NMI Collect.js, the wallet origins when their flags are on, and the
  Google tag. HTTPS redirect only in production behind a trusted proxy (`TRUST_PROXY=1`). [code]
- **Logs:** structured JSON with field-name redaction (`config/src/log.ts`); errors go to Sentry when `SENTRY_DSN`
  is set, with the same redaction (`lib/errors.ts`). Each request carries a request id. [code]
- **Backups:** `pnpm backup` dumps PostgreSQL and copies the image directory; `pnpm backup:restore` restores into a
  separate database and refuses the live name `harolds`. [code]

## Rules it enforces

- Rate limits are per client address, in memory, reset on restart; behind nginx they key on
  `X-Forwarded-For` only when `TRUST_PROXY=1` (`client-ip.ts`, `rate-limit.ts`). Printer and kitchen polls are
  exempt. [code]
- Seeding test accounts against a production database is refused (`packages/db/src/seed/run.ts:104`). [code]
- `pnpm db:migrate` is development only; production uses `pnpm db:migrate:deploy`
  ([../reference/DEPLOYMENT.md](../reference/DEPLOYMENT.md) §5). [code]

## Problems found

| # | Problem | Status |
|---|---|---|
| 1 | Development has no guard against real outside services: with the keys in a local `.env`, the worker sends real email through Resend and errors go to the real Sentry project. | Open, TR-002 |
| 2 | The CSP still allows `unsafe-inline` and `unsafe-eval` for Next ([../reference/HANDOVER.md](../reference/HANDOVER.md), deferred work). | Known, deferred |
| 3 | The CSP blocks Google Ads' `https://ad.doubleclick.net/ccm/s/collect` (`connect-src`) and Apple Pay's fonts from `applepay.cdn-apple.com` (`font-src`), seen in the browser console on 2026-11-19. | Open, TR-010 |
| 4 | The job worker starts sending whatever jobs are waiting the moment the server starts, so a local start with real keys emails old local orders (7 tried on 2026-11-19). | Open, TR-002 |
| 5 | The production database has never been backed up off the box, and no restore has been tried on the server. | Open, TR-015 |

## Questions

1. ~~Is `TRUST_PROXY=1` set in production?~~ Yes (owner, 2026-11-19). `.env.example` still does not list it.
2. ~~Which Node and pnpm versions does production run?~~ Node v22.23.2 and pnpm 9.15.0 (owner, 2026-11-19), as
   `package.json` says; `.nvmrc`, the README and `DEPLOYMENT.md` are wrong (TR-007).

## How to test it

Checklist: smoke rows S-01, S-14 and S-15 in [checklists/00-smoke.md](checklists/00-smoke.md). Test data: the
seeded test owner and manager. Automated: `packages/config/src/*.test.ts`, `packages/db/src/admin-auth.test.ts`,
`admin-staff.test.ts`, `password.test.ts`, `jobs.test.ts`; `apps/web/src/lib/hardening.test.ts`,
`rate-limit.test.ts`, `admin-routes.test.ts`; `packages/notify/src/worker.test.ts`.

## Not yet checked

Reboot order on the server (app after PostgreSQL), log rotation, off-box backup copies and a restore drill on the
Ubuntu host are owner checks.
