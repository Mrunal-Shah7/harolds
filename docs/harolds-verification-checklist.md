# Manual Verification Checklist — Harold's Chicken Oak Lawn

Work through this in order. Sections A and B can be done today on the development machine. Sections C and D need someone at the store. Sections E onward need the storefront, the server, and production credentials.

Tick nothing you have not personally observed. The point of this document is to catch the things that pass a test and fail on a Tuesday night.

---

## A. Do this today — protect the work

| # | Check | How | Expected |
|---|---|---|---|
| A1 | **Commit everything** | `git status` | Nine sprints of work are uncommitted. Commit them. |
| A2 | **Tag the current state** | `git tag sprint-11` | A tag exists so rollback has a target. |
| A3 | **Push to a remote** | `git remote -v`, then push | The code exists somewhere other than this laptop. If there is no remote, create one. |
| A4 | **Confirm `.env` is not committed** | `git ls-files \| grep env` | Only `.env.example` appears. |
| A5 | **Take a database backup and copy it off the machine** | `pnpm backup` | A dump file exists somewhere other than this disk. |

**Do not proceed past this section until A1–A3 are done.** Everything below is worthless if the code is lost.

---

## B. Verify on the development machine

### B1. The system still runs end to end

| # | Check | Expected |
|---|---|---|
| B1.1 | `pnpm install && pnpm db:generate && pnpm db:migrate:deploy && pnpm db:seed && pnpm db:verify` from a clean clone of your new commit | Exits 0. 87 items, 8 unverified, 4 provisional. |
| B1.2 | `pnpm test` | 287 pass. Run it twice; identical counts. |
| B1.3 | `pnpm dev`, then browse `/api/v1/menu` | 17 categories, 87 items, envelope version 1.2.0. |
| B1.4 | `POST /api/v1/quote` with a real item id | Priced result whose subtotal + tax + tip equals the total. |
| B1.5 | Place a sandbox order end to end | Order paid, number allocated, two print jobs queued, two notification jobs queued. |

### B2. The guards Sprint 11 added actually guard

| # | Check | Expected |
|---|---|---|
| B2.1 | `NODE_ENV=production pnpm db:seed` | Refuses. Names the test accounts. Exits non-zero. Writes nothing. |
| B2.2 | Start with `NODE_ENV=production` and empty Twilio/email vars | Refuses to start. Names every missing variable at once. |
| B2.3 | Start with `NODE_ENV=production` and a short print secret | Refuses. Names the length requirement. |
| B2.4 | Start with `NODE_ENV=production` and placeholder manager alert destinations | Refuses after the database connects. |
| B2.5 | Development start with all of the above empty | Starts normally. |

### B3. The money is right

| # | Check | Expected |
|---|---|---|
| B3.1 | Quote a cart of one Mayo Packet (29¢) | Tax 3¢, total 32¢. |
| B3.2 | Quote a cart totalling $15.87 | Tax $1.60, total $17.47. Matches the counter receipt you already have on paper. |
| B3.3 | Add the "Add Fries" modifier to a gizzards item | Unit price rises by exactly 449¢. |
| B3.4 | Run the daily sales report against your development orders | Every order's parts sum to its total. Report aggregates equal the sum of stored values. |
| B3.5 | Send a price field in a quote request | Rejected with `PRICE_FIELD_FORBIDDEN`. |

---

## C. At the store — the printer

Someone must be physically at the TM-m30III. Budget an hour. **This is the section most likely to find something.**

### C1. The loop still works at all

| # | Check | Expected |
|---|---|---|
| C1.1 | Confirm the printer's SDP URL matches the running server's poll path exactly | Path, not root. Secret present. |
| C1.2 | Watch the server log for polls | A poll roughly every 5 seconds. |
| C1.3 | Place a test order | Kitchen ticket prints within ~10 seconds. Counter receipt follows. |
| C1.4 | Check the print job rows | Status printed, both `sentAt` and `acknowledgedAt` set, acknowledged not earlier than sent. |

**C1.3 is the important one.** The print path has not been exercised on hardware since Sprint 5, and Sprint 11 found broken imports in the handler file. If nothing prints, this is why.

### C2. The ticket is right on paper

| # | Check | Expected |
|---|---|---|
| C2.1 | Order an item **with several modifiers and a note** | Modifiers print indented in uppercase beneath the item name. This has never been seen on paper. |
| C2.2 | Order an item with an ampersand in its name (Mac & Cheese, Chicken & Catfish) | Prints correctly. No truncation, no missing ticket. |
| C2.3 | Order with quantity above one | `2 X` prefix present. |
| C2.4 | Read the ticket from arm's length as a cook would | Order number legible. `** PAID **` and the online marker unmissable. |
| C2.5 | Reprint the same order from `/admin` | `*** REPRINT ***` banner present. Original time, not current time. |

### C3. The four failure drills

Skipped since Sprint 5. Each takes about two minutes.

