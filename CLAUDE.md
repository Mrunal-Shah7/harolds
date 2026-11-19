# Harold's Chicken Burnham ordering

In-house online ordering for Harold's Chicken Burnham (`haroldsburnham.com`, live): guests order pickup and pay by
card; the kitchen sees and prints each order; managers run the menu and the money. One pnpm monorepo:
`apps/web` (Next.js 15, React 19: storefront, `/admin`, `/kitchen`, API), `packages/db` (Prisma 6, PostgreSQL),
`packages/pricing`, `payments` (NMI via Merchant Pay Connect), `email` (Resend), `notify` (job worker), `print`
(Epson Server Direct Print), `config`, `types`, `mock-api`.

Start with [docs/system-map.md](docs/system-map.md), then [docs/handover.md](docs/handover.md) for where the work
stopped. How work moves and every document's format: [SDLC-GUIDE.md](SDLC-GUIDE.md). Sprint-era background is in
[docs/reference/](docs/reference/README.md); it is not the source of truth.

## Commands

Run from the repository root. Each exits non-zero on failure. Use `npx pnpm@9.15.0`: the globally installed pnpm
(an 11.x launcher) hangs on this repository with no output. Production runs Node v22.23.2 and pnpm 9.15.0; this
machine has Node 24 (TR-007).

| Check | Command | Healthy output |
|---|---|---|
| Install | `npx pnpm@9.15.0 install --frozen-lockfile` | `Done in 5s` (warns `Unsupported engine: wanted node 22.x`) |
| Prisma client | `npx pnpm@9.15.0 db:generate` | `Generated Prisma Client (v6.19.3)` |
| Build | `npx pnpm@9.15.0 build` | `Compiled successfully`, exit 0 |
| Type check | `npx pnpm@9.15.0 typecheck` | every package `Done`, exit 0 |
| Lint | `npx pnpm@9.15.0 lint` | exit 0 with 11 warnings (2026-11-19); no errors |
| Unit tests | `npx pnpm@9.15.0 test` | `fail 0` in every package; 656 tests on 2026-11-19. Uses the local database in `.env` |
| API contract | `npx pnpm@9.15.0 openapi:validate` | `OK — 12 paths, 11 error codes, version 1.4.0` and `drift check passed` |
| Seed invariants | `npx pnpm@9.15.0 db:verify` | `All invariants passed.` |
| Format | `npx pnpm@9.15.0 format:check` | Fails today (395 files, TR-008); not a gate until fixed |
| End-to-end tests | None | There is no browser test harness; walk the journey by hand ([docs/testing.md](docs/testing.md)) |
| Run locally | `$env:EMAIL_API_KEY = "disabled-local-run"; $env:SENTRY_DSN = "disabled"; npx pnpm@9.15.0 dev` | `Ready in` and `app.startup_summary` with `"paymentEnvironment":"sandbox"`; serves `http://localhost:3000` |
| Docs check | `node scripts/check-docs.mjs` | `docs: no findings` |

## Conventions

- A public endpoint is a route handler under `apps/web/src/app/(api)/api/v1/` that rate-limits, then answers
  through the envelope in `apps/web/src/lib/api.ts`; copy `apps/web/src/app/(api)/api/v1/menu/route.ts`. A change to
  it updates `docs/openapi/v1.yaml`.
- An admin endpoint is declared with its minimum role in `apps/web/src/lib/admin-route-registry.ts` (undeclared
  routes refuse) and lives under `(api)/api/internal/admin/`; copy
  `apps/web/src/app/(api)/api/internal/admin/menu/items/[id]/sold-out/route.ts`.
- Database access lives in `packages/db/src/` and is exported from `packages/db/src/index.ts`; copy
  `packages/db/src/admin-store.ts`. The storefront never queries the database; it calls the public API.
