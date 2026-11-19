<!-- SPRINT-11 / SPRINT-12: what only the storefront developer can implement — the six things that cause incidents if they get them wrong. -->
<!-- SPRINT-18.2: Collect.js configuration is resolved per request on the server; CSP allows the active gateway only. -->
<!-- SPRINT-18.3: billingZip on the order request; PAYMENT_UNAVAILABLE (503) is not a decline. -->

# Storefront requirements — Harold's Chicken Oak Lawn

Public contract **1.3.0** (additive over 1.2.0). Pickup only, guest checkout, ASAP only.

This is the single document for whoever builds the customer UI. The OpenAPI spec and [`API-CONTRACT-HANDOFF.md`](./API-CONTRACT-HANDOFF.md) are the contract. This page is the behaviour the contract cannot see.

Work against **`pnpm mock`** (`http://localhost:4001`) with no database and no `.env`. Point at the real API (`http://localhost:3000`) only after the mock journey works.

**Sprint 12 additions a storefront must know:**

- Menu items may include optional `imageDerivatives` (thumb / modal / preview, webp + fallback). Prefer those over `imageUrl` alone. Missing images are normal — reserve aspect ratio and show a deliberate placeholder.
- Store status may include `announcement`, `closedMessage`, `prepEstimatePhrase`, and `closedReason`. Trading and prep segments stay derived; do not let typed announcement text override "Open now".
- **Superseded in Sprint 18.2:** there are no `NEXT_PUBLIC_NMI_*` variables. The Collect.js script URL and the active tokenization key are resolved on the server, per request, by `app/(storefront)/checkout/layout.tsx` and handed to the payment form through context. Nothing about the gateway is inlined at build, so a bundle cannot be on a different gateway from the server. A storefront built elsewhere must do the same: get both values from the server at request time, never bake them into a build.
- Media is served from `/api/v1/media/{hash}/…` with immutable caching.
---

## 1. Tokenise in the browser. Send only the token.

Use NMI Collect.js for **card**. Wallets (Apple Pay / Google Pay / Cash App) were removed in Sprint 17 along with Square and are not offered. The single-use `payment_token` is the only payment credential Harold's accepts.

`POST /api/v1/orders` body:

- `cart` (lines with `itemId`, `quantity`, `selectedOptionIds`, optional `customerNote`; optional `tip`)
- `customer` (`firstName`, `lastName`, `phone`, `email`, and **explicit** `smsConsent` boolean)
- `paymentToken`
- `billingZip` (Sprint 18.3) — the ZIP on the card's billing statement, collected in an ordinary field beside the card fields (not a Collect.js field; a postal code is not cardholder data). Five digits or ZIP+4. Sent to the gateway for AVS and **never stored**. Optional in the contract, but a storefront that omits it sends every card-not-present sale with no address, which issuers decline more often.
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
| `PAYMENT_UNAVAILABLE` (Sprint 18.3) | 503 | Show the server's `message`: payments are temporarily unavailable and nothing was charged. **Never** say the card was declined — it wasn't. | Yes, the **same** idempotency key: the order was left pending for exactly this. |

For `PAYMENT_DECLINED`, show the server's `message`. It is customer-safe by construction (it never names a fraud disposition or echoes gateway text), and it is the only place the customer learns that the expiry date or security code was wrong, which they can fix.

The mock: `?forcePayment=declined` vs `?forcePayment=transport`. If your UI uses the same sentence for both, stop.

## 6. `orderable: false` still returns a priced cart

A 200 quote with `orderable: false` and `blockingReasons` (`STORE_CLOSED`, `STORE_NOT_ACCEPTING_ORDERS`) must still show line prices and the total. Do not hide the cart. Do not send the customer to checkout.

## 7. SMS consent is retired (Sprint 17)

SMS was removed entirely in Sprint 17 along with Twilio. There is no consent to collect and no
text is ever sent — the email receipt is the only customer confirmation.

`customer.smsConsent` is **retired but still accepted**: it is no longer required, and when sent
it is validated as a boolean and then discarded. New clients should omit it. Do not build a
consent checkbox; it would promise a message the system cannot send.

## 8. Content security policy

Sprint 9 set CSP on every HTML response. Checkout scripts must load from origins the policy already allows:

- `script-src` / `style-src` / `frame-src` / `connect-src`: the **active** gateway origin only (Sprint 18.2) — Merchant Pay Connect, `https://mpc.transactiongateway.com`, in production; the NMI sandbox in sandbox. The gateway host comes from the reseller, not from NMI, and is stated once in code (`packages/config/src/nmi-gateway.ts`); the CSP derives it from the same `NMI_ENVIRONMENT` as the checkout page's Collect.js URL. Collect.js mounts its card-field iframes from the origin its script was loaded from, so no second origin is needed. (It references `collectcheckout.com` only for Google/Apple Pay iframes, which this checkout does not use.)
- `script-src` additionally: `https://applepay.cdn-apple.com`. This is **not** a wallet feature — checkout has none. Collect.js injects Apple's SDK script tag in its own constructor, before `configure()` runs, with no way to suppress it. Removing this host does not disable anything; it just produces a CSP violation on every checkout load.
- `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob: https:`; `font-src 'self' data: https://fonts.gstatic.com`; `object-src 'none'`; `frame-ancestors 'none'`.

`unsafe-inline` and `unsafe-eval` are present because the App Router needs them today. Do not add further exceptions without a written review.

If Collect.js requires an origin that is **not** on that list, **do not** widen CSP locally to make checkout “work”. Record the missing origin and change it in `@harolds/config` `contentSecurityPolicy()` so production and development stay identical. A gateway origin is never added to the policy directly — change `nmi-gateway.ts` and the policy follows.

---

## Mock vs real API (unchanged since Sprint 2)

| | Mock (`:4001`) | Real API (`:3000`) |
|---|---|---|
| CORS | `Access-Control-Allow-Origin: *` | none — same origin |
| Payments | Fabricated; `forcePayment` triggers | NMI sandbox/production |
| Errors | `forceError`, `forceStore`, `forceSoldOut` | Real store/menu/payment state |

Health on the real API may return **503** with `data.ok: false` and additive `checks` / `worker` fields. That is documented in OpenAPI 1.2.0. The mock health is 200.
