# 02. Checkout and payments

_2026-11-19. Made from the code and the earlier sprint notes in [../reference/](../reference/) (Sprints 4, 16–19).
Not yet walked by checklist. Marks: see [README.md](README.md)._

## Planned changes

| Change | Kind | What will change | Triage | State |
|---|---|---|---|---|
| — | | None yet | | |

## What it is for

Turns a cart into a paid pickup order: reprices it on the server, takes the payment through NMI (via the reseller
Merchant Pay Connect) and makes sure one checkout never becomes two orders or two charges.

## Who uses it, and where

- **People:** guests [code]
- **Screens or routes:** `/checkout` (`apps/web/src/app/(storefront)/checkout/page.tsx`) [code]
- **Backend:** `POST /api/v1/quote`, `POST /api/v1/orders`, `POST /api/v1/webhooks/nmi` [code]
- **Code:** `apps/web/src/lib/checkout.ts`, `checkout-validation.ts`, `billing-zip.ts`, `order-key.ts`,
  `payment-methods.ts`, `retry-lockout.ts`, `webhooks-nmi.ts`, `components/storefront/nmi-payment-form.tsx`,
  `nmi-checkout-config.tsx`, `payment-method-tabs.tsx`; `packages/pricing/`, `packages/payments/`,
  `packages/db/src/repositories/orders.ts`, `order-numbers.ts`, `payment-attempts.ts`;
  `packages/config/src/payments.ts`, `nmi-gateway.ts` [code]

## How it works

- **Form:** name, email, phone, optional order note, tip, billing ZIP, then the payment method tabs Card | Apple Pay
  | Google Pay. Card fields are NMI Collect.js iframes; the browser gets a token, never the card number. [code]
- **Collect.js setup:** the checkout layout gets the Collect.js URL and the active tokenization key from the server
  on every request; nothing about the gateway is built into the bundle (`.env.example`, Sprint 18.2). [code]
- **Wallets:** Apple Pay and Google Pay tabs show only when `PAYMENTS_APPLE_PAY_ENABLED` /
  `PAYMENTS_GOOGLE_PAY_ENABLED` are exactly `"true"`; they are read at run time, so a change needs a restart, not a
  rebuild. The server refuses a wallet charge whose displayed amount differs from the order total
  (`walletAmountRefusal`, `checkout.ts:667`). [code] Both wallets are on in production (owner, 2026-11-19).
  [confirmed] Since Sprint 19, production has 48 approved Apple Pay, 13 Google Pay and 28 card sales (read-only
  query, 2026-11-19). [observed]
- **Quote:** `POST /api/v1/quote` runs the pure pricing engine (`packages/pricing/src/quote.ts`): validate lines and
  modifiers, price lines, subtotal → tax once → tip → total, integer cents with one half-up rounding point. [code]
- **Place order** (`checkoutOrder`, `checkout.ts:418`):
  1. Parse the body; any client-supplied price field is refused (`PRICE_FIELD_FORBIDDEN`). [code]
  2. Look up the idempotency key. Same key, different cart fingerprint → `IDEMPOTENCY_CONFLICT`; same key, same
     cart → the existing order is returned, never charged twice. [code]
  3. Reprice from the database; sold-out → `ITEM_UNAVAILABLE`; closed → `STORE_CLOSED`; switch off →
     `STORE_NOT_ACCEPTING_ORDERS`. [code]
  4. Server-side duplicate guard: the same cart fingerprint inside the guard window (180 s per the Sprint 19 notes;
     `packages/config/src/checkout-guard.ts`) returns the existing order instead of creating one. [code]
  5. Create the pending order (`AWAITING_PAYMENT`), claim the charge, call the gateway, record a `PaymentAttempt`.
     [code]
  6. On success: record the gateway payment id, allocate the daily order number, mark `PAID`, enqueue a kitchen
     print job and an `EMAIL_ORDER_RECEIPT` job (`repositories/orders.ts:400-440`). [code]
- Seen on 2026-11-19 with a sandbox card: quote $8.79 + tax $0.89 = $9.68; the order was `PAID`/`CAPTURED` with
  number HC-001, one approved `PaymentAttempt`, a queued kitchen print job and a receipt job; the page then moved to
  `/order/<token>` ([run](../runs/2026-11-19-smoke.md), S-05 to S-07). [observed]
