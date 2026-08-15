# API Contract Handoff — Storefront Developer

Addressed to the developer building the Harold's Chicken Oak Lawn customer storefront.

**Contract version:** `1.2.0`  
**1.0.0 frozen:** 2026-08-09 (menu + store status)  
**1.1.0 additive:** 2026-08-09 (quote endpoint + cart validation reasons)  
**1.2.0 additive:** 2026-08-09 (orders, payment, webhooks, health)  
Post-freeze changes are **additive only**. Renames or removals require an agreed version bump.

---

## Clone → mock server (no database)

```bash
pnpm install
pnpm mock
```

Mock base URL: **http://localhost:4001**  
Real API (with DB + `.env`): **http://localhost:3000** (`pnpm dev`)

Work against **`pnpm mock`** (`http://localhost:4001`) with no database and no `.env`. See [`STOREFRONT-REQUIREMENTS.md`](./STOREFRONT-REQUIREMENTS.md) for the six incident-class rules.

---

## Contract types

Package: `@harolds/types`

```ts
import type {
  FullMenu,
  MenuItemDetail,
  StoreStatus,
  CartRequest,
  QuoteResult,
  CartValidationReason,
  ApiSuccess,
  ApiErrorResponse,
} from "@harolds/types";
import {
  ApiErrorCode,
  API_CONTRACT_VERSION,
  CartValidationReasonCode,
  CART_LIMITS,
} from "@harolds/types";
```

Do **not** import `@harolds/db` or Prisma from the storefront.

---

## OpenAPI

- Spec: [`docs/openapi/v1.yaml`](./openapi/v1.yaml)
- Validate: `pnpm openapi:validate`

