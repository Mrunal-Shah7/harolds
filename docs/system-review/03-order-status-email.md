# 03. Order status and customer email

_2026-11-19. Made from the code and the earlier sprint notes in [../reference/](../reference/). Not yet walked by
checklist. Marks: see [README.md](README.md)._

## Planned changes

| Change | Kind | What will change | Triage | State |
|---|---|---|---|---|
| — | | None yet | | |

## What it is for

After paying, the guest can follow the order on a status page and gets an email receipt. Email is the only
customer channel; SMS was removed in Sprint 17.

## Who uses it, and where

- **People:** guests [code]
- **Screens or routes:** `/order/[lookupToken]` (`apps/web/src/app/(storefront)/order/[lookupToken]/page.tsx`)
  [code]
- **Backend:** `GET /api/v1/orders/status/[lookupToken]`; the `EMAIL_ORDER_RECEIPT` job [code]
- **Code:** `packages/notify/src/handlers.ts`, `templates-email.ts`, `time.ts`; `packages/email/src/` (the only
  code that imports the Resend SDK) [code]

## How it works

- **Status page:** looks the order up by its random `lookupToken` (unique, `schema.prisma:314`), not by order
  number; refreshes every 15 seconds (`page.tsx:91`). Store details are fetched once. [code] Seen: "ORDER PLACED ·
  PAID", the number, the steps Received / Preparing / Ready and "Ready around 1:13 AM", which is the browser's time
  zone (India in the run), not the store's ([run](../runs/2026-11-19-smoke.md), S-06). [observed]
- **Receipt email:** enqueued when the order becomes `PAID` (`repositories/orders.ts`). The handler builds it from
  stored cents and line snapshots only, with times in the store time zone (`handlers.ts:99`, `time.ts`). A job that
  already has a provider message id is not sent again. [code]
- **Order-ready notice:** none. The `READY` transition no longer enqueues a customer notification
  (`order-status.ts`, Sprint 17 note); `EMAIL_ORDER_READY` and the two SMS job types still exist and their handlers
  return without sending (`handlers.ts:92-97`, `:158`). [code] The receipt is the only email a guest gets; no
  "ready" email is wanted (owner, 2026-11-19). [confirmed]
- **Manager alerts are email too**, through the same worker and Resend key, to the store's manager alert address:
  print failed, order unacknowledged, dead job, payment discrepancy, gateway failure (`handlers.ts:208-293`).
  [code] Production has sent 101 receipts, 96 "order unacknowledged" alerts, 2 payment-discrepancy alerts and 1
  gateway-failure alert (read-only query, 2026-11-19; see TR-014). [observed]
- **Data:** `BackgroundJob` rows (type, payload, attempts, provider message id); `SmsSuppression` and
  `SmsInboundEvent` tables remain from the SMS era. [code]

## Rules it enforces

- A stored email that does not look sendable fails permanently (dead job), not by retrying forever
  (`handlers.ts`). [code]
- Logs never carry a full customer email address (`packages/email/src/redact.ts`). [code]
- Rate limit on the status lookup: 30 per client per minute (`security.ts:30`). [code]
- **Local runs send real email** when `EMAIL_API_KEY` is set: there is no development-only guard in
  `packages/email/src/client.ts`. Test orders must use `@example.test` addresses. [code]

## Problems found

| # | Problem | Status |
|---|---|---|
| 1 | No guard stops a development machine with a real Resend key from emailing whatever address a test order carries. On 2026-11-19 the worker tried 7 waiting local jobs within seconds of starting; only the dummy key stopped them. | Open, TR-002 |
| 2 | The status page shows the ready time in the browser's time zone, not the store's. | Open, TR-011 |

## Questions

1. ~~Should the guest be told when the order is ready?~~ No: the receipt is the only guest email (owner,
   2026-11-19).
2. Can the SMS tables and job types be dropped, or are they kept for history? [question]

## How to test it

Checklist: smoke row S-07 in [checklists/00-smoke.md](checklists/00-smoke.md). Test data: a sandbox order with an
`@example.test` email (Resend rejects it, which is the point). Automated: `packages/notify/src/templates.test.ts`,
`worker.test.ts`, `registry.test.ts`; `packages/email/src/client.test.ts`.

## Not yet checked

A real receipt in a real inbox (spam placement, layout in mail clients) is an owner check.
