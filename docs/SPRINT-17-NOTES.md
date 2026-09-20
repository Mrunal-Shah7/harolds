<!-- SPRINT-17: payment gateway migration (Square -> NMI sandbox), SMS/Twilio removal, and the
     checkout, test-isolation and deployment fixes found while verifying both. One chat, one
     sprint. The SMS work was briefly labelled "Sprint 18"; it was folded in here and every
     SPRINT-18 tag in the code was retagged SPRINT-17. -->

# Sprint 17 — Payment gateway migration (Square → NMI) and SMS removal

**Code complete and verified locally. NMI is sandbox only. Real webhook delivery, live
credentials, and production health after the redeploy are not verified — see §15.**

Environment, stated once: a Windows development machine, local PostgreSQL, the NMI **sandbox**
(`sandbox.nmi.com`) with real sandbox credentials, and the npm registry unreachable for most of
the sprint. The production VPS was deployed by the operator; the agent had no access to it.

---

## 1. Scope and the decisions that shaped it

The request was to remove Square completely and replace it with NMI. SMS/Twilio removal was a
second request in the same session. Every decision the operator made is recorded here, because
most of the design follows from them.

| Decision | Chosen | Consequence |
|---|---|---|
| Webhook route | Rename to `/api/v1/webhooks/nmi` | Breaking for anything registered against the old URL |
| Health field | Rename `squareEnvironment` → `paymentEnvironment` | Breaking for external monitors keyed on the old name |
| Wallet scaffolding (Apple/Google Pay, Cash App) | Delete, do not port | Checkout is card only |
| Public Collect.js variables | Agent adds `NEXT_PUBLIC_NMI_*` to `.env` | Build refuses without them |
| `customer.smsConsent` in the public API | Keep, optional and ignored | Non-breaking for existing clients |
| SMS tables and columns | Code-only removal, **no migration** | Tables/columns remain, unused |
| Notes layout | One merged Sprint 17 file | `SPRINT-18-NOTES.md` deleted; tags retagged |

---

## 2. NMI has no idempotency key — the charge claim

Square deduplicated on a caller-supplied `idempotencyKey`, so a retry, a double-submit, or two
racing requests collapsed into one charge at Square's end. That single field is why the old
`chargeExistingPending` could call the gateway freely.

**NMI has no equivalent.** Its nearest relative, `dup_seconds`, is rejected by this merchant
account's processor — sending it fails **every** sale:

```
POST /api/transact.php   type=sale ... dup_seconds=300
response=3&responsetext=Overriding Duplicate Threshold is not allowed for this processor&response_code=300
```

It is not sent. There is **no gateway-side duplicate protection at all**.

### What replaced it

Migration `20260915120000_sprint17_nmi_charge_claim` adds `Order.chargeClaimedAt` (plus an
index), and `claimOrderForCharge` takes it with one conditional UPDATE:

```ts
prisma.order.updateMany({
  where: { id, chargeClaimedAt: null, processorPaymentId: null,
           paymentStatus: PENDING, status: AWAITING_PAYMENT },
  data:  { chargeClaimedAt: new Date() },
});
```

PostgreSQL applies it atomically, so exactly one of N racing requests sees `count === 1`, and only
that one may call the gateway. `charge-claim.test.ts` fires five concurrent claims at one order
against a real database and asserts exactly one wins. **Do not rewrite this as a read-then-write.**

Claim lifecycle:

- **Success** → `recordProcessorPaymentId` clears it; the payment id is the stronger guard.
- **Decline** → cleared. No money moved; a retry with another card is safe.
- **Transport failure / UNKNOWN** → **kept.** Money may have moved.

`sweepAbandonedOrders` skips claimed orders (abandoning one could hide a real charge);
`findStrandedChargeClaims` reports them instead.

---

## 3. Recovery from an interrupted charge

A claim can outlive the request that took it. Both halves of the recovery rule are load-bearing.

