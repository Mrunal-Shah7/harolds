# Sprint 7 Notes — Background Worker, Transactional SMS, Email Receipts & Alert Delivery

Harold's Chicken Oak Lawn. In-process job worker drains `BackgroundJob` into Twilio SMS and Resend email. Transactional only.

**Contract:** public storefront remains `1.2.0`. The Twilio inbound webhook is a provider surface, not part of the OpenAPI storefront contract.

---

## Phase gates

| Phase | Result | Notes |
|---|---|---|
| 1 Sprint 6 remediation | **1.1 passed; 1.2 blocked** | Distinct PINs. Android Chrome audio not verified — no device. |
| 2 Worker | Passed | Interval worker, atomic `SKIP LOCKED` claim, stranded recovery, registry. |
| 3 Retry / dead letter | Passed | Backoff, dead boundary, recursion guard, permanent vs transient. |
| 4 SMS channel | Passed (live delivery **blocked**) | Twilio isolated in `@harolds/sms`. No live credentials. A2P 10DLC incomplete. |
| 5 Email channel | Passed (live delivery **blocked**) | Resend isolated in `@harolds/email`. Domain unverified / unset. |
| 6 Customer content | Passed | Confirmation, ready (enqueued in READY txn), receipt from stored cents. |
| 7 Manager alerts | Passed | Destinations, per-type copy, volume cap, recursion guard. |
| 8 Consent / opt-out | Passed | Send-time consent, suppression, inbound webhook idempotency. |
| 9 Ops visibility | Passed | Queue report, retry, bulk retry, cancel, dead threshold. |
| 10 Tests / notes | **10.1–10.4 passed; 10.5 blocked** | Full suite without live providers. End-to-end sandbox send blocked — no Twilio/Resend. |

---

## Phase 1 — Sprint 6 remediation

### 1.1 Distinct PINs (passed)

Seeded accounts:

| Display name | Email | Role | PIN |
|---|---|---|---|
| Test Staff | test-staff@localhost | STAFF | **2468** |
| Test Manager | test-manager@localhost | MANAGER | **1357** |

Roster-then-PIN is kept as the shared-tablet interaction. A PIN now identifies one account; `staff-auth.test.ts` proves one account's PIN cannot authenticate as the other.

**Change these PINs before a live shift.**

### 1.2 Android audio (blocked)

No Android device (Swan 1 Pro or otherwise) was available. The unlock-on-gesture path from Sprint 6 is unchanged. Do not treat desktop Chrome as a substitute. Confirm on the kitchen tablet before the first live service.

---

## Worker knobs

| Knob | Default | Reasoning |
|---|---|---|
| Interval | **5s** | Faster than the print sweeper (10s). Confirmation should leave shortly after payment. |
| Claim limit | **10** | A crash must not leave a thousand rows `RUNNING`. |
| Stranded timeout | **90s** | Same order of magnitude as print sent-timeout. A send should finish in seconds. |

A job is claimed in one `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)` that also sets `RUNNING`, `lastAttemptAt`, and increments `attemptCount`. Overlapping passes cannot execute the same row.

Stranded `RUNNING` rows are returned to `FAILED` with backoff. Attempt count is **not** incremented again on recovery — the claim already counted that attempt.

Raw SQL timestamps are compared as UTC (`timestamptz AT TIME ZONE 'UTC'`) so a Windows session in IST cannot treat a future `runAfter` as due.

Shutdown clears the interval and waits up to 10s for in-flight passes. A hard kill is recovered by the stranded timeout.

---

## Retry schedule

Base **30s**, doubling, capped at 16× (same shape as print):

| After attempt | Delay until next run |
|---|---|
| 1 | 30s |
| 2 | 60s |
| 3 | 120s |
| 4 | 240s |
| 5 | 480s (then dead at the default ceiling of 5) |

Observed in tests with base 1000ms: **1000ms** then **2000ms**. The production schedule is the table above.

