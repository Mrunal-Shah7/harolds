# Sprint 18 — SMS and Twilio Removed

SMS is gone. Twilio is gone. Email is now the only channel the application has, for customer
receipts and for every manager alert.

Two decisions shaped the work and are worth stating up front, because most of what follows
follows from them:

- **The public API was NOT broken.** `customer.smsConsent` is still accepted — optional,
  validated as a boolean when present, then discarded. Existing storefront clients keep working.
- **No migration.** The SMS tables and columns still exist and are simply unused. This was a
  code-only removal, so reviving SMS later is an additive change rather than a restore.

---

## 1. What the customer actually loses

Worth being blunt, because it is easy to miss in a refactor of this size:

| Before | After |
|---|---|
| SMS order confirmation | **Email receipt only** |
| SMS "your order is ready" | **Nothing.** The counter calls. |
| Email receipt | Unchanged |

The ready notification has no replacement. `handleEmailOrderReady` was declared in Sprint 1 and
never implemented — its own comment said *"v1 customer-ready is SMS only"* — so removing SMS
removed the only ready notification that existed. `applyOrderTransition` no longer enqueues
anything when an order reaches READY, and `order-status.test.ts` now asserts that absence
deliberately, so silently re-adding a notification would fail the test rather than slip through.

Restoring it means implementing the email handler first. It is not a flag flip.

## 2. Manager alerts are email-only, and that raised the stakes

`deliverManagerAlert` used to try SMS, then email, and required *at least one* destination.
There is no way to send to a phone any more, so email is not one of two options — it is the
only one, and its absence means alerts are silently dropped.

Consequences, all deliberate:

- `managerDestinationProblems(email)` takes one argument. A phone number no longer satisfies it.
- `EMAIL_API_KEY` is now described in the production guard as *"receipts and all manager alerts"*.
- **A real bug surfaced here.** The guard only checked that the email was non-empty and not the
  seeded placeholder. A phone number left in `managerAlertEmail` passed, so a production start
  would report alerting as configured while every alert failed at send time. The guard now
  applies the same email-shape regex the notify package uses before it will send. The test
  `"a phone number is NOT a usable destination any more"` is what caught it.
- `StoreConfig.managerAlertPhone` still exists on the row and is never read.

## 3. The retired job types

`JobType` is a **PostgreSQL enum**, and 131 `BackgroundJob` rows referenced
`SMS_ORDER_CONFIRMATION` / `SMS_ORDER_READY`. Dropping enum values needs a migration plus the
deletion of historical rows, which the code-only decision rules out. So both values remain
declared, and:

- Nothing enqueues them any more.
- Their handlers are permanent skips returning `SKIPPED_SMS_REMOVED`, so rows queued before the
  removal drain to a terminal state instead of failing forever as an unhandled type.
- `worker.test.ts` asserts exactly that, because a job type with no handler crashes the worker
  pass rather than failing one job.

## 4. Removed, kept, and why

**Deleted:** `packages/sms` (and its Twilio dependency), `/api/v1/webhooks/twilio`,
`notify/src/inbound.ts` (STOP/HELP keyword handling), `notify/src/templates-sms.ts`, the
`sendSms` port, `isPhoneSuppressed` / `setSmsSuppression` / `recordSmsInboundEvent`, and every
`TWILIO_*` environment variable.

**Kept deliberately:**

- **`Order.customerPhone`** — still required. The duplicate-order guard matches on
  (phone, cart signature), and a pickup counter needs a way to reach someone. Only *texting*
  went away.
- **`smsConsent` / `smsConsentAt` columns** — present, never written. Recording permission to
  send a message nothing can send would be a false record.
- **`SmsSuppression` / `SmsInboundEvent` tables** — empty (0 rows at removal), unused, still
  listed in `verify-restore.mjs` because they are still real tables a restore should contain.
- **The `NotifyPorts` object shape** — `{ sendEmail }` rather than a bare function, so adding a
  second channel back does not mean rewriting every handler signature again.

### One behavioural change worth knowing about

Dropping `smsConsent` from `canonicaliseOrderPayload` changes **every derived idempotency key**,
once, at deploy. A customer holding a checkout page open across the deploy derives a new key and
could create a second order. The window is one page load wide and the server-side duplicate guard
(phone + cart signature) still catches it, but it is a real one-time effect rather than a no-op.

## 5. Follow-up fixes (same sprint)

**The ambiguous-payment copy told customers to "check your texts."** The one piece of
customer-facing SMS wording the removal missed. It now points at the email receipt and the
store's phone. A test asserts the message contains no "text".