**The clock decides whether to look.** While a sale is in flight (up to
`GATEWAY_REQUEST_TIMEOUT_MS`, 20 s), NMI has not booked it, so "is there a sale for this order?"
answers *no* — identical to "the request never arrived". A claim younger than
`CHARGE_RECOVERY_AFTER_MS` (timeout + 10 s) is presumed live: no gateway call, no claim mutation.

**The gateway decides what to do.** Once the window has closed, `query.php` is asked by our own
order id (`findPaymentByOrderId`), and `resolveInFlightCharge` branches:

| Gateway says | Action |
|---|---|
| Sale exists, amount matches | Converge: record payment id, allocate number, mark paid |
| Sale exists, amount differs | Never charge, never mark paid; `ALERT_MANAGER_PAYMENT_DISCREPANCY` |
| Sale exists, not complete | Record the id, keep the claim, return ambiguous |
| No sale | Release *this* claim, re-claim, charge |
| Unreachable | **Do not charge.** Fail closed |

### The double-charge hole found in review

The first version released the claim whenever the gateway had no record — which a still-in-flight
sale also produces. A second request would clear the live claim and charge again. Fixed by the
clock rule above **and** by making `releaseChargeClaim(orderId, claimedAt)` match the observed
timestamp exactly, so a caller can only ever clear the claim it saw. `charge-recovery.test.ts`
asserts that a young claim is not even investigated.

---

## 4. The NMI client (`packages/payments`)

`packages/square` became `packages/payments` (`@harolds/payments`) — provider-neutral, matching
the schema's existing vocabulary (`processorPaymentId`, `ProcessorRefund`,
`ProcessorWebhookEvent`). The port-shaped API (`createPayment`, `getPayment`, `refundPayment`,
`getRefund`, `verifyWebhookSignature`) and the outcome types are unchanged, so no caller moved.
New: `findPaymentByOrderId`, `getPaymentEnvironment`, `GATEWAY_REQUEST_TIMEOUT_MS`. No SDK — plain
`fetch` to `transact.php` (form-encoded) and `query.php` (XML, read by a narrow field reader).

- **Errors:** NMI's numeric `response_code` maps to our decline vocabulary. `420/421/430/460` are
  *indeterminate* (may have charged), never a decline. `410/411` are credential problems. A spent
  Collect.js token reads as `ALREADY_USED`, not a card decline. Raw `responsetext` never reaches
  a customer.
- **Money:** cents ↔ `"x.xx"` is string-based in both directions; a float would turn 2015 cents
  into `"20.14"`.
- **Idempotency naming:** `idempotencyKey` became `correlationId` in the package and
  `squarePaymentIdempotencyKey` became `paymentCorrelationId`. A field named "idempotency" on a
  gateway without idempotency would be trusted by the next reader.

### Found by running real sandbox transactions, not by reading docs

1. **Reversal amounts come back negative** (`-12.34`). `fromGatewayAmount` returns the magnitude.
2. **A query by sale id returns the sale *and* its refunds**, each its own `<transaction>`.
   `selectTransaction` matches the requested id instead of taking the first block.
3. **A transaction accumulates actions** (sale, then settle/void). `findAction` selects by
   `action_type`; reading the last action reported a void's amount as the charge.
4. **Sandbox and production hosts are not interchangeable.** `secure.nmi.com` rejects a sandbox
   account ("Sandbox accounts must use a sandbox domain").
5. **`type=refund` works on an unsettled sale**, so refund is the default reversal (it supports
   partial amounts); `void: true` remains an explicit opt-in. `NormalizedPayment.settled` was
   added for a void/refund branch and then removed as unused.

### Two defects fixed in the client

- **A config error was reported as `transport_failure`** — i.e. "may have charged". A missing
  security key threw inside the call's try-block and was relabelled. Credentials now resolve
  first and throw `PaymentClientError`, which every path re-raises untouched.
