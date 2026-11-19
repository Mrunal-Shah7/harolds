<!-- SPRINT-16: payment integrity remediation. Agent phases 1-8. Phases 9 and 10 are the
     operator's and were not attempted — see docs/SPRINT-16-OPERATOR.md. -->

# Sprint 16 — Payment integrity remediation

**Agent phases 1–8 complete. Phases 9 and 10 not attempted — they are the operator's.**

Backend and payment-path only. Environment: local Postgres, Square **sandbox**, no production
access. Every phase here was executable and every gate was reached.

---

## 1. Phase 1 — the reproduction, written first

`apps/web/src/lib/payment-integrity.test.ts`. Per Critical rule 7 this was written and run
**before** any fix. Node's runner has no "expect this to fail", so the suite asserts the
**defective** behaviour and its PASS is the evidence:

```
▶ SPRINT-16 Phase 1 reproduction: the reachable double charge
  ✔ a reload after PAYMENT_FAILED mints a new key, matches nothing, and yields a second chargeable order
  ✔ the cart survives a reload but the idempotency key does not — the asymmetry that causes it
▶ SPRINT-16 Phase 1: a deliberately changed cart must still create a new order
  ✔ changing a modifier changes the fingerprint
  ✔ changing the tip changes the fingerprint
  ✔ a changed cart creates a genuinely separate order
ℹ tests 5  ℹ pass 5  ℹ fail 0
```

The load-bearing assertion:

```
assert.equal(orders.length, 2, "DEFECT REPRODUCED: one cart produced two chargeable orders");
```

and, alongside it, that `squarePaymentIdempotencyKey(second.id) !== squarePaymentIdempotencyKey(first.id)`
— so Square cannot collapse them either. The charge is genuinely reachable, not theoretical.

---

## 2. Phase 2 — the derived key

### Why the naive fix was rejected

Persisting the minted key to `localStorage` beside the cart would close the reload case and open
a worse one: a persisted key with a **changed** payload makes `findOrderByIdempotencyKey` match an
order whose items, modifiers or tip no longer reflect what the customer just approved, and
checkout replays that older order — charging them for a cart they had already edited away from.

### What shipped

`apps/web/src/lib/order-key.ts`:

```
key = hash(sessionNonce, canonicalisedOrderPayload)
```

- **Session nonce** — minted once, persisted beside the cart in `localStorage`, cleared when an
  order succeeds (`clear()`) and when the cart empties by any route.
- **Canonical payload** — lines sorted by full line identity, `selectedOptionIds` sorted within
  each line, notes trimmed, email lower-cased, tip normalised per variant, and a fixed key order
  written out rather than relying on object-literal ordering.
- **SHA-256 via WebCrypto**, which exists in the browser and in Node, so client and server derive
  identically from one implementation.

Both properties fall out at once: an identical payload derives an identical key, so the existing
order is returned; any content change derives a different key, so a new order is created.

### What the client key actually covers — and what it does not

Worth stating precisely, because the layering is load-bearing rather than belt-and-braces.

The cart and the nonce survive a reload in `localStorage`. **The contact fields do not** — they
are `useState("")` on the checkout form, so the customer retypes them. The key therefore only
reproduces if the retyped values normalise to the same thing, which is why the canonicaliser now
strips non-digits from the phone and lower-cases the names and email:
`(708) 555-1234` and `7085551234` are one customer to the server (`normalizePhoneToE164`) and must
be one key here. That is tested with a realistic retype, not by hashing the same object twice.

Even so:

- **The client key reliably closes the same-tab retry** — the customer taps Pay again without
  reloading, where every input is still in memory.
- **The reload and cross-device cases are closed by the Phase 4 guard**, which matches on the
  server-normalised phone and the server-computed `cartFingerprint` and deliberately ignores the
  contact fields entirely.

So the guard is doing the real work on the exact scenario this sprint is named for. The client key
is the cheap first line; it is not the guarantee, and it was never sufficient alone.

### The regression this nearly introduced, and the fix for it

A stable key traps a **declined** customer. `checkoutOrder`'s replay block returns the cached
`PAYMENT_DECLINED` when it finds an existing order with `paymentStatus = FAILED`, so a customer
retrying with a different card would have received the same decline forever, on a dead order they
could never pay.

Resolved by rotating the session nonce on a **definite decline only** —
`rotateSessionNonce()` in `cart-context.tsx`, called in the `PAYMENT_DECLINED` branch and nowhere
else. A decline is definite: the processor confirmed no money moved, so a fresh order is harmless,
and this restores exactly the pre-Sprint-16 behaviour on that path. The nonce is **never** rotated
on the ambiguous `PAYMENT_FAILED` path, which is the case the stable key exists to protect.

