<!-- SPRINT-10 / SPRINT-11: production deploy and rollback. Sprint 11 rehearsed the build, standalone start, migrate:deploy, and rollback copy locally. Ubuntu host still does not exist. -->

# Deployment and rollback — Harold's Chicken Oak Lawn

Production is a **self-hosted Ubuntu** server: PostgreSQL on localhost, one long-lived Node process (Next.js standalone), nginx reverse proxy, systemd supervisor.

**Do not run this against a sandbox laptop. Do not run `pnpm db:migrate` on production.**

Node **24.x** and pnpm **11.8.0** must match development.

---

## 1. First-time server (blocked until a host exists)

1. Non-root user (e.g. `harolds`), sudo for deploy only.
2. Firewall: 22, 80, 443. PostgreSQL **not** on the public interface.
3. Unattended security updates.
4. OS timezone **UTC**. The app renders America/Chicago.
5. Install Node 24 and pnpm 11.8.0.
6. PostgreSQL local. Database `harolds`. Role `harolds_app` **without** `CREATEDB`. `listen_addresses = 'localhost'`.
7. Domain A/AAAA → server. Certbot (or equivalent) with **full chain**. Confirm the Epson TM-m30III trusts it (stricter than a browser).
8. Off-box backups: `pnpm backup` daily, copy the dump off the disk, retain ≥ 14 days. Restore drill to `harolds_restore_YYYYMMDD` **before** launch (`pnpm backup:restore`). Dev restore was **562 ms** on this machine; measure again on the server.

---

## 2. Application unit (systemd)

The worker, print sweeper, kitchen unack sweeper, and **scheduled reconciliation** start inside the Node process (`instrumentation.node.ts`). One service.

This is a pnpm monorepo. `outputFileTracingRoot` is the repo root, so standalone output is **not** `apps/web/.next/standalone/server.js`. Sprint 10 wrote that path from intention. Sprint 11's rehearsal found:

| | Path |
|---|---|
| Server | `apps/web/.next/standalone/apps/web/server.js` |
| Copy `apps/web/.next/static` to | `apps/web/.next/standalone/apps/web/.next/static` |
| Copy `apps/web/public` to | `apps/web/.next/standalone/apps/web/public` |
| Run from | `apps/web/.next/standalone/apps/web` (`node server.js`) |

Example unit:

```
[Unit]
Description=Harolds ordering
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=harolds
WorkingDirectory=/opt/harolds/apps/web/.next/standalone/apps/web
EnvironmentFile=/opt/harolds/.env
ExecStart=/usr/bin/node /opt/harolds/apps/web/.next/standalone/apps/web/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`next start` is not the production command when `output: "standalone"`.

Confirm on reboot: service comes up **after** Postgres; `GET /api/v1/health` becomes 200 once the worker has ticked. Logs must contain `app.startup_summary`.

---

## 3. nginx (must honour Sprints 4, 5, 9)

- Terminate TLS; proxy to `127.0.0.1:3000`.
- `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` and `X-Forwarded-Proto $scheme`. Set `TRUST_PROXY=1` in `.env` so rate limits key on the client, not nginx.
- Do **not** re-serialise bodies. Square HMAC is over raw bytes (`/api/v1/webhooks/square`).
- Print poll: omit query string from access logs (`combined_no_query` in `PRINT-RUNBOOK.md` §6).
- Body sizes: public JSON 32 KiB, admin 64 KiB, webhooks 1 MiB, print 256 KiB — do not set nginx `client_max_body_size` below 1m.
- HTTP → HTTPS at nginx (Node also redirects when `TRUST_PROXY=1` and proto is http).
- logrotate for nginx and the Node stdout file (14 days).

---

## 4. Environment: build vs run

`pnpm build` (`next build`) sets `NODE_ENV=production` while collecting page data. Twilio, email, print-secret length, and manager destinations are **start-time** requirements. The build skips those guards when `NEXT_PHASE` is set so CI can compile without live credentials.

**Required at run** (`node server.js` with `NODE_ENV=production`):

- Everything in `.env.example` marked required (database, Square, printer serial + secret).
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`
- `PRINTER_SDP_SHARED_SECRET` at least 32 characters
- Store-config manager alert phone and/or email that are **not** the seeded placeholders (`TODO: SET MANAGER ALERT PHONE`, `todo-manager-alerts@localhost`)

