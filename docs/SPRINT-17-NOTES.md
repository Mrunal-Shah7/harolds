# Sprint 17 — Payment Gateway Migration: Square → NMI (Sandbox)

Square is gone. Every payment, refund, and webhook now goes through NMI. This note records what
changed, and — more usefully — the three places where NMI does **not** behave like Square and the
code had to be designed around it rather than translated.

Status: **sandbox only.** The live NMI credentials in `.env` are placeholders. Nothing here has
taken a real card.

---

## 1. The thing that actually mattered: NMI has no idempotency key

Square deduplicated on a caller-supplied `idempotencyKey`. That one field is why the old
`chargeExistingPending` could call the gateway freely — a retry, a double-submit, or two racing
requests collapsed into one charge at Square's end.

**NMI has no equivalent field.** Its nearest relative is `dup_seconds`, a per-request override of
the account's duplicate-detection window, and it is unusable here:

```
POST /api/transact.php   type=sale ... dup_seconds=300
response=3&responsetext=Overriding Duplicate Threshold is not allowed for this processor&response_code=300
```

That is this merchant account's processor refusing the parameter outright. Sending it fails
**every** sale. So it is not sent, and there is **no gateway-side duplicate protection at all**.

### What replaced it

A new column, `Order.chargeClaimedAt`, and one conditional UPDATE:

```ts
prisma.order.updateMany({
  where: { id, chargeClaimedAt: null, processorPaymentId: null,
           paymentStatus: PENDING, status: AWAITING_PAYMENT },
  data:  { chargeClaimedAt: new Date() },
});
```

`updateMany` compiles to a single `UPDATE ... WHERE ...`, which PostgreSQL applies atomically, so
exactly one of N racing requests sees `count === 1`. Only that one may call the gateway.
`packages/db/src/charge-claim.test.ts` fires five concurrent claims at one order against a real
database and asserts that exactly one wins.

**Do not replace this with a read-then-write.** The gap between the read and the write is the race.

### Recovery: the clock decides whether to LOOK, the gateway decides what to DO

A claim can outlive the request that took it (crash, killed process). Both halves of this are
load-bearing, and getting either one alone wrong is a double charge.

**The clock half.** While a sale is genuinely in flight — up to `GATEWAY_REQUEST_TIMEOUT_MS` —
the gateway has not booked it yet, so asking "is there a sale for this order?" returns *no*: the
exact same answer it gives when the request never arrived. A second request that acts on that
would release a live claim and charge again. So a claim younger than
`CHARGE_RECOVERY_AFTER_MS` (the gateway timeout plus margin) is presumed live and is not
investigated at all — no gateway call, no claim mutation, just the ambiguous-payment message.

Belt and braces: `releaseChargeClaim(orderId, claimedAt)` matches the timestamp **exactly**, so a
caller can only ever clear the claim it actually observed — never one taken in between.

**The gateway half.** Once the window has closed, elapsed time stops being evidence and the
gateway is the only authority on whether money moved. `query.php` accepts our own order id:

```
POST /api/query.php   order_id=<our order id>
```

So `resolveInFlightCharge` asks, and branches on the answer:

| Gateway says | Action |
|---|---|
| Sale exists, amount matches | Converge — record the payment id, allocate the number, mark paid. Not an error; a real recovery. |
| Sale exists, amount differs | Never charge, never mark paid. Raise `ALERT_MANAGER_PAYMENT_DISCREPANCY`. |
| Sale exists, not complete | Record the payment id for reconciliation, keep the claim, return ambiguous. |
| No sale | The previous attempt never reached NMI. Release *this* claim, re-claim, charge. |
| Unreachable | **Do not charge.** Return the ambiguous-payment message. Fail closed. |

Claim lifecycle, which is easy to get backwards:

- **Success** → `recordProcessorPaymentId` clears it (the payment id is the stronger guard).
- **Decline** → cleared. A decline is definite; no money moved; a retry is safe.
- **Transport failure / UNKNOWN** → **kept**. Money may have moved. Releasing here re-opens the
  order to a second sale for the same money. This is the whole point of the design.

