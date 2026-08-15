# Harold's Chicken Oak Lawn

In-house online ordering for Harold's Chicken Oak Lawn. Replaces outsourced third-party ordering with a system the business owns, while continuing to use the existing in-store Epson TM-m30III thermal printer and Swan 1 Pro kitchen display.

**v1 scope:** pickup only, guest checkout only, ASAP orders only. No delivery, accounts, loyalty, promo codes, scheduled orders, or native app.

## Technology choices

| Choice | Why |
|---|---|
| **Next.js 15 App Router** | One long-lived Node app hosting storefront, admin, kitchen display, and API |
| **pnpm workspaces** | Shared types/config/db without publishing packages |
| **PostgreSQL + Prisma** | Local DB on the Ubuntu production server; strong schema and migrations |
| **Integer cents for money** | Avoid float/decimal rounding errors in prices and reconciliation |
| **Tailwind + shadcn/ui** | Shared UI primitives for admin (Sprint 8) and any shared components |
| **Square** (Sprint 4) | Payment processor already agreed with the business |
| **Epson Server Direct Print** (Sprint 5) | Talks to the existing TM-m30III without new hardware |

## Workspace layout

```
apps/
  web/                 Next.js 15 — storefront, admin, kitchen, API route groups
packages/
  db/                  Prisma schema, client, seed, verify
  types/               Shared enums and domain types
  config/              Env schema, shared TS/ESLint config
  pricing/             Integer-cents quoting
  square/              Square payments (only file that imports the Square SDK)
  print/               Kitchen/counter tickets and ePOS-Print XML
  sms/                 Twilio SMS (only file that imports the Twilio SDK)
  email/               Resend email (only file that imports the Resend SDK)
  notify/              Background job worker, templates, handlers
  mock-api/            Contract mock server
docs/                  Sprint notes
harolds-menu-reconciliation.xlsx   Authoritative menu source for the seed
```

## Prerequisites

- Node.js 24.x
- pnpm 9+ (repo pins via `packageManager`)
- PostgreSQL 14+ running locally
- A database named `harolds` and a role that can connect to it (development migrations also need `CREATEDB` or an explicit shadow database URL)

## Setup (clean clone → seeded app)

```bash
# 1. Install
pnpm install

# 2. Environment
# Edit .env — set DATABASE_URL, NODE_ENV=development, NEXT_PUBLIC_APP_URL
# Prefer: pnpm ensure-env  (creates .env only if missing; never overwrites)

# 3. Generate Prisma client
pnpm db:generate

# 4. Apply migrations (development)
pnpm db:migrate

# 5. Seed menu + store config
pnpm db:seed

# 6. Verify invariants
pnpm db:verify

# 7. Run the app
pnpm dev
```

Open http://localhost:3000 (storefront placeholder), `/admin`, `/kitchen`.

## Documentation

| Doc | Who |
|---|---|
| [`docs/LAUNCH-BLOCKERS.md`](docs/LAUNCH-BLOCKERS.md) | Owner — what must be true before go-live |
| [`docs/OPERATOR-HANDBOOK.md`](docs/OPERATOR-HANDBOOK.md) | Managers — everyday ops index |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Developer — deploy / rollback |
| [`docs/CUTOVER-PLAN.md`](docs/CUTOVER-PLAN.md) | Developer + owner — go-live steps (unexecuted) |
| [`docs/HANDOVER.md`](docs/HANDOVER.md) | Future developer — architecture and deferred work |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Incidents and credential rotation |
| [`docs/API-CONTRACT-HANDOFF.md`](docs/API-CONTRACT-HANDOFF.md) | Storefront developer |

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Next.js development server |
| `pnpm build` | Production build (standalone output) |
| `pnpm typecheck` | Typecheck all workspaces |
| `pnpm lint` | Lint all workspaces |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Development migrations (`prisma migrate dev`) — never on production |
| `pnpm db:migrate:deploy` | Production migrations (`prisma migrate deploy`) |
| `pnpm db:seed` | Idempotent menu + store-config seed |
| `pnpm db:verify` | Print seed summary; exit non-zero on invariant violations |

## For the storefront developer

The customer UI lives in `apps/web/src/app/(storefront)/`. Parentheses mean the group name is **not** part of the URL — the storefront is `/`.

- Admin: `apps/web/src/app/(admin)/admin/` → `/admin` (Sprint 8)
- Kitchen: `apps/web/src/app/(kitchen)/kitchen/` → `/kitchen` (Sprint 6)
- API: `apps/web/src/app/(api)/api/` → handlers from Sprint 2

**Do not call the database from the storefront.** Sprint 2 publishes the menu API contract. Until then, build UI against mock data or the placeholder page.

Internal packages (`@harolds/types`, `@harolds/config`, `@harolds/db`) are available — prefer `@harolds/types` for shared enums.
