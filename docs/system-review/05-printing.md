# 05. Printing

_2026-11-19. Made from the code, [../reference/PRINT-RUNBOOK.md](../reference/PRINT-RUNBOOK.md) and the Sprint 5
notes. Not yet walked by checklist. Marks: see [README.md](README.md)._

## Planned changes

| Change | Kind | What will change | Triage | State |
|---|---|---|---|---|
| — | | None yet | | |

## What it is for

Prints a kitchen ticket for every paid order on the store's existing Epson TM-m30III, which polls the app over
HTTPS (Epson Server Direct Print), with retries and an alert when printing fails.

## Who uses it, and where

- **People:** nobody directly; the printer polls. Managers reprint from admin (module 07). [code]
- **Backend:** `POST /api/v1/print/poll`, `POST /api/v1/print/complete` (`apps/web/src/lib/sdp-handler.ts`,
  `sdp-auth.ts`); admin `POST /api/internal/admin/print` [code]
- **Code:** `packages/print/` (ticket model, layout, ePOS-Print XML, SDP envelope),
  `packages/db/src/print-jobs.ts`, `apps/web/src/lib/print-sweeper.ts`, `print-ops.ts`,
  `packages/config/src/printers.ts`; `scripts/rotate-print-secret.mjs` [code]

## How it works

- **Enqueue:** when an order is paid, one `PrintJob` with target `KITCHEN_TICKET` is created; it carries the
  ticket and the receipt together (`repositories/orders.ts:400-430`). [code]
- **Poll:** the printer identifies itself by serial (`PRINTER_SERIAL_NUMBER`; optional
  `PRINTER_KITCHEN_SERIAL` / `PRINTER_COUNTER_SERIAL`). Each poll updates `PrinterHeartbeat` and claims the next
  `QUEUED` job for that serial with `FOR UPDATE SKIP LOCKED`, marking it `SENT` and counting the attempt
  (`print-jobs.ts:135`). [code]
- **Complete:** the printer reports success or failure; a completion for a job that is not `SENT` changes nothing
  (`print-jobs.ts:199-237`). Acknowledging the kitchen ticket moves the order `PAID` → `PRINTED`. [code]
- **Sweeper:** a `SENT` job not acknowledged in 90 s goes back to `QUEUED` with exponential backoff (base 30 s);
  after 5 attempts it is `FAILED` and an `ALERT_MANAGER_PRINT_FAILED` email is enqueued (`print-jobs.ts:303-361`,
  `PRINT_*` defaults in `.env.example`). A failure the printer reports goes back to `QUEUED` after the same
  backoff, and is cancelled with the same alert at the ceiling. Worst case to the alert: about 15 minutes when the
  printer takes jobs but never confirms (5 × 90 s plus 30 + 60 + 120 + 240 s of backoff), about 8 minutes when it
  reports each failure. [code]
- **Printer silent:** if the printer never polls (off, offline), no attempt is counted and the print-failed alert
  never comes. Instead the sweeper emails `ALERT_MANAGER_ORDER_UNACKNOWLEDGED` once for an order still `PAID` with
  an unprinted job 120 s after payment (`PRINT_UNACKNOWLEDGED_ORDER_MS`, `print-jobs.ts:375-399`), reason "Paid
  order has print jobs that never reached PRINTED (printer may be off)." [code] In production it has never fired
  (read-only query, 2026-11-19). [observed]
- **Ticket content:** built from order-line snapshots only; text is XML-escaped and folded to ASCII so the markup
  never breaks (`packages/print/src/encoding.ts`, `layout.ts`). Reprints carry a reprint banner. [code]
- **Data:** `PrintJob`, `PrinterHeartbeat`. [code]

## Rules it enforces

- Legal print-job moves: `QUEUED` → `SENT`/`CANCELLED`; `SENT` → `PRINTED`/`FAILED`/`QUEUED`; `FAILED` →
  `QUEUED`/`CANCELLED`; `CANCELLED` → `QUEUED` (`print-jobs.ts:35-38`). [code]
- Authentication: Digest with `PRINTER_SDP_SHARED_SECRET`; the query string or `X-Print-Secret` header is also
  accepted because the firmware does not send Digest reliably (old handover). Production requires a secret of at
  least 32 characters. [code]
- Seen on 2026-11-19: a wrong secret on the poll got 401 with an empty body and a `print.unauthenticated` log
  line; the paid test order's job stayed `QUEUED` because no printer polls locally
  ([run](../runs/2026-11-19-smoke.md), S-07, S-10). [observed]
- Print paths are exempt from rate limits; bodies capped at 256 KiB (`security.ts`). [code]
- nginx must leave the query string out of access logs for `/api/v1/print/`
  ([../reference/DEPLOYMENT.md](../reference/DEPLOYMENT.md) §3). [code]

## Problems found

| # | Problem | Status |
|---|---|---|
| — | None yet | |

## Questions

1. Is a separate counter receipt printer in use, or is everything on one TM-m30III? [question]

## How to test it

Checklist: smoke row S-10 in [checklists/00-smoke.md](checklists/00-smoke.md). Test data: a paid sandbox order; the
poll can be driven with `scripts/sprint11-mock-handoff.mjs` style requests carrying the secret. Automated:
`packages/print/src/*.test.ts`, `packages/db/src/print-jobs.test.ts`, `packages/config/src/printers.test.ts`.

## Not yet checked

Paper output, printer failure drills and TLS trust on the real printer (listed as not run in
[../reference/LAUNCH-BLOCKERS.md](../reference/LAUNCH-BLOCKERS.md), rows 18–19).