`sweepAbandonedOrders` now skips claimed orders — writing one off as abandoned would hide a real
charge. `findStrandedChargeClaims` surfaces them instead.

---

## 2. Three bugs the sandbox caught that reading the docs would not have

All three were found by running real transactions against `sandbox.nmi.com` and comparing the
responses to what the code assumed.

**Refund amounts come back negative.** NMI reports a reversal's action amount as `-12.34`,
signed against the merchant's balance. The first parser rejected it as malformed; a laxer one
would have written a negative `refundedCents`. `fromGatewayAmount` now returns the **magnitude** —
the direction is already carried by the operation.

**A query by a sale id returns the sale *and* its refunds.** Each reversal is its own
`<transaction>` block with its own id. Taking the first block is not reliably the sale, so
`selectTransaction` matches on the id that was asked for.

**A transaction accumulates actions over its life.** A sale block gains `settle`, `void`, etc.
Reading the *last* action reports a void's amount as the amount charged — and that value is what
the webhook path compares against the order total to detect tampering. `findAction` selects by
`action_type`, not by position. Verified: after voiding a probe sale, `getPayment` still reports
the original `1234`, with status `canceled`.

Also confirmed empirically, against the docs' ambiguity:

- **Sandbox and production hosts are not interchangeable.** `secure.nmi.com` rejects a sandbox
  account with *"Sandbox accounts must use a sandbox domain"*. Sandbox is `sandbox.nmi.com`.
- **`type=refund` works on an unsettled (`pendingsettlement`) sale**, not just a settled one. So
  refund is the default reversal for both, and it supports partial amounts. `void` remains
  available as an explicit `void: true` opt-in.

---

## 3. What changed, file by file

| Before | After |
|---|---|
| `packages/square` (`@harolds/square`) | `packages/payments` (`@harolds/payments`) — provider-neutral name, same port-shaped API |
| `square` npm SDK | no SDK; `fetch` to `transact.php` / `query.php` |
| Square Web Payments SDK | NMI Collect.js (`nmi-payment-form.tsx`) |
| `POST /api/v1/webhooks/square` | `POST /api/v1/webhooks/nmi` |
| `health.data.squareEnvironment` | `health.data.paymentEnvironment` |
| `SQUARE_*` env vars | `NMI_ENVIRONMENT` + sandbox/live key triples |
| `ORPHAN_SQUARE_PAYMENT`, `squareAmountCents` | `ORPHAN_GATEWAY_PAYMENT`, `gatewayAmountCents` |

The public API of the payments package is unchanged in shape — `createPayment`, `getPayment`,
`refundPayment`, `getRefund`, `verifyWebhookSignature`, plus the new `findPaymentByOrderId`.
`PaymentOutcome` / `RefundOutcome` / `NormalizedPayment` are byte-for-byte the same contract, so
no caller outside the package moved. **No Prisma migration was needed for the rename** — the
schema was already provider-neutral (`processorPaymentId`, `ProcessorRefund`,
`ProcessorWebhookEvent`). The one migration adds `chargeClaimedAt`.

### Deliberate deletions

- **Wallet scaffolding** (Apple Pay / Google Pay / Cash App) is gone, not ported. It was disabled
  behind `WALLETS_ENABLED = false` and its justification — "correct and waiting on domain
  registration" — was Square-specific. NMI does wallets through a separate setup.
- **`SQUARE_WEBHOOK_NOTIFICATION_URL`** has no successor. Square signed the notification URL along
  with the body; NMI signs `<timestamp>.<raw body>` only, so no URL variable is needed.
- **`NormalizedPayment.settled`** was added for a void/refund branch, then removed once refund
  proved to work on unsettled sales. An unused field on a money type invites someone to branch on
  it without re-verifying the behaviour.

### Two fixes that were not strictly part of the migration

- **`MoneyError` escaped the package's taxonomy.** An unparseable action amount threw from
  `fromGatewayAmount` outside the try that wraps the HTTP call, so a caller catching
  `PaymentClientError` got an unclassified throw. It is now converted at the parse site.