Default `maxAttempts` is 5 (schema default). The 5th failed attempt moves the job to `DEAD`.

---

## Permanent vs transient

**Permanent** (dead on first classified failure; do not burn the retry budget):

- Stored phone is not sendable E.164
- Stored / destination email fails the pragmatic shape check
- Provider 4xx validation (Twilio 21211, 21614, 21408, …; Resend 400/422)
- Order missing from payload
- Missing manager phone **and** email (or both are unsendable placeholders)
- Twilio/Resend not configured when a send is attempted
- Manager alert phone unsubscribed

**Transient** (backoff and retry):

- Network / timeout
- Provider 429 and 5xx
- Transport failure with no permanent code

**Not a failure:**

- No SMS consent → `SUCCEEDED` / `SKIPPED_NO_CONSENT`
- Suppressed number → `SUCCEEDED` / `SKIPPED_SUPPRESSED`
- Twilio 21610 (unsubscribed) on a customer send → record suppression, `SKIPPED_SUPPRESSED`
- Volume cap → `SUCCEEDED` / `SKIPPED_VOLUME_CAP`
- `EMAIL_ORDER_READY` in v1 → `SUCCEEDED` / `SKIPPED_NOT_IN_V1` (type is registered; never enqueued)

Provider message id is written as soon as the send returns. A retry that finds an id already on the row skips the send and marks `SUCCEEDED` (at-least-once; the claim is the duplication guard).

---

## Recursion guard (Phase 3.3)

A job whose type is already a manager alert (`ALERT_MANAGER_*`) that dies is logged (`jobs.manager_alert_dead`) and **does not** enqueue `ALERT_MANAGER_JOB_DEAD`. Otherwise a down SMS channel would generate an unbounded chain of alerts about alerts.

These silent dead alerts are the number that must be impossible to miss on the queue report.

---

## Alert volume (Phase 7.4)

At most **one delivered** (`result = SENT`) manager alert **per type per 15 minutes**. Further jobs of that type in the window complete as `SKIPPED_VOLUME_CAP`. A printer off at the wall does not text the manager forty times.

---

## Messages the system sends

All transactional. No marketing, no promo, no “come back soon.” Adding promotional content would require separate consent and a separate A2P campaign.

| Trigger | Channel | Content (realistic order HC-042) |
|---|---|---|
| Payment succeeds (Sprint 4 enqueue) | SMS | `Harold's Chicken Oak Lawn: order HC-042 is confirmed. Ready around 5:20 PM.` |
| Kitchen marks READY (same txn as the transition) | SMS | `Order HC-042 is ready for pickup.` |
| Payment succeeds (Sprint 4 enqueue) | Email | Receipt: store name/address, pickup at the counter, lines + modifiers + notes, subtotal/tax/tip/total from **stored cents**. HTML + plain text. Lookup token is **not** in the body. |
| Print job exhausts retries | SMS and/or email to manager dest | Order number, ticket target, printer serial, last error, reprint. |
| Paid order unacknowledged | SMS and/or email | Order number, reason, open the kitchen display. |
| Background job reaches DEAD (non-alert types only) | SMS and/or email | Dead job type, last error, inspect/retry the queue. |
| Reconciliation payment discrepancy | SMS and/or email | Order id, kind, Square vs order cents, do not auto-fix. |

`EMAIL_ORDER_READY` is declared (Sprint 1) and has a no-op handler so the registry is complete. v1 does not enqueue it. Customer-ready is SMS only.

Times in customer copy use `StoreConfig.timezone` (`America/Chicago`). Money uses `formatCents` from `@harolds/pricing`.

---

## Email receipt vs stored figures (fixture)

Stored: subtotal **6597**, tax **666**, tip **800**, total **8063** ($65.97 / $6.66 / $8.00 / $80.63).

Plain-text receipt (abridged):