- **`MoneyError` escaped the package's taxonomy** from the XML amount parse. It is now converted
  to `PaymentClientError` at the parse site.

---

## 5. Checkout: Collect.js and the CSP

`square-payment-form.tsx` became `nmi-payment-form.tsx`. Collect.js mounts three gateway-hosted
iframes (card number, expiry, CVV); only a single-use token reaches the server. `configure()` runs
exactly once, with handlers held in refs, so a tip change cannot tear the fields down.

The CSP swaps every Square host for `secure.nmi.com`, `sandbox.nmi.com` and
`secure.networkmerchants.com` — both gateway hosts, because the header is static and
`NMI_ENVIRONMENT` decides which one is live.

**`https://applepay.cdn-apple.com` is also allowed on `script-src`, and must stay.** Collect.js
injects Apple's SDK in its own constructor, before `configure()` runs, with no flag to suppress it
(confirmed in the served bundle; the tokenization response also shows Apple Pay enabled on the
merchant with no registered domains). Blocking it disables nothing and produces a CSP violation on
every checkout load. The host is `cdn-apple.com` with a hyphen.

---

## 6. Configuration and environment

| Removed | Added |
|---|---|
| `SQUARE_*`, `NEXT_PUBLIC_SQUARE_*`, `SQUARE_WEBHOOK_NOTIFICATION_URL` | `NMI_ENVIRONMENT` |
| `TWILIO_*` | `NMI_{SECURITY,TOKENIZATION,WEBHOOK_SIGNING}_KEY_{SANDBOX,LIVE}` |
| | `NEXT_PUBLIC_NMI_TOKENIZATION_KEY`, `NEXT_PUBLIC_NMI_ENVIRONMENT` |

- **Only the active triple is validated** (`getNmiConfig`, production guards). A sandbox
  deployment does not need invented live keys.
- **The tokenization key is public by design**; the security key is the secret.
- **Log redaction** did not cover `NMI_SECURITY_KEY_*` or the webhook signing key (neither name
  contains `secret` or `token`). Added. Presence booleans (`tokenProvided`) were being redacted
  into uselessness; `*Provided` / `*Present` now join `*Configured` as exempt.
- **`.env` formatting trap:** `KEY= "value"` (space before the quote) reads as *empty* under
  Node's `--env-file` while `dotenv` accepts it, so the build passes and the gateway answers
  "Specified API key not found". The local `.env` was normalised to `KEY="value"`.
- `config/square-public.ts` became `payments-public.ts`; the build still refuses without the
  public identifiers.

---

## 7. SMS and Twilio removed

**What the customer loses:**

| Before | After |
|---|---|
| SMS order confirmation | Email receipt only |
| SMS "your order is ready" | **Nothing — the counter calls** |

`handleEmailOrderReady` was declared in Sprint 1 and never implemented, so the ready text was
the only ready notification. `order-status.test.ts` now asserts that READY enqueues nothing, so a
notification cannot be re-added silently; restoring it means implementing the email handler.

**Manager alerts are email-only.** `managerDestinationProblems(email)` takes one argument, and a
production start is refused without a sendable address. Writing that test exposed a real bug:
the guard only checked non-empty-and-not-placeholder, so a phone number left in
`managerAlertEmail` passed while every alert failed at send. It now applies the same email-shape
check the sender uses.

**Deleted:** `packages/sms` and the `twilio` dependency, `/api/v1/webhooks/twilio`, STOP/HELP
inbound handling, SMS templates, the `sendSms` port, the suppression and inbound DB helpers.

**Kept deliberately:**

- `Order.customerPhone` — the duplicate guard matches on it, and the counter calls customers.
- `smsConsent` / `smsConsentAt` columns and the `SmsSuppression` / `SmsInboundEvent` tables —
  empty and unused (code-only removal).
- The `SMS_ORDER_CONFIRMATION` / `SMS_ORDER_READY` `JobType` values — a PostgreSQL enum with 131
  live rows. Nothing enqueues them; their handlers return `SKIPPED_SMS_REMOVED` so stale rows
  drain instead of crashing the worker.