- **Webhooks:** `POST /api/v1/webhooks/nmi` verifies the HMAC over `<nonce>.<raw body>` before parsing, then
  converges the order with the gateway's view (`webhooks-nmi.ts`). [code]
- **Data:** `Order`, `OrderLine`, `OrderNumberCounter`, `PaymentAttempt`, `ProcessorWebhookEvent`, `Customer`
  fields on the order. [code]

## Rules it enforces

- Order numbers are allocated after payment, so failed checkouts do not use up a number; unique per business date
  (`order-numbers.ts`, [../reference/HANDOVER.md](../reference/HANDOVER.md)). [code]
- Tax is computed once and stored; reports never recompute it (`packages/pricing/src/totals.ts`). [code]
- An unknown-outcome charge (`PaymentStatus.UNKNOWN`) is never retried automatically. [code]
- After `PAYMENT_FAILED` the retry lockout is a stored deadline, not a countdown (`retry-lockout.ts`). [code]
- Unpaid orders with no gateway payment id are marked `ABANDONED` after `ORDER_ABANDON_AFTER_MINUTES` (default 60);
  orders holding a charge claim are never swept (`packages/db/src/reconcile.ts:135`). [code]
- Rate limits per client per minute: quote 20, orders 8 (`security.ts:23-25`). Public JSON bodies capped at 32 KiB,
  webhooks at 1 MiB. [code]
- `@harolds/payments` is the only package that talks to the gateway; the gateway host is stated once, in
  `packages/config/src/nmi-gateway.ts`. [code]

## Problems found

| # | Problem | Status |
|---|---|---|
| 1 | A pending order created before a price change keeps its old total. A card retry with the same key, or inside the duplicate-guard window, charges that stale total silently; a wallet retry is refused with `WALLET_AMOUNT_MISMATCH`. Found in Sprint 19 ([../reference/SPRINT-19-OUTSTANDING.md](../reference/SPRINT-19-OUTSTANDING.md), "Found and not fixed" 1). | Open, TR-004 |
| 2 | Before Sprint 19, card checkouts sent the billing ZIP, tip and note as they were when the email was last typed (same file, section 0). Production check 2026-11-19: all 6 card sales between the Sprint 18.3 and Sprint 19 deploys came back AVS `0` (no ZIP); none carries a tip; whether a tip was lost cannot be told from the data. | Fixed in Sprint 19; data checked, TR-005 closed |
| 3 | The "Loading the secure payment form…" line depends on `fieldsAvailableCallback`, which never fired in headless Chrome against the sandbox (same file, "Found and not fixed" 5). | Open, watch in real browsers |
| 4 | In the built-in browser the card field said "Connection to tokenization service failed", yet the payment then succeeded ([run](../runs/2026-11-19-smoke.md), S-05). | Open, TR-012 |

## Questions

1. ~~Are the wallet flags on in production?~~ Yes, both (owner, 2026-11-19).
2. Should a stale pending order be repriced or abandoned when the menu changes (problem 1)? [question]
3. Is the tokenization error message in problem 4 seen by real customers, or only in this embedded browser?
   [question]

## How to test it

Checklist: smoke rows S-05 to S-07 in [checklists/00-smoke.md](checklists/00-smoke.md). Test data: NMI sandbox
test cards (`packages/payments/src/test-cards.ts`), customer emails at `@example.test`. Automated:
`packages/pricing/src/*.test.ts`, `packages/payments/src/*.test.ts`, `apps/web/src/lib/checkout-validation.test.ts`,
`charge-recovery.test.ts`, `duplicate-guard.test.ts`, `payment-classification.test.ts`,
`payment-integrity.test.ts`, `payment-methods.test.ts`, `wallet-checkout.test.ts`, `webhooks-nmi.test.ts`,
`order-key.test.ts`, `retry-lockout.test.ts`; `packages/db/src/charge-claim.test.ts`, `order-numbers.test.ts`.

## Not yet checked

Apple Pay and Google Pay on real devices; webhooks from the real gateway (they cannot reach `localhost`); declines
and AVS responses on the production gateway. There is no browser test harness; the payment tabs are tested only
as pure functions (Sprint 19 notes).
