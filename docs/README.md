# Harold's Chicken Burnham ordering: docs

_Index. Start with the [system map](system-map.md), then [handover.md](handover.md) for where the work stopped.
How the cycle works and every format: [../SDLC-GUIDE.md](../SDLC-GUIDE.md)._

## How the pieces fit

| File or folder | Holds | Written when |
|---|---|---|
| `../CLAUDE.md` | The rules every session follows | A rule is learned or stops applying |
| [../SDLC-GUIDE.md](../SDLC-GUIDE.md) | The cycle, the formats, the rules for changing them | The way of working changes |
| [../REVIEW.md](../REVIEW.md) | How pull requests are reviewed | Monthly tuning |
| [system-map.md](system-map.md) | Profile, parts, data, running, testing, deploying | Any of those changes |
| [triage.md](triage.md) | Every incoming task, sorted | Before any work |
| [changes/](changes/) | One folder per change: intent, spec, plan, build note | As the change moves through the cycle |
| [system-review/](system-review/README.md) | How each module behaves: the source of truth | Before and with every change to the module |
| [system-review/checklists/](system-review/checklists/README.md) | Hands-on test scripts | With the review; when a row is missing |
| [testing.md](testing.md) | How hands-on checks are done | The tools or setup change |
| [runs/](runs/README.md) | One log per checklist run | After each run |
| [lessons.md](lessons.md) | What real use taught, and the rule from each | After a production incident is fixed |
| [handover.md](handover.md) | Open branches and the latest five sessions | A branch is cut or merges; every session's end |
| [handover-archive.md](handover-archive.md) | Older handover entries | handover.md passes five entries |
| [reference/](reference/README.md) | The sprint-era docs (Sprints 1–19): runbooks, deployment, security, sprint notes. Background only | Not updated; they drift from the code |
| [openapi/v1.yaml](openapi/v1.yaml) | The public API contract (read by `openapi:validate`) | A public endpoint changes |
| `harolds-menu-reconciliation.xlsx` | The menu seed source (read by `db:seed`) | The seed menu changes |
| `../scripts/check-docs.mjs` | Checks the docs against each other and git | A check is wrong or missing |

## Changes (`changes/`)

_One line per change folder, newest first: number, title, triage IDs, path, status. Added when the folder is
created._

- 001, [Set up the development cycle](changes/001-setup-cycle/build.md), TR-001, light, built on
  `chore/tr-001-setup-cycle` (not merged).

## System review (`system-review/`)

| # | Module | Status |
|---|---|---|
| 01 | [Menu and storefront browsing](system-review/01-menu-storefront.md) | From code 2026-11-19; smoke rows walked |
| 02 | [Checkout and payments](system-review/02-checkout-payments.md) | From code 2026-11-19; smoke rows walked; 4 problems |
| 03 | [Order status and customer email](system-review/03-order-status-email.md) | From code 2026-11-19; smoke rows walked; 2 problems |
| 04 | [Kitchen display](system-review/04-kitchen-display.md) | From code 2026-11-19; smoke rows walked; 2 problems from production data |
| 05 | [Printing](system-review/05-printing.md) | From code 2026-11-19; smoke rows walked (no printer) |
| 06 | [Admin: menu and store](system-review/06-admin-menu-store.md) | From code 2026-11-19; smoke rows walked |
| 07 | [Admin: orders and money](system-review/07-admin-orders-money.md) | From code 2026-11-19; smoke rows walked |
| 08 | [SEO](system-review/08-seo.md) | From code 2026-11-19; smoke rows walked |
| 09 | [Platform](system-review/09-platform.md) | From code 2026-11-19; smoke rows walked; 5 problems |

## Questions

_Every open question, grouped by topic, each pointing at the document that holds the details. When answered:
write the answer into that document and remove the line here._

**Payments and money**

- Should a stale pending order be repriced or abandoned after a menu change? (TR-004,
  [02](system-review/02-checkout-payments.md))
- Does "Connection to tokenization service failed" show to real customers? (TR-012,
  [02](system-review/02-checkout-payments.md))

**Menu, store and kitchen**

- Is the "most ordered" list meant to stay hand-curated? ([01](system-review/01-menu-storefront.md))
- Are the eight unverified prices and the contact phone settled in the live admin?
  ([06](system-review/06-admin-menu-store.md))
- Is a separate counter printer in use? ([05](system-review/05-printing.md))

**Customers**

- Can the SMS-era tables and job types be dropped? ([03](system-review/03-order-status-email.md))
- Should customer-facing times use the store's time zone rather than the browser's? (TR-011)

**Running and deploying**

- Should the gateway reseller's API document stay in the repository? (TR-003)

## Later work (agreed, not scheduled)

_Each gets a triage line when it is picked up. From the system map's "What is missing"; items already triaged
carry their ID._

| ID | What | Why |
|---|---|---|
| T-001 | CI on pull requests, and branch protection on `master` | Nothing runs the checks except a person; any push reaches `master` |
| T-002 | A staging or test environment | The only environments are this machine and production |
| T-003 | A browser end-to-end harness | Checkout tabs, storefront and admin have no UI tests |
| T-004 | A development guard against real email and error reports | Triaged as TR-002 |
| T-005 | One Node and pnpm version, and a working format check | Triaged as TR-007 and TR-008 |
| T-009 | Off-box backups and a restore drill on the server | Triaged as TR-015; never done |
| T-010 | Stop the kitchen's "order unacknowledged" email while the store works from printed tickets; the option discussed was to switch off only the kitchen alert and keep the printer's | From TR-014: 96 manager emails for 103 orders. Deferred by the owner on 2026-11-19; take it up before or when the kitchen board goes into use |
| T-006 | A way to clean up test orders | Orders cannot be deleted; test orders stay in the database |
| T-007 | A rollback practised on the production server | Only practised on the development machine (Sprint 11) |
| T-008 | An independent uptime monitor on `/api/v1/health` | Listed as waiting for a domain; the domain now exists |

## Runs (`runs/`)

_One line per run, newest first: date, checklist, build, result in a sentence, triage IDs it opened._

- 2026-11-19, [00-smoke](runs/2026-11-19-smoke.md), `448777d` on a local dev server: 15 of 15 rows pass; opened
  TR-010, TR-011, TR-012.
