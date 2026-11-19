# System map

_2026-11-19. The profile of the product, its parts, its data, how it runs locally, how it is tested and how it
deploys. Statements are from the code unless marked otherwise; facts the owner gave are marked [confirmed].
Correct this file when it is wrong; it is read before everything else._

## Profile

| | |
|---|---|
| What | In-house online ordering for Harold's Chicken Burnham: guests order pickup and pay by card (and Apple Pay / Google Pay when switched on); the kitchen sees and prints each order; managers run the menu and the money. Replaces a third-party ordering service [confirmed] |
| Platforms | One Next.js 15 web app (React 19, Node 24 on this machine): storefront, admin back office, kitchen display (installable web app on a Swan 1 Pro), public API `/api/v1` (contract `docs/openapi/v1.yaml`, version 1.4.0), internal API `/api/internal` |
| People | Guests (no accounts: pickup only, guest checkout, ASAP only); kitchen staff (PIN); managers and the owner (email and password; roles `STAFF`, `MANAGER`, `OWNER`) |
| Money | Card payments through NMI's gateway, sold by the reseller Merchant Pay Connect; Collect.js in the browser, so card numbers never reach the server. Apple Pay and Google Pay behind run-time flags. Refunds from admin. Integer cents throughout; tax rate 10.10% in the local seed |
| Data | Guest name, email and phone on each order; card brand and last four; staff emails, password and PIN hashes. No customer accounts. No export or deletion feature for guest data [code] |
| Production | `haroldsburnham.com`, live and taking real orders on a self-hosted Ubuntu server: nginx in front, one systemd-supervised Node process (Next.js standalone), PostgreSQL on the same host; Node v22.23.2, pnpm 9.15.0, `TRUST_PROXY=1`, Apple Pay and Google Pay on [confirmed]. 103 paid orders since 2026-08-30 (read-only query, 2026-11-19) [observed] |
| Team | One person: the owner is product owner, engineer and the only one who releases. No reviewer besides Claude [confirmed] |

### This machine

Windows 10, Git Bash and PowerShell 5.1. Node 24.21.0 (production runs 22; TR-007). PostgreSQL 18 (`psql` 18.0) with a local `harolds`
database (17 migrations applied, a handful of local orders). pnpm: the globally installed pnpm is an 11.x launcher
that hangs on this repository without output; `npx pnpm@9.15.0` (the version in `packageManager`) works. The root
`.env` holds sandbox NMI keys, a real Resend key, a real Sentry DSN, the printer serial and secret, and both wallet
flags `true`. Not possible here: the printer, the kitchen device, real wallets, gateway webhooks (they cannot reach
`localhost`).

### What only the owner can run

Claude can read the production database through the Tamery connection "OVH" (label Prod, database `harolds`),
with read-only queries only; its write access is set to "ask". Everything else here is the owner's:
the production server (deploys, migrations, `.env`, systemd, nginx, backups), the production database, the
Merchant Pay Connect portal (keys, webhooks, Apple Pay domain), Resend, Sentry, Google Ads, DNS, the printer's
configuration page, the kitchen device, and the GitHub repository settings (`github.com/Mrunal-Shah7/harolds`).

## The parts

| Part | Folder | What it does |
|---|---|---|
| Web app | `apps/web` | Next.js App Router: storefront `(storefront)`, admin `(admin)`, kitchen `(kitchen)`, API route handlers `(api)`; middleware for headers; in-process worker and sweepers started from `src/instrumentation.node.ts` |
| Database | `packages/db` | Prisma schema, migrations, client, repositories, seed, verify, reconcile CLIs |
| Pricing | `packages/pricing` | Pure quote engine: validation, line pricing, tax once, tip, totals in integer cents |
| Payments | `packages/payments` | The only code that talks to the NMI gateway (sale, refund, query) |
| Email | `packages/email` | The only code that imports Resend |
| Notify | `packages/notify` | Background job worker, handlers and email/alert templates |
| Print | `packages/print` | Ticket model, layout, ePOS-Print XML, Server Direct Print envelope |
| Config | `packages/config` | Environment schema, production guards, rate limits, CSP, logging, gateway address |
| Types | `packages/types` | Shared enums and API contract types |
| Mock API | `packages/mock-api` | Hono server serving the public API from fixtures, for UI work without a database |
| Scripts | `scripts/` | Backup, restore, restore-drill clean-up, print secret rotation, `.env` bootstrap, sprint-era probes; `check-docs.mjs` (this cycle) |
| Design | `design.md`, `harolds-design-v1_1.html` | The design reference; UI changes are mirrored in the HTML file |