**`PAYMENT_FAILED` now carries a reason.** `details` was `null` on every ambiguous failure, so
"we couldn't confirm that payment" was undiagnosable without opening the database. The
customer-facing sentence is deliberately unchanged — the honest answer is always "we don't know
yet" — but the response now names which unknown it is: `GATEWAY_UNCONFIRMED`,
`CHARGE_IN_PROGRESS`, `RECOVERY_UNAVAILABLE`, `AMOUNT_MISMATCH`, `GATEWAY_SALE_INCOMPLETE`.

**A declined order could replay as a successful one.** `claimOrderForCharge` checked
`processorPaymentId` before `paymentStatus`. NMI returns a `transactionid` on declines as well
as approvals, and that id is deliberately kept so the failure stays traceable — so a declined
order carries one, was classified `already_charged`, and the caller replayed it to the customer
as a placed order they had never paid for. The definite states are now checked first. Two
regression tests cover it, one at the claim level and one through the checkout path.

**A retry after a decline reported `PAYMENT_FAILED`.** It replayed the stored decline reason
under the ambiguous error code, which is the one wording that discourages trying another card —
exactly what a declined order needs. It now returns `PAYMENT_DECLINED`.

## 6. Order numbers were being consumed by tests

`OrderNumberCounter` is gap-free and never rolls back, so a test that reaches PAID permanently
consumes a real order number even after its order is deleted. Two files allocated against the
live counter using the wall clock — `charge-recovery.test.ts` (added this sprint) and the
pre-existing `order-number-idempotency.test.ts` — which is why a store's numbering jumped from
071 to 112 across a working session.

Both now pin the clock to a far-future business date and allocate from a throwaway counter row
that their cleanup deletes, matching what `order-numbers.test.ts` already did. `finalisePaidOrder`
takes its `paidAt` from the injected `ChargeDeps.now` rather than `new Date()` to make that
possible. Verified: a full suite run leaves the live counter untouched.

## 7. The checkout honeypot was blocking real customers

The anti-card-testing decoy was `name="company_website"` with a visible "Company website" label.
Browser password managers matched it on two of the strongest autofill tokens and filled it with
the user's organisation — and a non-empty decoy fails the submit check on *every* attempt, so an
affected customer was permanently unable to pay, with a generic message and no way out. It is
now semantically empty (`hx_9f2`, no label), so there is nothing for autofill to match. Renaming
it back to anything readable would silently reintroduce the bug; the comment says so.

## 8. Test isolation fixes found along the way

Two pre-existing weaknesses surfaced while running suites repeatedly. Neither was caused by this
work, both are fixed:

- **The manager-alert volume cap is global and time-based.** It counts every delivered alert of a
  type in a rolling 15-minute window, not just the current suite's. A `SUCCEEDED`/`SENT` alert
  left behind by the Sprint-5 print tests — which have no `testPrefix` to match on — silently
  capped the alerts the notify tests expected to send. `worker.test.ts` cleanup now clears
  delivered alerts of the types it exercises, so run order stops mattering.
- **`charge-recovery.test.ts` orphaned background jobs.** Its cleanup matched job payloads on the
  test prefix, but order ids are cuids and never carry that prefix, so it deleted nothing and left
  a receipt/alert job behind per paid order. It now deletes by the real order ids.

## 9. Verification

| Check | Result |
|---|---|
| Typecheck, all 10 packages | Pass |
| `config` / `payments` / `db` / `notify` / `pricing` / `print` / `web` | 31 / 19 / 128 / 17 / 65 / 25 / 90 |
| **Total** | **375 passing, 0 failing**, stable across consecutive full sweeps |
| Live order-number counter | Unchanged by a full test run |
| `next build` | Succeeds; `/api/v1/webhooks/twilio` no longer in the route table |
| Dependency sweep | No `twilio` in any manifest; `packages/sms` deleted |

### Follow-ups

1. **`pnpm install`** when the registry is reachable. The lockfile importers were hand-edited;
   orphaned `twilio@5.13.1` and `square@*` package entries remain and will be pruned.
2. **586 dead `BackgroundJob` rows** predate this sprint and are untouched. Most trace to a
   Twilio *trial* account that could only message verified numbers, plus a self-feeding loop
   (`ALERT_MANAGER_JOB_DEAD` is 256 of them: a dead job enqueues an alert, the alert fails the
   same way, which enqueues another). Removing Twilio stops new ones; clearing the backlog is a
   separate decision.
3. **Manager alert email must be real in production.** It is now the only channel, and the
   startup guard refuses a production start without it.
