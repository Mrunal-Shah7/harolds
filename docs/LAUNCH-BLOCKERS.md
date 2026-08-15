<!-- SPRINT-11: launch blockers — what this sprint closed, and what still blocks the first real order. -->

# Launch blockers — Harold's Chicken Oak Lawn

This is the list to act on before the site takes real orders. It is not a developer punch-list. Items marked **blocks launch** must be resolved or explicitly accepted in writing. Items marked **does not block launch** can go live if you accept the limitation.

Owner of every business row is **the store**, unless it says **developer**.

**The storefront's absence still blocks everything else.** There is no customer UI in this repository. If a storefront exists in another repo, point it at contract `1.2.0` using [`docs/STOREFRONT-REQUIREMENTS.md`](./STOREFRONT-REQUIREMENTS.md) and [`docs/API-CONTRACT-HANDOFF.md`](./API-CONTRACT-HANDOFF.md), then resume Sprint 10 from Phase 2. If it does not exist, it is its own sprint — a substantial one — and no Ubuntu cutover, no real card, and no first trading day can happen until it does.

---

## Closed in Sprint 11 (no longer a code gap)

These were launch-adjacent engineering risks. They are closed in this repo. They do not remove the business blockers below.

| Closed | What changed |
|---|---|
| Seed restoring test owner on production | Production cannot create/update/reactivate `test-*@localhost`. Menu seed is separate (`pnpm db:seed:menu`). A database with orders needs `--allow-existing-orders`. Store config, hours, tips, and curated flags are insert-if-absent / preserved. |
| Silent start without SMS/email | Production start names every missing Twilio/email variable at once and refuses placeholder manager destinations. Development still starts without them. |
| Reconciliation only as a remembered command | Daily pass at store-local hour 4 (configurable), one run per business date, findings on the operations dashboard, one manager alert if anything is found. Read-only. |
| Admin bodies parsing before the size cap | Every JSON body route uses the bounded reader. Oversized bodies without Content-Length are rejected before `JSON.parse`. Print secret ≥ 32 characters in production. |
| Weakened dead-job retry test | Assertion restored to exactly one job. Isolation is `testPrefix` plus cleanup, not a dedicated test database. |
| Non-reconciling reporting fixture | Hand-built Sprint 8 test row (`totalCents` 879 / `taxCents` 89). Replaced with engine-produced orders. Summing invariant in tests. All 8 then 9 paid rows in the development database reconcile. |
| Sold-out / health / ticket only proven in unit tests | Sold-out toggle observed on the next public menu GET. Health 503 with a non-existent database name (working Postgres left running). Kitchen ticket with Mild / Add Fries / Add Cheese + note recorded as ePOS + preview; **not printed on paper**. |
| Deployment procedure never executed | Local rehearsal: production build, standalone path corrected, `migrate:deploy` on `harolds_s11_scratch`, production-mode start with dummy providers, rollback copy start. Ubuntu host still missing. |

---

## Blocks launch

These will cause real money, real customers, or real kitchen failures if we go live without them.

