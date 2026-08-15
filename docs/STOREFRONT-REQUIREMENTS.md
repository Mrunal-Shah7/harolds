<!-- SPRINT-11: what only the storefront developer can implement — the six things that cause incidents if they get them wrong. -->

# Storefront requirements — Harold's Chicken Oak Lawn

Public contract **1.2.0**. Pickup only, guest checkout, ASAP only.

This is the single document for whoever builds the customer UI. The OpenAPI spec and [`API-CONTRACT-HANDOFF.md`](./API-CONTRACT-HANDOFF.md) are the contract. This page is the behaviour the contract cannot see.

Work against **`pnpm mock`** (`http://localhost:4001`) with no database and no `.env`. Point at the real API (`http://localhost:3000`) only after the mock journey works.

---

## 1. Tokenise in the browser. Send only the token.

Use the Square Web Payments SDK for **card, Apple Pay, Google Pay, and Cash App Pay**. The token is the only payment credential Harold's accepts.

`POST /api/v1/orders` body:

- `cart` (lines with `itemId`, `quantity`, `selectedOptionIds`, optional `customerNote`; optional `tip`)
- `customer` (`firstName`, `lastName`, `phone`, `email`, and **explicit** `smsConsent` boolean)
- `paymentToken`
- `idempotencyKey`

**Never send** `price`, `total`, `subtotal`, `tax`, or any `*Cents` field. The server rejects those (`PRICE_FIELD_FORBIDDEN`). The quote is for display. Checkout reprices.

## 2. One idempotency key per checkout attempt

Generate the key when the customer taps Pay. Reuse it if the request is retried (timeout, refresh). A **new** key is a new attempt and can charge twice.

## 3. Store `lookupToken`. Never look up by order number.

`HC-001` is guessable. Status is `GET /api/v1/orders/status/{lookupToken}` only.

## 4. Render every validation reason. Distinguish the two classes.

Quote/order `400 VALIDATION_ERROR` includes `details.reasons[]`. Show **all** of them.

- `isAvailability: true` — the item or option just became unavailable. Do not tell the customer they filled the form wrong.
- otherwise — they can fix the cart (quantity, required modifier, note length, forbidden price field).

## 5. Payment declined ≠ payment failed

| Code | Status | What to tell the customer | Retry? |
|---|---|---|---|
| `PAYMENT_DECLINED` | 402 | The issuer declined this card. Try another card. | Yes, with a **new** idempotency key and a new token. |
| `PAYMENT_FAILED` | 502 | We could not confirm payment. Do not tap Pay again yet. Call the store or wait. | **No** immediate retry. A second tap can double-charge. |

The mock: `?forcePayment=declined` vs `?forcePayment=transport`. If your UI uses the same sentence for both, stop.

## 6. `orderable: false` still returns a priced cart

A 200 quote with `orderable: false` and `blockingReasons` (`STORE_CLOSED`, `STORE_NOT_ACCEPTING_ORDERS`) must still show line prices and the total. Do not hide the cart. Do not send the customer to checkout.

## 7. SMS consent is explicit and off by default

Do not pre-check the box. Do not infer consent from a phone number. Send `smsConsent: true` only after a clear opt-in.

## 8. Content security policy

Sprint 9 set CSP on every HTML response. Checkout scripts must load from origins the policy already allows:

- `script-src` / `frame-src` / `connect-src`: `https://*.squarecdn.com`, `https://*.squareup.com`, `https://*.squareupsandbox.com`, `https://web.squarecdn.com`, `https://sandbox.web.squarecdn.com`, `https://pci-connect.squareup.com`, `https://pci-connect.squareupsandbox.com`.
- `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob: https:`; `font-src 'self' data: https://fonts.gstatic.com`; `object-src 'none'`; `frame-ancestors 'none'`.

`unsafe-inline` and `unsafe-eval` are present because the App Router needs them today. Do not add further exceptions without a written review.

If a Square wallet requires an origin that is **not** on that list, **do not** widen CSP locally to make checkout “work”. Record the missing origin and change it in `@harolds/config` `contentSecurityPolicy()` so production and development stay identical.

---

## Mock vs real API (unchanged since Sprint 2)

| | Mock (`:4001`) | Real API (`:3000`) |
|---|---|---|
| CORS | `Access-Control-Allow-Origin: *` | none — same origin |
| Payments | Fabricated; `forcePayment` triggers | Square sandbox/production |
| Errors | `forceError`, `forceStore`, `forceSoldOut` | Real store/menu/payment state |

Health on the real API may return **503** with `data.ok: false` and additive `checks` / `worker` fields. That is documented in OpenAPI 1.2.0. The mock health is 200.