```
Harold's Chicken Oak Lawn
4709 W 95th St
Oak Lawn, IL 60453-2515

Receipt for order HC-042
Pickup at the counter. Give them your order number.
Estimated ready: Sat, Aug 15, 5:20 PM

Items
  2× 6pc Dark (Mild sauce, White bread, Extra fries)  $25.98
    Note: No gizzards
  1× 10pc Mixed (Hot sauce, Fried hard)  $18.99
  3× Wing dings (Lemon pepper, Ranch)  $21.00
    Note: Well done

Subtotal  $65.97
Tax       $6.66
Tip       $8.00
Total     $80.63
```

---

## READY enqueue

`applyOrderTransition` wraps status update, status event, and `SMS_ORDER_READY` insert in **one transaction** when `to === READY`. A test hook `afterWork` that throws rolls the status back to `IN_PROGRESS` and leaves no ready job. Transition **rules** are unchanged from Sprint 6.

---

## Consent, suppression, opt-out

- Customer SMS checks `order.smsConsent` immediately before send. No consent → complete, not fail.
- `SmsSuppression` is keyed on E.164 and checked on every customer send.
- `POST /api/v1/webhooks/twilio` verifies `X-Twilio-Signature` then records `MessageSid` idempotently. STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT → opt-out. START/YES/UNSTOP → opt-in.
- Opt-out then opt-in restores sending.

---

## A2P 10DLC and email domain

**A2P 10DLC brand and campaign registration: not started / unknown.** Twilio account SID, auth token, and from-number are unset in this environment. Live SMS to US mobiles is **blocked**. Carrier filtering of an unregistered campaign looks like “send succeeded, customer got nothing” — check registration before debugging the worker.

**Sending domain: not verified.** `EMAIL_API_KEY` / `EMAIL_FROM_ADDRESS` unset. Live email is **blocked**.

Production email must use a verified Resend domain with SPF, DKIM, and DMARC on the store’s DNS. An unverified from-address lands in spam or is rejected.

---

## Manager destinations

Seeded placeholders (not sendable):

- Phone: `TODO: SET MANAGER ALERT PHONE`
- Email: `todo-manager-alerts@localhost`

Alert jobs with these values are **permanent failures**. Replace both before a live shift.

---

## Deviations from the prompt

1. **`EMAIL_ORDER_READY` is registered but not enqueued in v1.** Sprint 1 declared it; the prompt’s customer-ready channel is SMS. A silent unhandled type is worse than a documented no-op.
2. **Twilio/Resend env vars stay optional** so the app and the test suite start without accounts. Unconfigured sends are permanent failures, recoverable with bulk retry after credentials exist.
3. **`JobStatus.CANCELLED`** added so operator cancel is not overloaded onto `DEAD`.
4. **Claim SQL uses UTC-normalized timestamps** so IST/Windows session TZ cannot treat a future `runAfter` as due.
5. **`testPrefix` on claim/recover** is test-only isolation so the suite cannot complete real unsent Sprint 4–6 jobs with fake providers.
6. **Live Phase 4/5/10.5 delivery gates are blocked**, not simulated.
7. **Android audio gate blocked**, not claimed from desktop.
8. **Status link omitted** from the receipt so the lookup token cannot be forwarded as bare text.

---

## Outstanding business inputs

1. **Manager alert phone and email** (seeded placeholders; alerts undeliverable until set) — top of this list on purpose.
2. **Twilio account, sending number, A2P 10DLC brand + campaign registration** — launch blocker for customer SMS.
3. **Resend API key and verified sending domain** (SPF/DKIM/DMARC on production DNS).
4. Change seeded staff PINs (`2468` / `1357`) before a live shift.
5. Confirm kitchen alert **sound on Android Chrome** (Swan or any Android tablet).
6. Production Square credentials (sandbox only now).
7. Exact store contact phone.
8. Exact per-day hours.
9. Featured / most-ordered curation.
10. Tip presets unsigned.

---

## Packages added

- `@harolds/sms` — only import site of `twilio`
- `@harolds/email` — only import site of `resend`
- `@harolds/notify` — registry, worker pass, templates, inbound SMS