### `cartFingerprint` made order-independent

`checkout.ts` previously sorted `selectedOptionIds` within a line but left the **lines** in client
order, so the same cart built A-then-B fingerprinted differently from B-then-A. Harmless for its
only prior consumer (equality-based conflict detection) and fatal for the Phase 4 guard, which has
to recognise the same cart arriving twice. Now sorted. Verified that nothing depends on the old
behaviour: the value is written once and only ever compared for equality.

---

## 3. Phase 3 — the lockout deadline

`apps/web/src/lib/retry-lockout.ts`. `lockoutSeconds` state replaced by an absolute
`lockoutUntil` in `sessionStorage`, with the remaining seconds derived on mount and on every tick.

Clamping rules, all tested: an expired, absent, `NaN` or `Infinity` deadline yields `0` rather
than a negative countdown; the result is capped at the configured duration, so a manipulated clock
or an edited storage value cannot extend the lockout.

**This is defence in depth, not the guarantee.** A cleared browser, a second tab, or another
device defeats it entirely. The guarantee is Phase 4.

---

## 4. Phase 4 — the server-side guard

`createPendingOrderGuarded` in `packages/db/src/repositories/orders.ts`, called from
`checkoutOrder` in place of `createPendingOrder`.

Before creating an order it looks for one with the same **contact phone**, the same
**server-computed `cartFingerprint`**, created inside the window, and in a matchable payment
state. If found, it returns that order instead of creating a second.

### Matchable and excluded states, with reasons

| State | Matchable | Why |
|---|---|---|
| `UNKNOWN` | **yes** | Money may have moved and we do not know. The case worth collapsing |
| `PENDING` | **yes** | In flight |
| `CAPTURED` | **yes** | Already paid — show them the order they already have |
| `FAILED` | **no** | A decline is definite. Collapsing a retry onto it replays the cached decline and traps the customer on an unpayable order |
| Cancelled | **no** | Terminal |
| Refunded (`refundedCents > 0`) | **no** | Terminal |

### Concurrency

The lookup and the insert run in **one transaction** behind `pg_advisory_xact_lock(int4, int4)`,
keyed on a SHA-256 of `phone|cartFingerprint`. The lock releases with the transaction. Proven:

```
✔ TWO CONCURRENT IDENTICAL REQUESTS PRODUCE EXACTLY ONE ORDER (174ms)
```

Two `createPendingOrderGuarded` calls fired with `Promise.all` and different idempotency keys
resolve to `["created", "existing"]`, the same order id, and exactly one row.

### No migration was needed

The guard's lookup filters on `customerPhone`, which already carries `@@index([customerPhone])`.
A single phone has few orders, so the additional `cartFingerprint` and `createdAt` predicates
narrow an already-small set. **The one index the prompt pre-authorised was not required and was
not added.** No migration is part of this sprint.

### Logging

Every hit logs one JSON line, `event: "checkout.duplicate_guard_hit"`, carrying the matched order
id and number, `matchedAgeMs`, the matched payment status, the phone, the cart fingerprint, and
the configured window. A legitimate repeat order collapsed by the guard lands here too, which is
the point: the false-positive rate is observable rather than assumed.

### Configuration

`ORDER_DUPLICATE_GUARD_WINDOW_SECONDS`, optional, default **180**, read via
`getOrderDuplicateGuardWindowMs()` in `@harolds/config`. Optional with a default so no existing
deployment breaks.

---

## 5. Phase 5 — the failure copy

**The classification can distinguish, cleanly**, and this was verified rather than assumed
(`packages/square/src/client.ts:103-104`, `errors.ts:93-191`):

| Square outcome | Meaning | API code |
|---|---|---|
| `declined` | A **definite** pre-capture decline. No money moved | `PAYMENT_DECLINED` |
| `transport_failure` (timeout, 5xx, unusable response) | The outcome is **unknown** — routed through `markOrderPaymentUnknown` | `PAYMENT_FAILED` |

So `PAYMENT_FAILED` is emitted on the ambiguous class and **only** the ambiguous class. The old
copy — "Nothing has been charged" — asserted the one thing the system cannot know, on the one path
where it is least likely to be true, and it is the sentence most likely to cause the second
attempt. It was wrong on 100% of the path it rendered on, not merely sometimes.

Final wording, now a single exported constant `AMBIGUOUS_PAYMENT_MESSAGE`:

> We couldn't confirm that payment. Don't try again just yet — check your texts in a minute, or
> call the store.

Applied at **all three emitters**, not just the visible one:

1. `checkout.ts` replay block (`processorPaymentId && paymentStatus === UNKNOWN`) — the one a
   reload actually reaches now that Phase 2 has landed.