## The data

PostgreSQL through Prisma 6. Schema: `packages/db/prisma/schema.prisma`; migrations:
`packages/db/prisma/migrations/` (17, from `20260809001412_init_complete_schema` to
`20260926120000_sprint19_payment_method`); hand-written down scripts for two of them in
`packages/db/prisma/rollbacks/`. Main entities: menu (`Category`, `MenuItem`, `ModifierGroup`, `ModifierOption`,
`ItemModifierGroup`), orders (`Order`, `OrderLine`, `OrderNumberCounter`, `OrderStatusEvent`, `PaymentAttempt`,
`ProcessorRefund`, `ProcessorWebhookEvent`), operations (`PrintJob`, `PrinterHeartbeat`, `BackgroundJob`,
`ReconciliationRun`), store (`StoreConfig`, `StoreHours`, `StoreClosure`, `TradingOverride`), people
(`AdminUser`, `AdminSession`, `AdminAuditLog`), SEO (`SeoBusiness`, `SeoOpeningHours`, `SeoSiteDefaults`,
`SeoRouteOverride`), and two unused SMS-era tables (`SmsSuppression`, `SmsInboundEvent`). Menu photographs are
files under `IMAGE_UPLOAD_DIR` (default `data/uploads`, git-ignored). The menu seed reads
`docs/harolds-menu-reconciliation.xlsx`.

## Integrations

| Service | Used for | Real locally? | What it receives |
|---|---|---|---|
| NMI via Merchant Pay Connect | Card and wallet sales, refunds, query (reconciliation), webhooks | No: `NMI_ENVIRONMENT=sandbox` uses the NMI sandbox | Payment token, amount, order reference, billing ZIP; never card numbers |
| Resend | Customer receipts and every manager alert (the only notification channel) | **Yes**, when `EMAIL_API_KEY` is set (it is, on this machine). Switch it off per run as [testing.md](testing.md) says | Recipient address, receipt or alert content |
| Sentry (over HTTP, no SDK) | Error reports | **Yes**, when `SENTRY_DSN` is a URL (it is, on this machine) | Error name, message, redacted context, request id |
| Epson TM-m30III (Server Direct Print) | Kitchen tickets; the printer polls the app | No: the store's printer polls production | ePOS-Print XML of the ticket |
| Google Ads tag (gtag.js) | Ad conversion tracking on storefront pages | Loads in any browser that opens the storefront | Page views from the browser |
| Apple Pay / Google Pay | Wallet payments through Collect.js | No real wallet locally | Handled by Collect.js and the wallet |

## How it runs locally

### Once

```
npx pnpm@9.15.0 install --frozen-lockfile
node scripts/ensure-env.mjs
npx pnpm@9.15.0 db:generate
npx pnpm@9.15.0 db:migrate
npx pnpm@9.15.0 db:seed
npx pnpm@9.15.0 db:verify
```

Install, generate and verify were run on 2026-11-19 (install 5 s; verify "All invariants passed"). `ensure-env`,
`db:migrate` and `db:seed` were not run: the `.env` and the database already existed. `packages/db/.env` must carry
the same `DATABASE_URL` for Prisma.

### Each time

```powershell
$env:EMAIL_API_KEY = "disabled-local-run"; $env:SENTRY_DSN = "disabled"; npx pnpm@9.15.0 dev
```

Serves `http://localhost:3000` (`/`, `/admin`, `/kitchen`). The mock API (`npx pnpm@9.15.0 mock`) was not run.

### Local test data

The seed creates `test-staff@localhost`, `test-manager@localhost` and `test-owner@localhost` (PINs and passwords in
`packages/db/src/seed/run.ts`; the seed refuses to create them when `NODE_ENV=production`). Test orders use a name
starting `TEST` and an `@example.test` email [confirmed]. Orders cannot be deleted through the product; tests
written against the database create and remove their own rows. `pnpm db:reset` wipes the local database (never
run it anywhere else).

## How it is tested