- `customer.smsConsent` is accepted, validated as a boolean when present, and discarded. OpenAPI
  marks it `deprecated`; the mock API and the handoff script follow the new contract.

**One-time effect at deploy:** dropping `smsConsent` from `canonicaliseOrderPayload` changes every
derived idempotency key once. A customer holding checkout open across the deploy could create a
second order; the server-side duplicate guard (phone + cart signature) still catches it.

---

## 8. Checkout fixes found while testing

**The honeypot blocked real customers.** The anti-card-testing decoy was
`name="company_website"` with a visible "Company website" label. Password managers matched both
tokens and filled it with the user's organisation, and a filled decoy fails *every* attempt with
a generic message. It is now `hx_9f2` with no label. The 3-second minimum-fill check is unchanged.

**Ambiguous-payment copy said "check your texts."** It now says "check your email for a receipt
in a minute, or call the store." A test asserts it contains no "text".

**`PAYMENT_FAILED` carried `details: null`.** The customer sentence is unchanged ("we don't know
yet" is the honest answer), but `details.reason` now names which unknown: `GATEWAY_UNCONFIRMED`,
`CHARGE_IN_PROGRESS`, `RECOVERY_UNAVAILABLE`, `AMOUNT_MISMATCH`, `GATEWAY_SALE_INCOMPLETE`.

**A declined order could replay as a placed one.** NMI returns a `transactionid` on declines too,
and it is kept for traceability, so `claimOrderForCharge` — which checked `processorPaymentId`
before `paymentStatus` — called a declined order `already_charged` and the caller replayed it as a
success. Definite states are now checked first. Regression tests at the claim level and through
checkout.

**A retry after a decline returned `PAYMENT_FAILED`.** It now returns `PAYMENT_DECLINED`, so the
customer is told to try another card rather than to wait.

The operator's `$0.32` test that produced the generic message was **correct behaviour**: the
gateway had no record of that order at all (the request never landed; it took ~11 s), so the
system failed closed. A genuine sub-$1 sandbox decline returns `CARD_DECLINED` with a specific
reason.

---

## 9. Order numbering

**There is no reset job, and none is needed.** The reset is lazy: `resolveBusinessDate(instant,
timezone, resetHour)` picks the business date, and a date with no counter row starts at
`orderNumberStartValue`. Store config: `America/Chicago`, reset hour `5`, start `1`, prefix `HC-`.

**Tests were consuming live order numbers.** The counter is gap-free and never rolls back, so a
test reaching PAID burns a real number even after its order is deleted — which is why numbering
jumped 071 → 112 during the session. `charge-recovery.test.ts` (new) and the pre-existing
`order-number-idempotency.test.ts` now pin the clock to a far-future business date and delete
that throwaway counter row. `finalisePaidOrder` takes `paidAt` from the injected
`ChargeDeps.now` to make that possible. Verified: a full suite run leaves the live counter
untouched. No data was reset — `HC-112` is a real order and re-issuing 072–111 would collide.

---

## 10. Test isolation

| Problem | Fix |
|---|---|
| Manager-alert volume cap is global and time-based; a Sprint 5 print test's leftover `SENT` alert (no test prefix) capped the notify suite for 15 minutes | `worker.test.ts` cleanup clears delivered alerts of the types it exercises |
| `charge-recovery.test.ts` cleanup matched jobs by test prefix, but order ids are cuids | Deletes jobs by the real order ids |
| `charge-claim.test.ts` called `$disconnect()` and a module-level `beforeEach`, reaching across the single-process db suite | Removed |
| A PAID fixture in `charge-claim.test.ts` was swept by the global kitchen-alert count | Uses declined/cancelled fixtures instead |
| `charge-recovery.test.ts` used phone `+17085550918`, which `order-key.test.ts` counts orders for by phone alone; files run in parallel, so it failed about one run in four | Unique phones `+17085550971` / `+17085550972` for the two new files; six consecutive clean runs |

`+17085550916` is still shared by two Sprint 16 files; neither counts by phone alone, so it is
safe as written.

---

## 11. Suite, build, contract

### Suite

| Workspace | Tests |
|---|---|
| `packages/config` | 31 |
| `packages/email` | 4 |
| `packages/payments` | 19 (was `packages/square`, 15) |
| `packages/db` | 128 |
| `packages/notify` | 17 |
| `packages/pricing` | 65 |
| `packages/print` | 25 |
| `apps/web` | 90 |
| `packages/sms` | deleted (was 4) |
| **Total** | **379 pass, 0 fail** |

New files: `payments/money.test.ts` and `errors.test.ts` (rewritten), `config/payments-public.test.ts`,
`db/charge-claim.test.ts` (12), `web/charge-recovery.test.ts` (11).

Typecheck clean in every workspace. `next build` exits 0; the tokenization key and the Collect.js
sandbox host are confirmed inlined in the `/checkout` chunk and no `squarecdn` remains. Lint via
`next build` reports four pre-existing `<img>` warnings and one from this sprint (§15).

### Bundle sizes

Current (operator's production build): `/` 126 kB, `/menu` 127 kB, `/order/[lookupToken]` 121 kB,
`/admin` 123 kB, `/kitchen` 108 kB, `/checkout` 129 kB, shared 102 kB. **No pre-change baseline
was measured this sprint**, and Sprint 16's figures are not one: several commits landed between.

### Contract

`meta.version` is still `1.3.0`, but the contract did change:

- `GET /api/v1/health`: `data.squareEnvironment` → `data.paymentEnvironment` (**breaking**)
- `POST /api/v1/webhooks/square` → `/api/v1/webhooks/nmi` (**breaking**); `/webhooks/twilio` removed
- `CreateOrderRequest.customer.smsConsent`: required → optional, deprecated (non-breaking)
- `PAYMENT_FAILED` / `PAYMENT_DECLINED`: `details` now populated (additive)

OpenAPI, the drift script and the mock API are updated; the drift check passes.

---

## 12. Deployment

What this sprint requires on a server, in order: update `.env` (§6), `pnpm install`,
`pnpm db:generate`, `pnpm db:migrate:deploy` (the charge-claim migration), `pnpm build` *after*
the `.env` change (public keys are inlined), `pm2 restart harolds --update-env`, and a real
`StoreConfig.managerAlertEmail` (production refuses to start otherwise).

Observed on the operator's VPS: install (frozen lockfile), generate, migrate ("no pending
migrations") and build all succeeded. The earlier `SIGINT` log was PM2 stopping the old process,
not a startup crash. **Health after the restart was not confirmed.**

The operator's lockfile regeneration (`changed dotenv version`) removed the orphaned `square@*` and
`twilio@*` entries left by the hand-edited lockfile.

---

## 13. Docs and design updated

`README`, `SECURITY`, `DEPLOYMENT`, `HANDOVER`, `CUTOVER-PLAN`, `API-CONTRACT-HANDOFF`,
`STOREFRONT-REQUIREMENTS`, `LAUNCH-BLOCKERS`, both verification checklists, `ADMIN-OPERATOR-GUIDE`,
`OPERATOR-HANDBOOK`, `PRINT-RUNBOOK`, `KITCHEN-KIOSK-RUNBOOK`, `docs/openapi/v1.yaml` and
`.env.example`. `WALLET-VERIFICATION-CHECKLIST.md` is marked superseded rather than rewritten.
`harolds-design-v1_1.html` mirrors the new card fields, the removed wallet row and consent row,
and the email-only copy. Sprint notes 4–16 are historical and were deliberately left untouched.

---

## 14. Deviations

1. **Two contract renames shipped under `1.3.0`.** The operator approved both renames; a version
   bump was never discussed. External health monitors and webhook registrations must be updated.
2. **Scope grew beyond the gateway swap**, always to fix something found while verifying it: the
   charge-claim migration, log redaction, the honeypot, test isolation, and order-number tests.
3. **Defects introduced during the sprint and fixed before it closed:** the recovery
   double-charge hole (§3), the declined-replayed-as-success bug (§8), the "check your texts"
   copy, the test cleanup leaks, and the phone-number collision (§10).
4. **Two scratch probe files were committed and pushed** (`packages/db/src/__check.ts`,
   `packages/payments/src/__probe.ts`). Neither was imported, so neither ran in the app, but the
   second would create a sandbox sale if executed by hand. Both are now removed with `git rm`.
5. **The SMS work was renumbered from Sprint 18 to 17** at the operator's request. 31 files were
   retagged; `SPRINT-18-NOTES.md` was deleted.
6. **The SMS removal kept its schema** (operator's choice), so dead tables, columns and enum values
   remain by design.

---

## 15. Processes started and terminated, and external side effects

| Started | How it ended |
|---|---|
| `prisma generate`, `prisma migrate deploy` (local DB; applied the charge-claim migration) | Foreground, exited |
| `next build` (several), `tsc --noEmit`, `tsx --test` (many) | Foreground, exited |
| `tsx` probe scripts against the sandbox | Foreground, exited; files deleted (two only now — see §14) |
| `curl` to `sandbox.nmi.com`, `psql` read queries on the local DB | Per request, exited |
| `pnpm install --lockfile-only --offline` | Failed on missing registry metadata; changed nothing |

**No dev server, watcher or background process is running.** The operator ran the dev server.

**Sandbox transactions created by the agent:** `probe-order-1` (sale 12555466030 + refund
12555467031), `probe-order-2` (decline), `probe-order-badtoken` (sale 12555571708, voided),
`probe-decline-0.32`, `probe-decline-0.99`, `probe-decline-code` (declines). Do not reuse those
order ids in tests.

**Local database:** the migration is applied; today's counter sits at 112 (explained in §9); the
operator's `$0.32` order remains `UNKNOWN` with its claim held, deliberately untouched — a retry
releases and charges cleanly. **No production data was touched.**

---

## 16. Not done, and open items

1. **A real NMI webhook delivery.** The `webhook-signature` HMAC (`<timestamp>.<raw body>`) is
   implemented from docs and unverified. The webhook is a backstop, but verify it before relying
   on portal-issued refunds.
2. **`cardLast4` is always null.** `transact.php` does not return `cc_number`; only `query.php`
   does (~1 s, 2.7 s cold). Receipts omit the card line. Recommended: a bounded best-effort fetch
   (~1.5 s timeout). Awaiting a decision.
3. **No "order ready" notification** (§7).
4. **586 dead background jobs**, mostly from a Twilio *trial* account and a self-feeding
   `ALERT_MANAGER_JOB_DEAD` loop. Removing Twilio stops new ones; the backlog is not cleared.
5. **Live NMI credentials are placeholders.** Going live: live key triple,
   `NMI_ENVIRONMENT=production`, rebuild with the production public key, re-register the webhook.
6. **Rotate credentials shared in a chat transcript during deployment:** the Resend API key, the
   database password, and the revoked-but-still-present Twilio and Square tokens.
7. **Production health after the redeploy** is unconfirmed (§12).
8. `webhooks-nmi.ts:125`: unused `eventType` parameter (lint warning).
9. `markOrderPaidAndAllocate`'s comment says it enqueues two print jobs; it enqueues one. Which is
   intended is unresolved (pre-existing).
10. `openapi:validate` expects `info.version` `1.2.0` while the spec says `1.3.0` (pre-existing).
11. The `eslint` CLI fails locally for `apps/web` (`eslint-config-next` vs ESLint 10); lint runs
    fine inside `next build` (pre-existing).