---

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/menu` | Full catalogue: categories → items → modifier groups → options |
| GET | `/api/v1/menu/categories` | Category summaries + active item counts (no items) |
| GET | `/api/v1/menu/items/{id}` | One item with full modifier detail |
| GET | `/api/v1/menu/categories/{categorySlug}/items/{itemSlug}` | Same payload as by-id, addressed by slugs |
| GET | `/api/v1/menu/featured` | Curated featured items (may be empty) |
| GET | `/api/v1/menu/most-ordered` | Curated most-ordered items (may be empty) |
| GET | `/api/v1/store/status` | Identity, hours, open/closed, prep time, tax, tips |
| POST | `/api/v1/quote` | Stateless priced cart + orderability (writes nothing) |
| POST | `/api/v1/orders` | Create order + take payment (authoritative reprice) |
| GET | `/api/v1/orders/status/{lookupToken}` | Public order status by unguessable token only |
| GET | `/api/v1/health` | Runtime health + Square environment (`sandbox` \| `production`) |
| POST | `/api/v1/webhooks/square` | **Square only — not a storefront endpoint** |

There is **no pagination**. The catalogue is under 100 items; load it whole.

All responses use envelope `{ data, meta: { serverTime, version } }`. Errors use `{ error: { code, message, details }, meta }` with non-2xx status.

Menu reads use `Cache-Control: no-cache, must-revalidate` with ETag / 304. Store status and quote use `no-store`.

---

## Quote / cart (Sprint 3)

### Cart request shape

```ts
{
  lines: Array<{
    itemId: string;
    quantity: number;           // integer ≥ 1
    selectedOptionIds: string[]; // option ids only — never group ids, never prices
    customerNote?: string | null;
  }>;
  tip?:
    | { type: "preset"; presetIndex: number }
    | { type: "rate"; rateBps: number }
    | { type: "amount"; amountCents: number };
}
```

**Never send prices.** Any price-like field (`*Cents`, `price`, `total`, `subtotal`, `tax`, …) is rejected (`PRICE_FIELD_FORBIDDEN`). Absent tip ≠ explicit zero tip (`{ type: "amount", amountCents: 0 }`).

Structural ceilings live in `CART_LIMITS` (max lines, quantity, total items, note length, tip rate/amount).

### Success result

Priced lines with kitchen/receipt snapshots, `subtotalCents`, `taxCents`, `taxRateBps`, `taxAppliedPreDiscount`, `tip`, `totalCents`, `orderable`, `blockingReasons`, `estimatedReadyAt`.

- Validation failures → `400 VALIDATION_ERROR` with `details.reasons[]` (every problem, not just the first).
- A cart that prices correctly while the store is closed still returns **200** with `orderable: false` and `blockingReasons` containing `STORE_CLOSED` / `STORE_NOT_ACCEPTING_ORDERS`. Sold-out lines are validation failures, not orderability blocks.

### Advisory vs authoritative

The quote is **for display only**. Sprint 4 reprices authoritatively at checkout. **Never send computed totals to the future order endpoint.**

### Validation reason codes

| Code | Class | Meaning |
|---|---|---|
| `EMPTY_CART` | fixable | No lines |
| `TOO_MANY_LINES` | fixable | Exceeds max line count |
| `INVALID_QUANTITY` | fixable | Quantity not an integer in range |
| `TOO_MANY_ITEMS` | fixable | Total quantity across lines too high |
| `NOTE_TOO_LONG` | fixable | Customer note over limit |
| `TIP_OUT_OF_RANGE` | fixable | Tip rate/amount above ceiling |
| `TIP_DISABLED` | fixable | Tip sent while tipping disabled |
| `TIP_PRESET_INVALID` | fixable | Preset index out of configured range |
| `PRICE_FIELD_FORBIDDEN` | fixable | Client sent a price-like field |
| `MALFORMED_BODY` | fixable | Body/shape not a cart |
| `ITEM_NOT_FOUND` | availability | Unknown **or** inactive item (identical response) |
| `ITEM_SOLD_OUT` | availability | Item sold out |
| `OPTION_NOT_FOUND` | fixable | Option id does not exist |
| `OPTION_INACTIVE` | availability | Option inactive |
| `OPTION_SOLD_OUT` | availability | Option sold out |
| `OPTION_NOT_BOUND` | fixable | Option belongs to a group not bound to this item |
| `GROUP_INACTIVE` | availability | Selected option’s group inactive |
| `DUPLICATE_OPTION` | fixable | Same option selected twice on one line |
| `BELOW_MIN_SELECT` | fixable | Group below minimum (required or partial) |
| `ABOVE_MAX_SELECT` | fixable | Group above maximum |

`isAvailability: true` on a reason means present it as “sorry, just sold out” rather than “please choose a sauce”.

---

## Error codes

| Code | Status | Meaning |
|---|---:|---|
| `NOT_FOUND` | 404 | Unknown path or inactive/missing item (menu reads) |
| `VALIDATION_ERROR` | 400 | Malformed request / cart validation |
| `STORE_CLOSED` | 409 | Store is closed (ordering blocked; also quote `blockingReasons`) |
| `STORE_NOT_ACCEPTING_ORDERS` | 409 | Store paused accepting orders |
| `ITEM_UNAVAILABLE` | 409 | Item sold out / cannot be ordered |
| `PAYMENT_DECLINED` | 402 | Issuer declined the card |
| `PAYMENT_FAILED` | 502 | Payment unconfirmed — do not blind-retry |
| `IDEMPOTENCY_CONFLICT` | 409 | Same idempotency key, different cart |
| `UNAUTHORIZED` | 401 | Webhook signature failed |
| `INTERNAL_ERROR` | 500 | Unexpected failure (no stack/details in body) |

---

## Mock error / edge triggers

| Trigger | Effect |
|---|---|
| `?forceError=NOT_FOUND` (etc.) | Returns that error envelope + status |
| Header `X-Mock-Error: <CODE>` | Same as `forceError` |
| `?forceStore=closed` | Store status / quote with `isOpen: false` |
| `?forceStore=not-accepting` | `acceptingOrders: false` + message |
| `POST /api/v1/quote?forceSoldOut=item\|option` | Sold-out validation on quote |
| `POST /api/v1/orders?forcePayment=declined\|transport` | Declined / transport failure (mock) |
| `POST /api/v1/orders?forceSoldOut=item` | Sold out between quote and order (mock) |
| `POST /api/v1/orders?forceStore=closed\|not-accepting` | Store blocking at checkout (mock) |

---

## Checkout (Sprint 4)

1. Tokenise in the browser with Square Web Payments SDK — never send card data to Harold's.
2. `POST /api/v1/orders` with `{ cart, customer, paymentToken, idempotencyKey }` — no prices.
3. One `idempotencyKey` per checkout attempt; reuse on network retry.
4. Store `lookupToken` from the response; status via `GET /api/v1/orders/status/{lookupToken}`.
5. Never look up by order number (`HC-001` is guessable).
6. Quote is advisory; order response is authoritative.

## What is frozen

- Paths, field names, types, error codes, and envelope shape for contract `1.0.0`
- Additive quote contract + reason codes for `1.1.0`
- Additive order / payment / webhook contract for `1.2.0`
- Breaking changes → new version path (e.g. `/api/v2/...`) agreed in advance

## What is not a storefront surface

Kitchen (`/kitchen`), admin (`/admin`), print poll, and provider webhooks exist and are out of scope for the customer app. Do not call `/api/internal/*` from the storefront.

## Known placeholder data in fixtures / seed

- 8 items with invented `PLACEHOLDER` prices (beverages / desserts)
- 4 provisional modifier groups (reconstructed; incomplete)
- Contact phone is `TODO: CONFIRM PHONE` (street address is now real)
- Tip presets `[1500, 1800, 2000, 2500]` / default index `1` — **not yet signed off by the business**; treat as configuration
- Featured / most-ordered lists are empty until staff curates them
