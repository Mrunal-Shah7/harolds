# 07. Admin: orders and money

_2026-11-19. Made from the code, [../reference/ADMIN-OPERATOR-GUIDE.md](../reference/ADMIN-OPERATOR-GUIDE.md) and
the Sprint 8, 11, 16 and 18.3 notes. Not yet walked by checklist. Marks: see [README.md](README.md)._

## Planned changes

| Change | Kind | What will change | Triage | State |
|---|---|---|---|---|
| — | | None yet | | |

## What it is for

Lets managers see orders, fix them (status correction, cancel, refund, reprint), see sales, and check that the
database agrees with the payment gateway.

## Who uses it, and where

- **People:** managers and the owner [code]
- **Screens or routes:** `/admin` (dashboard), `/admin/orders`, `/admin/reports`, `/admin/jobs` [code]
- **Backend:** `/api/internal/admin/dashboard`, `orders`, `orders/[id]`, `orders/[id]/refund`, `/cancel`,
  `/reprint`, `/status`, `reports`, `reports/export`, `reconcile`, `jobs`, `jobs/[id]`, `print` [code]
- **Code:** `packages/db/src/admin-orders.ts`, `admin-dashboard.ts`, `admin-reports.ts`, `refunds.ts`,
  `reconcile.ts`, `scheduled-reconcile.ts`, `reconcile-cli.ts`, `sprint16-reconcile-cli.ts`;
  `apps/web/src/lib/refunds.ts`, `print-ops.ts`, `reconcile-scheduler.ts` [code]

## How it works

- **Dashboard:** printer last poll, job counts, today's orders and the store state (`admin-dashboard.ts`). [code]
- **Orders:** list with redacted contact details; detail with full history, payment attempts and status events
  (`admin-orders.ts`). Times in the store time zone, money from stored cents (`apps/web/src/lib/admin-format.ts`).
  [code]
- **Refund** (`apps/web/src/lib/refunds.ts:24`): full or partial. The amount is reserved first, then sent to the
  gateway. A decline releases it; an unconfirmed outcome keeps it reserved and tells the manager not to refund the
  same amount again; a later webhook can confirm it. The refundable remainder is total minus refunded minus
  reserved. [code]
- Seen on 2026-11-19: the order detail showed redacted phone and email, times in CST, the payment attempt with
  gateway code, AVS and CVV results, print and notification jobs, and the status history. A full refund asked for
  confirmation, took about 5 s at the sandbox, and left the order `REFUNDED` with "Refunded $9.68 · remaining
  $0.00" ([run](../runs/2026-11-19-smoke.md), S-12). [observed]
- **Cancel** refunds and cancels together (`cancelOrder`, `refunds.ts:162`). [code]
- **Status correction:** uses the same transition table as the kitchen, with source `ADMIN_CORRECTION`
  (`order-status.ts`). [code]
- **Reprint, requeue, cancel print jobs** (`print-ops.ts`). [code]
- **Reports:** sales by date range from stored cents, never recomputing tax or tips; CSV export
  (`admin-reports.ts:73`, `:177`). [code]
- **Jobs:** list background jobs, retry or cancel one (`/admin/jobs`). [code]
- **Reconciliation:** a daily in-process pass at `RECONCILE_HOUR_LOCAL` (default 4 a.m. store time) over the last
  48 hours records findings in `ReconciliationRun` and repairs nothing (`scheduled-reconcile.ts`). `pnpm reconcile`
  runs the gateway comparison by hand; `pnpm reconcile:sprint16` is a database-only report. Discrepancies enqueue
  `ALERT_MANAGER_PAYMENT_DISCREPANCY`. [code]
- **Data:** `Order`, `ProcessorRefund`, `PaymentAttempt`, `OrderStatusEvent`, `ReconciliationRun`,
  `BackgroundJob`. [code]

## Rules it enforces

- A refund can never exceed the remaining refundable amount (`assertRefundAmount`, `admin-orders.ts:244`). [code]
- A declined refund is final for that request: "Do not retry the same request" (`refunds.ts:154`). [code]
- Refund and cancel are `MANAGER` and up; staff accounts and audit are `OWNER` only (`admin-route-registry.ts`).
  [code]

## Problems found

| # | Problem | Status |
|---|---|---|
| — | None yet | |

## Questions

1. ~~Has reconciliation run against production?~~ The scheduled pass runs: 82 `ReconciliationRun` rows from
   2026-08-29 to 2026-11-18, and 2 payment-discrepancy alerts were sent (read-only query, 2026-11-19). [observed]
   Whether `pnpm reconcile` was ever run by hand is not known and no longer matters.

## How to test it

Checklist: smoke row S-12 in [checklists/00-smoke.md](checklists/00-smoke.md). Test data: a paid sandbox order with
an `@example.test` email; refunds go to the NMI sandbox. Automated: `apps/web/src/lib/refunds.test.ts`;
`packages/db/src/admin-reports.test.ts`, `scheduled-reconcile.test.ts`, `sprint16-reconcile.test.ts`,
`order-status.test.ts`, `jobs.test.ts`.

## Not yet checked

A refund on the production gateway, and the CSV export opened in a spreadsheet, are owner checks.