- **A config error was being reported as `transport_failure`.** A missing security key threw out
  of `getNmiConfig()` inside the call site's try-block, and the catch relabelled it "could not
  reach the processor" — which means *may have charged*. A config typo would have told customers
  their payment was unconfirmed and stranded orders in reconciliation. Credentials now resolve
  ahead of the request and throw `PaymentClientError`, which every path re-raises untouched.
- **`NMI_SECURITY_KEY_*` was not redacted in logs.** The redaction patterns matched `secret` and
  `token`, neither of which appears in that name. Added, along with `signing_key`. Separately,
  presence booleans (`tokenProvided`) were being redacted into uselessness; `*Provided` /
  `*Present` now join `*Configured` as exempt.

---

## 4. Operating it

`.env` holds both credential triples side by side. `NMI_ENVIRONMENT` selects which is read, and
**only the active triple is validated** — a sandbox deployment does not need invented live keys.

```
NMI_ENVIRONMENT=sandbox
NMI_SECURITY_KEY_SANDBOX / NMI_TOKENIZATION_KEY_SANDBOX / NMI_WEBHOOK_SIGNING_KEY_SANDBOX
NEXT_PUBLIC_NMI_TOKENIZATION_KEY   # inlined at BUILD time — Collect.js runs in the browser
NEXT_PUBLIC_NMI_ENVIRONMENT
```

The tokenization key is **public by design**. The security key is the secret.

> **`.env` formatting bites.** Values pasted as `KEY= "abc"` (a space before the quote) are read
> as **empty** by Node's `--env-file` parser, while `dotenv` accepts them — so the build passes
> and the gateway returns an opaque *"Specified API key not found"*. The file has been normalised
> to `KEY="value"`. Keep it that way.

**Webhooks:** register `https://<domain>/api/v1/webhooks/nmi` in the NMI Control Panel. Because
the sale's outcome is now known synchronously at checkout, the webhook is a **backstop** — it
catches orders whose HTTP response was lost, and it is the only route for reversals issued from
the NMI portal.

**Sandbox testing:** any amount ≥ `$1.00` approves, anything below declines. That is how decline
paths are exercised; there is no "declined card number". Test cards are in
`packages/payments/src/test-cards.ts`.

---

## 5. Verification

| Check | Result |
|---|---|
| Typecheck, all packages | Pass |
| `packages/db` (incl. 11 new charge-claim tests) | 128 pass |
| `apps/web` (incl. 7 new charge-recovery tests) | 86 pass |
| `next build` | Succeeds; `NEXT_PUBLIC_NMI_TOKENIZATION_KEY` and the Collect.js host verified inlined in the checkout client chunk, no `squarecdn` left in the bundle |
| `payments` / `config` / `notify` / `pricing` / `print` | 19 / 28 / 22 / 65 / 25 pass |
| OpenAPI drift | Pass |
| Live sandbox: `getPayment`, `getRefund`, `findPaymentByOrderId`, void | Correct against real transactions |

### Not yet verified — do this before going live

1. **A real Collect.js token through `createPayment`.** Everything server-side is exercised and
   the key is confirmed inlined in the built bundle, but tokenisation itself needs a browser.
   Run the checkout in a browser against the sandbox.
2. **A real NMI webhook delivery.** The signature scheme (`webhook-signature: t=…,s=…`, HMAC-SHA256
   over `<timestamp>.<body>`) is implemented from the docs and has not been checked against an
   actual delivery. Verify before relying on the backstop.
3. **`pnpm install`.** The lockfile importers were hand-edited (the registry was unreachable);
   orphaned `square@*` entries remain and will be pruned on the next install.
4. **Sandbox leftovers.** Probe transactions exist under order ids `probe-order-1`,
   `probe-order-2`, `probe-order-badtoken`. Harmless, but do not reuse those ids in tests.

### Pre-existing, untouched

`pnpm --filter @harolds/web openapi:validate` fails on `Expected info.version "1.2.0", got 1.3.0`.
The spec and the validator disagreed before this sprint; which one is wrong is a contract-version
decision, so it was left alone. The drift check, which is the one that would have caught the
webhook rename, passes.