| # | Item | Why it blocks | Current state | Who |
|---|---|---|---|---|
| 1 | **Customer storefront** | There is nothing for a customer to click. `/` is a placeholder page. | Still absent from this repo. Mock + contract + storefront requirements are ready. | Storefront developer + this repo owner |
| 2 | **Ubuntu production server** | Nowhere to run the app, database, or TLS. | Not provisioned. Local rehearsal only. | Store / hosting |
| 3 | **Registered domain + DNS** | Printer, Square webhooks, and customers all need a real HTTPS hostname. | Not supplied. Must not invent one. | Store |
| 4 | **Production Square credentials** | Sandbox charges are not real; mixing sandbox into production is a live-charge failure. | This machine is `SQUARE_ENVIRONMENT=sandbox`. Health glance must say `production` before go-live. | Store / Square Dashboard |
| 5 | **Twilio + completed A2P 10DLC** | Incomplete registration looks like “sent” while the customer gets nothing. Production will now **refuse to start** if Twilio vars are empty — you still need a completed campaign. | Twilio variables empty here. Registration not started (Sprint 7). | Store / Twilio |
| 6 | **Production email + verified sending domain** | Receipts land in spam or are rejected. Production will **refuse to start** if email vars are empty. | Email key and from-address empty here. | Store / Resend |
| 7 | **Eight unverified prices** | A customer charged an invented beverage/dessert price is a real problem. | Still flagged: Bottled Water $1.50, Cake Slice $4.00, Calypso $2.00, Can Pop $1.00, Hot Peppers (3) $1.25, Lakeshore Fruit Splash $3.50, Obama Tea $3.00, Vinut Juice $2.50. | Store (type real prices in `/admin`) |
| 8 | **Tip preset sign-off** | Unsigned since Sprint 1. Seeded 15 / 18 / 20 / 25% with 18% default. | Not signed. Seed will no longer overwrite an edited preset. | Store |
| 9 | **Contact phone** | Shown on the public store status. Seeded `TODO: CONFIRM PHONE`. | Placeholder. Seed will no longer overwrite an edited phone. | Store |
| 10 | **Manager alert phone and email** | Print failures and unacked orders cannot reach a human. Production will **refuse to start** on the seeded placeholders. | Placeholders on the development database. | Store |
| 11 | **Real staff accounts; deactivate test ones** | Test PINs (`2468`, `1357`, `9753`) must not be on a live kiosk. Production seed cannot restore them, but they still exist in development. | Only `test-staff@localhost`, `test-manager@localhost`, `test-owner@localhost` exist, all active. | Store (owner in `/admin/staff`) |

---

## Does not block launch (accept in writing if still true)

| # | Item | Why it is not a blocker | Current state | Who |
|---|---|---|---|---|
| 12 | Item photographs | Menu works without photos. Ugly, not unsafe. | 0 of 87 items have `imageUrl`. Seed preserves photos once set. | Store |
| 13 | Featured / most-ordered lists | Empty lists are valid. Home sections just have nothing to show. | Both counts are 0. Seed preserves curated flags. | Store (`/admin/menu/curation`) |
| 14 | Provisional modifier groups | Kitchen can run with the four reconstructed groups if you accept them as-is. | Add ons (×2), Choose your topping, Preparation. | Store — **accept or replace** |
| 15 | Exact per-day hours | Seeded 10:30–23:00 every day. Wrong Friday close is an ops issue, not a charge issue. Seed no longer overwrites edited hours. | Uniform week. | Store (`/admin` Store) |
| 16 | Workbook CONFLICT / DUPLICATE? / REVIEW rows | Seeded verbatim. Wrong names/dupes confuse the board; they do not invent prices beyond the eight flagged items. | Unresolved since Sprint 1. | Store |
| 17 | Printer failure drills (paper, cover, power, network) | Behaviour is coded and unit-tested. Physical confirmation still outstanding. | Not run on the TM-m30III. | Kitchen + developer on-site |
| 18 | Physical ticket showing modifiers | Layout is tested. Sprint 11 recorded the ePOS document and plain-text preview (`docs/sprint11-kitchen-ticket-preview.txt`). Paper confirmation outstanding. | Not printed here. | Kitchen |
| 19 | Android audio unlock + Swan kiosk walkthrough | Runbook exists. Device not on hand. | Not walked. | Kitchen + developer on-site |
| 20 | Independent uptime monitor (not Twilio/Resend) | Health endpoint is ready (including a proven database-down 503). Until a domain exists, nothing to probe. | Not subscribed. | Developer after domain |

---

## What we will not do

- Deploy with sandbox Square credentials.
- Invent a domain or a server.
- Go live with unregistered SMS.
- Build a customer storefront in this sprint (out of scope: no new features).
- Charge a real card until production credentials and a storefront exist.

When item 1 is supplied (storefront in this repo or elsewhere), resume Sprint 10 from Phase 2 against the real API. When items 2–11 are supplied, continue through Ubuntu deploy and cutover using [`DEPLOYMENT.md`](./DEPLOYMENT.md) and [`CUTOVER-PLAN.md`](./CUTOVER-PLAN.md).