A production start names every missing env var at once, then (after the database is reachable) refuses placeholder manager destinations.

**Not required at build:** Twilio, email, Sentry, manager destinations.

---

## 5. Deploy procedure

Write the previous standalone directory aside **before** you replace it.

1. `pnpm backup` (and copy the dump off-box). **Always** before a migration.
2. `git fetch` and check out the intended tag/commit.
3. `pnpm install --frozen-lockfile`
4. `pnpm db:generate`
5. `pnpm db:migrate:deploy` — **never** `pnpm db:migrate`
6. `pnpm build`
7. Copy `static` and `public` into the standalone tree (table in §2). Restart systemd.
8. Verify: `GET /api/v1/health` 200, `squareEnvironment=production`, `app.startup_summary` in the log, menu 200, printer last-polled updates within 10s.

`pnpm db:migrate:deploy` was rehearsed against a scratch database `harolds_s11_scratch` (created, migrated, dropped). All 10 migrations applied, including `20260815190000_sprint11_reconcile`.

---

## 6. Rollback

**App-only (no migration):** keep the previous standalone tree. Point systemd `WorkingDirectory` / `ExecStart` at it and restart. Health + one menu GET. Sprint 11 rehearsed this by copying `apps/web/.next/standalone` aside and starting `node server.js` from the copy. There is no older git tag on this machine to roll back to — HEAD is still the Sprint 2 commit with later sprints uncommitted.

**Migration that must be reversed:** do **not** invent a down migration under pressure. Restore the pre-deploy dump to a **new** database, point `DATABASE_URL` at it only after `pnpm backup` of the broken state, or roll the app back to a version compatible with the current schema if the migration was additive.

The live database name `harolds` is refused by `scripts/restore-postgres.mjs` on purpose. Restore to `harolds_restore_*`, verify, then switch the app URL.

### Migrations that cannot be cleanly reversed

| Migration | Why a down migration is unsafe |
|---|---|
| `20260809001412_init_complete_schema` | Creates the whole schema. |
| `20260809190000_sprint4_orders_payments` | Money, payments, customers. Dropping loses paid history. |
| `20260809193000_sprint4_cart_fingerprint` | Checkout identity columns. |
| `20260815020000_sprint5_print` | Print jobs and printer heartbeat. |
| `20260815033000_sprint6_kitchen` | Kitchen sessions and order timestamps. |
| `20260815043000_sprint7_jobs` | Background jobs and suppressions. |
| `20260815160000_sprint8_admin` | Admin users, sessions, audit. |
| Sprint 2 remediations | Catalogue / store columns already in use. |

**Additive and droppable if unused:** `20260815190000_sprint11_reconcile` (`ReconciliationRun` only). Safe to `DROP TABLE` if you must revert the app to a pre-Sprint-11 build *and* you accept losing reconciliation history. Do not drop it if the running build still reads the table.

---

## 7. Environment glance checks

Production `.env` must show:

- `NODE_ENV=production`
- `SQUARE_ENVIRONMENT=production`
- `NEXT_PUBLIC_APP_URL=https://<real-domain>`
- `TRUST_PROXY=1`
- `LOG_LEVEL=info`
- Twilio and email filled (not empty)
- Print secret ≥ 32 characters
- No sandbox Square token, no localhost URLs

`GET /api/v1/health` is the glance check for Square env. If it says `sandbox`, stop. `app.startup_summary` is the glance check for SMS / email / alerting / error tracker / printer serial.