| # | Drill | Expected |
|---|---|---|
| C3.1 | Remove paper mid-queue, place an order, reload paper | Ticket eventually prints. Not lost, not duplicated. |
| C3.2 | Open the cover, place an order, close it | Same. |
| C3.3 | Power the printer off, place an order, wait past the alert window, power on | Manager alert raised. Ticket prints on return. Order visible on the kitchen display throughout. |
| C3.4 | Disconnect the printer from the network mid-queue, reconnect | Recovers without intervention. |

---

## D. At the store — the kitchen display

| # | Check | Expected |
|---|---|---|
| D1 | Open the kitchen URL on the Swan in Chrome | Sign-in screen loads. |
| D2 | Add to Home screen, launch from the icon | Full screen, no address bar. |
| D3 | Sign in with a PIN | Board loads. |
| D4 | **Tap once, then let an order pass the audible threshold** | **You hear the sound.** Not just a colour change. This has never been confirmed on the device. |
| D5 | Let an order sit past the on-screen threshold | Card changes colour visibly without any interaction. |
| D6 | Advance an order through in-progress, ready, picked up | Each transition sticks. Customer status endpoint reflects it. |
| D7 | Turn off the store wifi for thirty seconds | Board keeps showing tickets with a degraded indicator. Does not go blank. |
| D8 | Turn it back on | Recovers on its own, no reload. |
| D9 | Enable screen pinning, then try to swipe out | Stays in the app. |
| D10 | Leave the device untouched for twenty minutes | Screen still on. |
| D11 | Kill the app and reopen it | Returns to the board, not the PIN pad. |
| D12 | Check the header's printer status | Shows a recent poll time. Turn the printer off and confirm it goes stale. |

---

## E. Before you go live — data and accounts

Everything here is typed into `/admin`. None of it needs a developer.

| # | Item | Where |
|---|---|---|
| E1 | Real prices for the eight placeholder items | Menu → each item |
| E2 | Real per-item modifier data — **see the note below** | Modifiers, then bindings |
| E3 | Contact phone | Store |
| E4 | Manager alert phone and email | Store |
| E5 | Real per-day hours replacing the uniform week | Store → hours |
| E6 | Tip presets confirmed or changed | Store (owner only) |
| E7 | Tax rate confirmed with your accountant | Store (owner only) |
| E8 | Featured and most-ordered curated | Menu → curation |
| E9 | Real staff accounts created with distinct PINs | Staff (owner only) |
| E10 | Test accounts deactivated, not deleted | Staff |
| E11 | Workbook conflicts resolved — duplicate sides, cole slaw sizes, the Livers & Gizzards ambiguity | Menu |

**On E2:** only 8 of 87 items currently have any modifiers. A customer ordering a 1/2 Chicken cannot say "fried hard" or "sauce on the side." Verify this by opening several items in the storefront and confirming each offers the choices your counter staff would ask for. This is a functional gap, not a cosmetic one.

---

## F. Before you go live — infrastructure

| # | Item | Verify |
|---|---|---|
| F1 | A2P 10DLC brand and campaign **approved**, not merely submitted | Twilio console shows approved |
| F2 | Ubuntu server provisioned | Node 24, pnpm 11.8.0, PostgreSQL local-only, app role without CREATEDB |
| F3 | Domain with valid TLS, **complete chain** | Test from outside the network. The printer is stricter than a browser. |
| F4 | Production Square credentials | `/api/v1/health` reports `squareEnvironment: production` |
| F5 | Email sending domain verified with SPF, DKIM, DMARC | Provider console |
| F6 | Backups running off-box, restore drilled **on the server** | Restore to a scratch database and verify counts |
| F7 | nginx forwards real client address | Rate limiting keys per client, not one bucket for everyone |
| F8 | nginx preserves raw body for the Square webhook | A test webhook verifies |
| F9 | nginx omits query strings from print poll access logs | Check the log file for `?key=` |
| F10 | Independent uptime monitor pointed at health | Alerts reach a phone by a path that is not Twilio or Resend |

---

## G. Cutover day

| # | Check |
|---|---|
| G1 | Backup taken immediately before migration |
| G2 | Printer re-pointed at production, secret rotated, ticket prints |
| G3 | Square webhook subscription at the exact production path, not root — verify a delivery |
| G4 | Kitchen display reinstalled from the production origin |
| G5 | Small real charge made and refunded, both recorded |
| G6 | Staff dry run: at least twenty realistic orders worked as they would during service |
| G7 | Site loads on mobile data, not store wifi |
| G8 | Someone who can refund, reprint, and correct status is present for the first service |
| G9 | The DoorDash decision is recorded — marketplace listing kept or removed, deliberately |

---

## H. First week

| # | Daily |
|---|---|
| H1 | Run reconciliation and read the findings |
| H2 | Check the dead job count on the dashboard — non-zero means someone was not told something |
| H3 | Check printer last-polled during trading hours |
| H4 | Check payment decline and failure rates |
| H5 | Confirm each day's order numbers are gap-free |

---

## The one thing that blocks everything

There is no customer storefront. Sections E through H cannot begin until one exists and has been integrated against contract 1.2.0.

If your frontend developer has delivered, point it at the mock first, then the real API, and resume Sprint 10 from Phase 2. If they have not, that is its own sprint and a substantial one.