| Check | Command | State (2026-11-19) |
|---|---|---|
| Type check | `npx pnpm@9.15.0 typecheck` | Passes, exit 0 |
| Unit tests | `npx pnpm@9.15.0 test` | Passes: 656 tests, 0 failed, 0 skipped (config 66, email 4, print 25, payments 81, pricing 65, db 145, notify 17, web 253). The db, notify, config, payments and web tests use the local database from `.env` |
| End-to-end tests | None in the repository. `apps/web/scripts/sprint18-seo-e2e.ts` and `sprint19-wallet-e2e.ts` and the `scripts/sprint*.mjs` probes are one-off sprint scripts, not run | Not run |
| Lint | `npx pnpm@9.15.0 lint` | Passes, exit 0, with 11 warnings (unused vars, `<img>`, `process.env` in the seed) |
| Format | `npx pnpm@9.15.0 format:check` | **Fails**, exit 2: 395 files not formatted and `apps/web/components.json` does not parse (TR-008) |
| API contract | `npx pnpm@9.15.0 openapi:validate` | Passes: "12 paths, 11 error codes, version 1.4.0", drift check passed |
| Seed invariants | `npx pnpm@9.15.0 db:verify` | Passes: "All invariants passed"; 8 unverified prices, 4 provisional modifier groups |
| Build | `npx pnpm@9.15.0 build` | Passes, exit 0: "Compiled successfully", 84 routes, middleware 49.7 kB; Next's lint repeats the warnings above |
| Hands-on | By checklist, see [testing.md](testing.md) | Smoke run 2026-11-19, see [runs/2026-11-19-smoke.md](runs/2026-11-19-smoke.md) |

There is no CI: the repository has no `.github/` folder.

## How it deploys

From [reference/DEPLOYMENT.md](reference/DEPLOYMENT.md), written in Sprints 10–19 [code]; the owner confirmed the
Ubuntu, nginx and systemd setup is what runs [confirmed]. Not seen by Claude.

- **Trigger:** by hand, by the owner; no pipeline.
- **Steps:** `pnpm backup` (and copy the dump off the box); check out the commit; `pnpm install --frozen-lockfile`;
  `pnpm db:generate`; `pnpm db:migrate:deploy` (never `db:migrate`); `pnpm build`; copy `apps/web/.next/static` and
  `apps/web/public/.` (with its dot-directories, for the Apple Pay file) into the standalone tree; restart the
  systemd unit, which runs `apps/web/.next/standalone/apps/web/server.js`.
- **Check from outside:** `GET https://haroldsburnham.com/api/v1/health` is 200 with `paymentEnvironment:
  production` and the Merchant Pay Connect gateway origin; the log has `app.startup_summary`; the printer's last poll
  updates within 10 s; the Apple Pay association file returns 200 with the recorded SHA-256.
- **Rollback:** keep the previous standalone tree and point the unit back at it. A migration is not reversed under
  pressure: restore the pre-deploy dump into a new database (`pnpm backup:restore` refuses the live name) or roll
  the app back to a build compatible with the schema. Down scripts exist only for the Sprint 18 SEO and Sprint 19
  payment-method migrations. Last practised: Sprint 11, on the development machine only.
- **Backups:** none. The production database has never been backed up off the box and no restore has been tried on
  the server [confirmed] (TR-015). A rollback that needs the database therefore has nothing to restore from.

## Risk areas

- **No backups:** losing the server's disk loses every order, refund record and menu change (TR-015).
- **Money:** checkout, the charge claim, webhooks and refunds (`apps/web/src/lib/checkout.ts`, `refunds.ts`,
  `webhooks-nmi.ts`). A mistake charges or refunds real cards.
- **Releases reach everyone at once:** one server, one process, no staging, no CI, by-hand deploys.
- **Migrations on the live database:** most cannot be cleanly reversed (list in `reference/DEPLOYMENT.md` §6).
- **In-process state:** rate limits, the menu cache and the job worker live in the one Node process; a second
  process would break their assumptions.
- **Local runs that reach real services:** email and Sentry are live from this machine unless switched off (TR-002).
- **Print secret in the URL query**, mitigated by nginx log settings.
- **Personal data:** guest names, emails and phones in orders; the local database has a few real-looking ones.

## What is missing

- Off-box backups of the production database and a restore drill on the server (TR-015).
- CI on pull requests, and branch protection on `master`.
- A staging or test environment; the only environments are this machine and production.
- A browser end-to-end test harness (the storefront, checkout tabs and admin have no UI tests).
- A guard that stops development from sending real email and error reports (TR-002).
- A working format check (TR-008), and one agreed Node and pnpm version (TR-007).
- A test-order clean-up path (orders cannot be deleted).
- A rollback practised on the production server.
- An independent uptime monitor on the health endpoint (listed as needing a domain in the old blocker list).

## Questions

None open. Answered by the owner on 2026-11-19: `TRUST_PROXY=1` is set; production runs Node v22.23.2 and pnpm
9.15.0; both wallets are on; no backup or restore drill has ever been done (TR-015).