- Money is integer cents everywhere; tax is computed once in `packages/pricing` and stored, never recomputed.
- Only `packages/payments` talks to the gateway and only `packages/email` imports Resend. The gateway host is
  stated once, in `packages/config/src/nmi-gateway.ts`. Environment is read through `packages/config/src/env.ts`
  (lint warns on `process.env` elsewhere).
- Order status moves only through the table in `packages/db/src/order-status.ts`.
- Tests sit next to the code as `*.test.ts` (node:test through tsx); copy `packages/db/src/order-status.test.ts`.
- Source files start with a one-line comment saying what the file is and which sprint added it
  (`packages/db/src/order-status.ts:1`).
- A migration is made with `db:migrate` locally; an additive one gets a down script in
  `packages/db/prisma/rollbacks/`, like `20260926120000_sprint19_payment_method.down.sql`.
- Every UI change is also made in `harolds-design-v1_1.html` (the design file mirrors the UI).
- Branches `feature/…`, `fix/…`, `hotfix/…`, `chore/…` from `master` (there is no integration branch);
  Conventional Commits with the triage ID. Nothing reaches `master` without a pull request.
- Do not commit or push unless the owner asks.

## The cycle

1. Every task gets a line in `docs/triage.md` **before any work**, with its path: light or full.
2. **Light** (the product should already behave this way): fix it, write `build.md`.
3. **Full** (what the product does changes): `intent.md` → `spec.md` → `plan.md` → code → `build.md`, in
   `docs/changes/NNN-short-name/`. Each is approved before the next starts. No file changes before the plan is
   agreed.
4. Read the module's system review (`docs/system-review/`) before changing the module; update it in the same pull
   request.
5. When the build departs from the plan, update `plan.md` in the same commit. If it departs from the spec, stop
   and ask the owner.
6. When a branch is cut, add it under "In progress" in `docs/handover.md`. At the end of a session, write the
   handover entry, ending with "Slowed down by".
7. Never guess a product decision. Ask, or write the assumption down as an assumption.

## Done means

- Type check, lint and tests pass, and their output is shown. Fix the code, not the test.
- For a bug: a test that failed before the fix and passes after it.
- The changed journey was walked in the running product, including the way back (refund, cancel, undo, sign out),
  with ordinary and awkward data. See [docs/testing.md](docs/testing.md).
- `build.md` is written, with what was **not** checked. The system review is updated.
- `node scripts/check-docs.mjs` is clean.

## Safety

- Local copy only, never production: `db:migrate` (production uses `db:migrate:deploy`), `db:reset`, `db:seed`,
  `db:cancel-orphans`, the test suite (it writes to the database in `.env`), `scripts/drop-restore-db.mjs`, and the
  `scripts/sprint*.mjs` probes. Restores go into a new database, never `harolds`.
- Real even locally: **Resend email** and **Sentry** (both keys are in the local `.env`). Always start the server
  with the dummy values in the "Run locally" command: on start the job worker sends every waiting job at once.
  NMI is sandbox here; live keys never go on this machine. The Google Ads tag loads on every storefront page.
- Test data: names starting `TEST`, emails at `@example.test`, NMI sandbox test cards, and the seeded accounts
  `test-staff@localhost`, `test-manager@localhost`, `test-owner@localhost`. Never sign in as, message or change a
  real person's account.
- The production database is reachable through the Tamery connection "OVH" (Prod, database `harolds`): read-only
  `query` only, aggregates rather than rows, never `execute`. Personal data from it stays out of chat and docs.
- Production releases need the owner's go-ahead each time. Prepare the release and stop there. Never change the
  production `.env`, the wallet flags or the Merchant Pay Connect portal.
- Secrets and personal data stay out of the repository, the docs and screenshots. The local database holds a few
  real-looking customer emails: never print them.

## Rules learned from production

Each comes from an incident in [docs/lessons.md](docs/lessons.md). None yet.

## Rules from bugs already found

Each comes from a fixed bug; the story is in the change named. None yet.

## Things Claude gets wrong

Added when the same mistake happens twice; removed when it stops applying. None yet.
