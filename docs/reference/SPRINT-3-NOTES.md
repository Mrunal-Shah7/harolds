# Sprint 3 Notes — Pricing Engine, Cart Validation & Quote

## Rounding rule

**Half-up to the nearest cent**, implemented once in `packages/pricing/src/money.ts` (`halfUpDivide` / `applyBasisPoints`).

For a non-negative product `P` and divisor `V`, the half-up quotient is `floor((P + floor(V/2)) / V)`. Rate application uses `BigInt` for the product `amountCents × rateBps`, then half-up division by `10_000`.

**Why:** matches hand-calculator / register expectation on a single receipt. Banker's rounding is useful in aggregate statistics but surprising when a customer checks one ticket.

Rounding happens **only** when a basis-point rate is applied (tax; percentage tips). Line pricing and subtotal summation use integer cents only — no rounding at line level, because every input is already an integer number of cents.

## Order of operations for totals

A non-programmer can follow this against a receipt:

1. For each line: base price + sum of selected modifier deltas = unit price; unit price × quantity = line total. (All integers.)
2. Subtotal = sum of all line totals. (Integer addition.)
3. Taxable amount = pre-discount subtotal when `taxAppliedPreDiscount` is true (v1 has no discounts, so this equals the subtotal — the flag is still read so discounts later do not break tax).
4. Tax = half-up application of configured tax rate (basis points) to that taxable amount. Round once.
5. Tip:
   - Preset index → configured rate at that index, applied to **subtotal + tax**, half-up once.
   - Custom rate → same, post-tax, half-up once.
   - Fixed amount → taken as given.
   - Absent or explicit zero → tip of 0.
6. Grand total = **subtotal + tax + tip** (addition of the three stored values — never recomputed from a rate independently of the parts).

## Tax-basis flag

`taxAppliedPreDiscount` is honoured despite no discounts in v1 so the arithmetic remains correct when discounts arrive. The engine reads the configuration flag; it does not assume “tax on subtotal” forever.

## Validation vs orderability

| Concern | Phase | Failure mode |
|---|---|---|
| Bad cart / sold-out line / unbound option | 4 validation | `400 VALIDATION_ERROR` with `details.reasons` — no priced result |
| Store closed / not accepting | 7 orderability | `200` with full price + `orderable: false` + `blockingReasons` |

**Example validation:** customer attaches “Add Fries” from gizzards to a mayo packet → `OPTION_NOT_BOUND`.

**Example orderability:** cart is legal at 2 a.m. → priced totals returned, `orderable: false`, `blockingReasons: ["STORE_CLOSED"]`.

Sold-out **items** are Phase 4 validation, not Phase 7 orderability. Store state is Phase 7 only.

## Query count for a ten-line cart

`fetchItemsForQuote` resolves the cart in **2 Prisma queries**:

1. `menuItem.findMany` for the unique item ids  
2. `itemModifierGroup.findMany` (with group + options) for those items  

Store config / status are loaded in parallel with that pair (`Promise.all`), so quote I/O is a small constant, not O(lines).

## Bounds

| Bound | Value | Reasoning |
|---|---:|---|
| `MAX_MONEY_CENTS` | 10_000_000 (~$100k) | Legitimate catering is tens of thousands of cents; millions of cents indicate bug or attack — reject |
| `CART_LIMITS.maxLines` | 30 | Abuse prevention / DoS |
| `CART_LIMITS.maxQuantityPerLine` | 50 | Same |
| `CART_LIMITS.maxTotalItems` | 100 | Same |
| `CART_LIMITS.maxNoteLength` | 200 | Ticket / SMS sanity |
| `CART_LIMITS.maxTipRateBps` | 10_000 (100%) | Mistyped custom tip |
| `CART_LIMITS.maxTipCents` | 50_000 ($500) | Mistyped fixed tip |

## Quote behaviour decisions

- Inactive items and nonexistent items both return `ITEM_NOT_FOUND` with identical reason shape (no existence leak). On multi-problem carts they appear as entries in `details.reasons`; we do **not** promote a lone `ITEM_NOT_FOUND` to top-level `NOT_FOUND` — quote failures are consistently `VALIDATION_ERROR` with reasons. Documented so the storefront need not guess.
- Menu `Cache-Control` changed to `no-cache, must-revalidate` so staff sold-out invalidation is visible on the next request; ETag / 304 still works.
- Mock imports `@harolds/pricing` (`quoteCart` / `parseCartRequest`); there is no second pricing implementation.

## Deviations from the Sprint 3 prompt

1. **Inactive item as HTTP `NOT_FOUND`:** Prompt allowed choosing either a lone `NOT_FOUND` or a reason-list entry. We chose **always** `VALIDATION_ERROR` + reasons for consistency.
2. **`ensure-env`:** Creates `.env` only when missing; when present it exits 0 and leaves the file untouched (never overwrites). README no longer recommends a blind `cp .env.example .env`.
3. **Mock fixture internal group `name`:** Public menu fixtures expose `prompt` only; mock catalog approximates `groupName` from `prompt`. For items where seeded `name === prompt` (current seed), snapshots match the real API.
4. **`board-labels.json` side fixture:** Public menu contract does not include `boardLabel`, but quote snapshots need it. Export writes `packages/mock-api/fixtures/board-labels.json` so the mock catalog matches real API snapshots without expanding the GET menu surface.

## Outstanding business inputs

- Contact phone (`TODO: CONFIRM PHONE`)
- Tip presets `[1500, 1800, 2000, 2500]` and default index `1` — **not signed off**
- Exact per-day opening hours (uniform week hours still provisional)
- Featured / most-ordered curation
- Placeholder beverage/dessert prices and provisional modifier coverage from reconciliation workbook
- Manager alert phone / email (null)

## Phase 1 remediations completed

1. Menu cache-control → `no-cache, must-revalidate` (ETag retained).
2. Store address seeded: `4709 W 95th St`, Oak Lawn, IL `60453-2515`.
3. `.env` protection: `scripts/ensure-env.mjs`; no seed/export script writes `.env`.