2. `checkout.ts` `chargeExistingPending` transport-failure tail.
3. The storefront checkout string.

The confident wording stays on `PAYMENT_DECLINED`, where it is earned. The dev-only
`/design-system` sample was updated too, so the retired sentence survives nowhere.

---

## 6. Phase 6 — the reconciliation script

`packages/db/src/sprint16-reconcile-cli.ts`. Run it with:

```
pnpm reconcile:sprint16 -- --since 2026-08-01 [--window 180] [--out ./sprint16]
```

**Read-only by construction, not by intention.** Every query runs inside a transaction opening
with `SET TRANSACTION READ ONLY`, so Postgres itself rejects any write — including one added by
mistake later. Proven, not asserted:

```
✔ is read-only: a write inside the report transaction is rejected by Postgres
  PostgresError { code: "25006", message: "cannot execute UPDATE in a read-only transaction" }
```

Two reports over one pass, both CSV:

- **`-tips.csv`** — every order since cutover with a non-zero tip, carrying
  `displayed_total_before_sprint14` (total − tip, what the customer saw), `charged_total`, and
  `discrepancy` (exactly the tip), plus phone, email, payment status and processor payment id.
- **`-duplicates.csv`** — orders from one phone with a matching cart signature inside the window,
  with both order numbers, both timestamps, the gap in seconds, both amounts, **both processor
  payment ids** so each pair can be confirmed in Square, and both refunded amounts.

Proven against seeded data containing a known tipped order and a known duplicate pair, and — as
importantly — two innocent pairs it must **not** flag: the same cart from the same phone an hour
apart, and two different carts from one phone twenty seconds apart. Both are correctly ignored.

---

## 7. Phase 7 — the `most-ordered` 500

**Not reproduced. Not fixed. Recorded honestly, with what the operator should check.**

What was established:

1. The local environment now runs: `prisma generate` (Sprint 15 found the client ungenerated),
   Postgres up, 87 menu items, 17 categories seeded.
2. **`getMostOrderedItems` is a bare `findMany` returning `[]`.** It structurally cannot fail on
   an empty curated list, which disproves the prompt's second hypothesis.
3. Locally, `isMostOrdered` is set on **0** items — the exact "empty curated list" condition — and
   the endpoint returns **HTTP 200** with `{"data":{"items":[]}}`.
4. Every other DB-backed route also returns 200: `/api/v1/menu`, `/api/v1/store/status`,
   `/api/v1/menu/featured`, and the `/` and `/menu` pages.

**Leading hypothesis: environmental, not a code defect.** Sprint 15 found `@prisma/client`
ungenerated in this working tree. A server started against an ungenerated client fails on *every*
DB-backed route, which is consistent with the single observation available — one 500, on the one
route that happened to be probed. This is a hypothesis, not a finding: only one route was observed
during Sprint 14, so it cannot be distinguished from a route-specific cause with the evidence that
exists.

**What the operator should check on production** (Phase 9.6): hit `/api/v1/menu/most-ordered`
directly; if it errors, check whether the curated list references a **deactivated or deleted**
item, and check whether other DB-backed routes were erroring at the same time — that distinguishes
an environmental failure from a route-specific one.

**The failure handling is now proven rather than read.** `fetchSection` was extracted from the two
storefront pages (it was duplicated inline) into `apps/web/src/lib/storefront-fetch.ts` and tested
against every failure shape: 500, 404, 429, a thrown network error, a wrong-shaped body, and
unparseable JSON. All return `null`, the section is hidden, and the route renders. A legitimately
empty list (`{items: []}`) is also covered, since that is what the endpoint actually returns today.

---

## 8. Phase 8 — suite, blast radius, contract

### Suite, twice, identical

| Workspace | Tests |
|---|---|
| `packages/config` | 27 |
| `packages/email` | 4 |
| `packages/sms` | 4 |
| `packages/print` | 22 |
| `packages/pricing` | 54 |
| `packages/square` | 15 |
| `packages/db` | 129 (was 127; +2 reconciliation) |
| `packages/notify` | 20 |
| `apps/web` | 68 (was 34; +34 payment-integrity) |
| **Total** | **343 pass, 0 fail** — identical on both runs |

Typecheck and lint clean across every workspace (3 pre-existing warnings in `packages/db`, none
introduced here). Build exit 0. Concurrency accommodation still absent from `.npmrc` and
`pnpm-workspace.yaml`.

### Bundle sizes — one route moved, and it is the right one

