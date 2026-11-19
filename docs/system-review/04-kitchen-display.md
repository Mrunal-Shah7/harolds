# 04. Kitchen display

_2026-11-19. Made from the code, [../reference/KITCHEN-KIOSK-RUNBOOK.md](../reference/KITCHEN-KIOSK-RUNBOOK.md) and
the Sprint 6 notes. Not yet walked by checklist. Marks: see [README.md](README.md)._

## Planned changes

| Change | Kind | What will change | Triage | State |
|---|---|---|---|---|
| — | | None yet | | |

## What it is for

The kitchen's screen (a Swan 1 Pro running the page as an installed web app) showing paid orders and letting staff
move each one along: start, ready, picked up, or cancel.

## Who uses it, and where

- **People:** kitchen staff, managers and the owner, each signing in with their own PIN [code]
- **Screens or routes:** `/kitchen` (`apps/web/src/app/(kitchen)/kitchen/page.tsx`, `components/kitchen/KitchenApp.tsx`);
  web app manifest `apps/web/public/kitchen/manifest.webmanifest`, service worker `public/kitchen-sw.js` [code]
- **Backend:** `/api/internal/kitchen/auth/roster`, `auth/signin`, `auth/session`, `auth/signout`, `queue`,
  `orders/[id]`, `orders/[id]/transition` [code]
- **Code:** `apps/web/src/lib/kitchen-*.ts`, `kitchen-alert-sweeper.ts`; `packages/db/src/staff-auth.ts`,
  `kitchen-queue.ts`, `kitchen-alerts.ts`, `order-status.ts`, `pin.ts`; `packages/config/src/kitchen.ts` [code]

## How it works

- **Sign-in:** tap a name on the roster, enter the PIN. The first tap also unlocks the alert sound, because Android
  Chrome will not play audio without a deliberate tap (`KitchenApp.tsx:306`, `kitchen-audio.ts`). [code]
- **Session:** a bearer token kept in `localStorage` so the kiosk survives a reload; the PIN is never stored
  (`kitchen-storage.ts`). Default lifetime 12 hours (`KITCHEN_SESSION_TTL_MS`). [code]
- **Board:** polls `/queue` every 3 s by default (`KITCHEN_POLL_INTERVAL_MS`); the queue holds orders in `PAID`,
  `PRINTED`, `IN_PROGRESS`, `READY` and is driven by order status alone, not by print-job state
  (`kitchen-queue.ts:13`). A new ticket plays a chime (`kitchen-queue-diff.ts`). The header shows the printer's last
  poll and queued jobs. [code]
- **Actions:** each ticket carries its next action. Legal moves are fixed in `ORDER_STATUS_ALLOWED`
  (`order-status.ts`): `PAID`/`PRINTED` → `IN_PROGRESS` or `CANCELLED`; `IN_PROGRESS` → `READY` or `CANCELLED`;
  `READY` → `PICKED_UP`. `READY` cannot go back, `PICKED_UP` cannot be reversed. [code]
- Seen on 2026-11-19: PIN sign-in as Test Staff; the board showed the order with its option; Start → Ready →
  Picked up wrote three `KDS` status events and emptied the board; the header said "Connected" and "Printer … last
  poll never · queued 1"; the clock showed the browser's time zone; after sign-out the roster returned and no
  token stayed in `localStorage` ([run](../runs/2026-11-19-smoke.md), S-08, S-09, S-15). [observed]
- **Unacknowledged orders** (still `PAID`/`PRINTED`): highlighted on screen after 60 s, audible after 120 s, and a
  manager alert email is enqueued once after 180 s (`KITCHEN_UNACK_*`, `kitchen-escalation.ts`,
  `kitchen-alerts.ts`). [code]
- **Data:** `AdminUser` (shared with admin; holds the PIN hash), `AdminSession` with a purpose, `OrderStatusEvent`
  for every transition. [code]

- **In production** (read-only query, 2026-11-19): of 103 paid orders, 62 are still `PRINTED`, 35 `CANCELLED`
  and 6 `PICKED_UP`; only 7 were ever started on the board. Every kitchen ticket printed (103 of 103) and the
  printer polled today. [observed] The store works from the printed ticket only for now; the board is kept
  because the store plans to use it (owner, 2026-11-19). [confirmed]

## Rules it enforces

- PINs and session tokens are stored only as hashes (`pin.ts`). [code]
- 5 failed PINs lock the account for 5 minutes by default, and the lockout is shown (`staff-auth.ts:108-124`). [code]
- A stale transition (the order changed meanwhile) is refused, not applied (`StaleOrderTransitionError`). [code]
- Rate limits: kitchen sign-in 20, other kitchen calls 60 per client per minute; the queue poll is exempt
  (`security.ts`). [code]

## Problems found

| # | Problem | Status |
|---|---|---|
| 1 | 35 production orders ($797.34) were cancelled on the board, in 5 bursts a median of 163 hours after payment, and none was refunded. The owner confirmed these were fulfilled orders cleared off the board, not cancellations. Their status now says `CANCELLED` although they were picked up. | Closed, TR-013 (not a bug) |
| 2 | Because orders stay `PRINTED`, nearly every order sends the manager an "order unacknowledged" email (96 for 103 orders). | Deferred by the owner (2026-11-19): no change for now. TR-014, later work T-010 |

## Questions

1. ~~Were the 35 kitchen cancellations real?~~ No: staff use Cancel to clear finished orders off the board (owner,
   2026-11-19). [confirmed] So a kitchen cancel must not refund by itself: that change would have refunded 35
   fulfilled orders. If the board needs a "clear" action, it is a separate change.
2. ~~Does the store use the board?~~ Not yet; it will later, so the board stays (owner, 2026-11-19).
3. ~~Until the board is in use, should the kitchen's unacknowledged-order alert be switched off?~~ Not now: the
   owner chose no change on 2026-11-19, so it keeps emailing the manager for nearly every order. All 96 production
   alerts carry its reason, "Paid order has not been moved to in progress (kitchen unacknowledged)". If it is taken
   up later (T-010), the option discussed was to switch off only this kitchen alert: the printer's own alert
   (module 05, order still `PAID` after 120 s) shares the email type and would keep the offline-printer and
   failed-print warnings.

## How to test it

Checklist: smoke rows S-08 and S-09 in [checklists/00-smoke.md](checklists/00-smoke.md). Test data: the seeded test
accounts (`pnpm db:seed:accounts`, PINs printed by the seed; see `packages/db/src/seed/run.ts`). Automated:
`apps/web/src/lib/kitchen-escalation.test.ts`, `kitchen-queue-diff.test.ts`; `packages/db/src/staff-auth.test.ts`,
`pin.test.ts`, `kitchen-queue.test.ts`, `kitchen-alerts.test.ts`, `order-status.test.ts`;
`packages/config/src/kitchen.test.ts`.

## Not yet checked

Audio unlock on the Swan device, landscape install as a web app, and behaviour when the network drops are owner
checks on the real device. The service worker (`public/kitchen-sw.js`) failed to register in the built-in browser
on 2026-11-19 although the script is served; whether it registers on the device is not known.
