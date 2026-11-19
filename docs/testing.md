# Hands-on testing

_How a change is checked in the running product, by Claude or a person. Checklists are in
[system-review/checklists/](system-review/checklists/README.md); each run is logged in [runs/](runs/README.md)._

## What it is

The product is one Next.js app, so every surface is a web page or an HTTP call on the same local server:
storefront at `/`, admin at `/admin`, kitchen display at `/kitchen`, API under `/api/v1` and `/api/internal`.
Claude drives the pages in the desktop app's built-in browser, calls the API with `curl`, reads the server log and
queries the local PostgreSQL with `psql`. It cannot use a real phone, the Swan kitchen device, the Epson printer,
Apple Pay or Google Pay, or a real inbox.

## Tools

| Need | Tool | Note |
|---|---|---|
| Acting (click, type) | Built-in browser (`mcp__Claude_Browser__*`) at `http://localhost:3000` | NMI Collect.js card fields are cross-origin iframes; type into them by clicking the field, not with form tools |
| Looking (screenshot, page text, UI tree) | Same browser: `read_page`, `get_page_text`, screenshots; `resize_window` for phone width (375 px) | Prefer page text over screenshots |
| Logs | The dev server's output (JSON lines, one per event) | Read them in the same step as the screenshot; most bugs show there first |
| Database | `psql` 18 against the `DATABASE_URL` in `.env` (local `harolds` database) | Read-only queries during a run; never print customer emails or names |
| API | `curl` against `http://localhost:3000` | The health check is `GET /api/v1/health` |

## Set up once

1. Node 24 and PostgreSQL running locally with a `harolds` database (the role needs `CREATEDB` for
   `prisma migrate dev`).
2. `npx pnpm@9.15.0 install --frozen-lockfile`. The globally installed pnpm (an 11.x launcher) hangs on this
   repository without output; the pinned 9.15.0 through `npx` installs in seconds.
3. `.env` at the root (copy `.env.example`, or `node scripts/ensure-env.mjs`, which never overwrites) and
   `packages/db/.env` with the same `DATABASE_URL`.
4. `npx pnpm@9.15.0 db:generate`, `npx pnpm@9.15.0 db:migrate`, `npx pnpm@9.15.0 db:seed`.
   The seed creates the test accounts `test-staff@localhost`, `test-manager@localhost` and `test-owner@localhost`;
   their PINs are printed by the seed and set in `packages/db/src/seed/run.ts`.

## Before each run

- Check which backend the build talks to. Only a build pointed at the **local** backend (or a named test
  environment) may be walked. `GET /api/v1/health` must show `"paymentEnvironment":"sandbox"`.
- **Start the server with outside services switched off for the run.** The local `.env` holds a real Resend key and
  a real Sentry DSN, and the local store config holds a real manager alert address. Start with dummy values so no
  email or error report leaves the machine (an empty value does not work on Windows: the variable is dropped and
  the app reads `.env` again):

  ```powershell
  $env:EMAIL_API_KEY = "disabled-local-run"; $env:SENTRY_DSN = "disabled"; npx pnpm@9.15.0 dev
  ```

  With the dummy key Resend refuses every send and the job goes dead, so nothing is delivered. A DSN that is not a
  URL is skipped by `apps/web/src/lib/errors.ts` (`parseDsn` returns null), so no report is sent.
- Sign in only with test accounts. Test orders use a name starting `TEST` and an email at `@example.test`.
- Pay only with NMI sandbox test cards (`packages/payments/src/test-cards.ts`).
- Note every setting the run will change (sold-out flags, store switch, overrides).

## During the run

- One checklist row at a time: do, look, read the logs, record the result.
- Record what was seen (the text, the count, the state), not "works".
- A row that cannot be done is `blocked` with what is needed, never skipped.
- Something wrong outside the checklist is noted in the run log and gets a triage line.
- Move a test order out of `PAID` within 3 minutes, or the unacknowledged-order alert is enqueued for the manager
  address.

## After the run

- Put back every setting changed. Test orders cannot be deleted through the product: refund or cancel them in
  admin, and list their ids in the run log.
- Write the run log, add its line to the index, open triage lines for failures, update the system review
  ([observed] marks, "Not yet checked").
- Stop what was started (servers, watchers), or say in the handover that it is still running.

## Who does each row

| Mark | Who |
|---|---|
| P | Claude, through the product's interface |
| A | Claude, through the API or logs |
| D | Claude, by reading the database |
| YOU | The owner: needs a real device, a real account, a payment, a judgment of look and feel |

## Limits

- No real printer: print jobs stay `QUEUED` locally; the poll can only be imitated with `curl`.
- No gateway webhooks: NMI cannot reach `localhost`, so webhook convergence is not seen locally.
- No Apple Pay or Google Pay: they need a real device with a saved card and a registered domain.
- No kitchen device: audio unlock, landscape install and the Swan's browser are owner checks.
- No real inbox: receipt layout and spam placement are owner checks.
- Only Chromium in the built-in browser: Safari and Firefox are not covered.
- There is no browser test harness in the repository; the automated tests are Node unit and database tests.