| Route | Before | After | |
|---|---|---|---|
| `/` | 126 kB | **126 kB** | identical |
| `/menu` | 126 kB | **126 kB** | identical |
| `/order/[lookupToken]` | 117 kB | **117 kB** | identical |
| `/admin/[[...slug]]` | 118 kB | **118 kB** | identical |
| `/kitchen` | 107 kB | **107 kB** | identical |
| Shared JS | 102 kB | **102 kB** | identical |
| `/checkout` | 123 kB | **124 kB** | **+1 kB** |
| `/design-system` | 2.66 kB route | 5.2 kB route | dev-only, 404s in production — see below |

The `/design-system` figure is a **stale baseline, not a real delta**: 2.66 kB was recorded early
in Sprint 14, before that sprint's own later edits to the showcase (the `sf-root` removal and the
added scopes). Sprint 16 changed one string in it. It is a dev-only route that returns 404 in
production and is excluded from the rule 4 comparison.

**Critical rule 4 as literally written could not pass, and this is a real tension in the prompt,
not an accident.** Rule 4 says the storefront's route bundle sizes are unchanged; Phases 2, 3 and
5 mandate client-side work — a derived key, a persisted lockout deadline, and new copy — all of
which live in the checkout route. `/checkout` therefore grew by 1 kB.

Every other storefront route **is** byte-identical, and that took a deliberate change: importing
`newSessionNonce` from `order-key.ts` into `cart-context.tsx` pulled the canonicaliser into the
home and menu bundles (+1 kB each). The nonce minter is now four lines inline in `cart-context`,
so `order-key.ts` is imported only by checkout. The first build showed `/` and `/menu` at 127 kB;
they are back to 126 kB.

### Contract

`1.3.0`, unchanged. `git diff` against `packages/types/` and `docs/openapi/` is **empty** for this
sprint's changes. No path, field, or error code was added — `PAYMENT_FAILED` and
`PAYMENT_DECLINED` already existed and only their message text changed.

---

## 9. Deviations from the prompt

1. **Rule 4's bundle gate could not be met for `/checkout`.** Explained above. Every other route
   is identical.
2. **The nonce rotation on decline is an addition the prompt did not specify.** Without it, Phase
   2 would have introduced a worse defect than the one it fixes — a declined customer permanently
   unable to retry. Tested.
3. **`cartFingerprint` was changed** to sort lines. The prompt described writing the
   canonicaliser; this extends the existing server-side one rather than adding a second, so there
   is one canonicaliser and one place to be wrong.
4. **`fetchSection` was extracted** from the two storefront pages to make Phase 7's gate testable.
   No behaviour change: it is the same function, previously duplicated inline in both.
5. **No index and no migration were added.** The prompt pre-authorised one index if the guard
   required it. It does not — `@@index([customerPhone])` already covers the lookup.
6. **Phase 7's 500 was not reproduced**, so nothing was fixed. Reported as unreproducible with a
   named next step, per the prompt's own instruction.
7. **Phase 2's gate says "Phase 1's first test now passes".** It does pass — but because it
   simulates the pre-Sprint-16 client (`legacyMintedKey()`) and inserts orders directly, so it
   never touches the fixed path. It is a **frozen record of the defect**, deliberately left
   asserting `orders.length === 2`, and its header says so in capitals so no future reader mistakes
   it for a live double charge. The inversion against the real derivation lives in
   `order-key.test.ts`, and the server-side guarantee in `duplicate-guard.test.ts`. This is a
   deviation from the gate's literal wording, taken because a frozen reproduction is better
   evidence than one edited to pass.
8. **The lockout deadline is cleared on a successful order.** Not specified by the prompt, but
   without it a customer who hit an ambiguous outcome, waited, paid, then started a new cart in
   the same tab would arrive at checkout with a live countdown belonging to a completed order.

---

## 10. Development processes started and terminated

| Started | How it was stopped |
|---|---|
| `pnpm --filter @harolds/web dev` (background, Phase 7 endpoint probe) | `Stop-Process -Id 12520 -Force` after identifying it via `Get-NetTCPConnection -LocalPort 3000`. Confirmed down: `curl` returns `000`, and `Get-CimInstance Win32_Process` shows no remaining `node.exe` running `next` |
| `pnpm --filter @harolds/db generate` | Foreground, exited |
| `pnpm -r typecheck` / `lint` / `test` / `build` (multiple) | Foreground, exited |
| `npx tsx --test` runs (per-file, multiple) | Foreground, exited |
| `curl` probes to localhost | Per-request, exited |

**No dev server, watcher, database console, or browser is running.** The Prisma client generated
in Phase 7 is a build artefact, not a process.

**No production service was touched.** Nothing was deployed. Nothing queried production —
Critical rule 8 holds: the reconciliation script was written here and is run by the operator.

---

## 11. Not attempted

**Phases 9 and 10 were not attempted, not simulated, and are not reported as passed.** They
require production access, real money, and a real card. See `docs/SPRINT-16-OPERATOR.md`.
