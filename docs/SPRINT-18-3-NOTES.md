<!-- SPRINT-18.3: billing ZIP for AVS, the real response mapping, and declines separated from gateway incidents. Agent phases 0–7; Phase 8 is the operator's. -->

# Sprint 18.3 — billing ZIP for AVS, and correct decline diagnostics

**Status: code complete and verified locally. Not deployed. No NMI or Merchant Pay Connect host was
contacted.** Every test run preloaded a guard that blocks `fetch` to any `nmi.com`,
`transactiongateway.com` or `networkmerchants.com` host; it never fired.

In short:

- Checkout now collects a billing ZIP and sends it as the gateway's `zip`. It is stored nowhere.
- Every sale attempt is now recorded with the gateway's own codes, AVS and CVV included.
- `201` Do Not Honor and `240` Call Issuer no longer share an answer.
- A gateway incident (`411`, `410`, `460`, `3xx`/`4xx`) is no longer reported to the customer as
  a card decline. It returns 503 "payments temporarily unavailable" and pages a manager, once per
  15-minute window.

---

## 0. Inventory (Phase 0), as found before any change

| # | Question | Answer |
|---|---|---|
| 1 | Checkout form | `app/(storefront)/checkout/page.tsx` (client). Fields: first/last name, phone, email, tip, order note, and a hidden decoy. Validation lives in `lib/checkout-validation.ts` (`validateCheckout`), and `canSubmitForm` = form valid && quote orderable (`page.tsx:140-142`). The page posts via `lib/storefront-api.ts` `createOrder`. The server parses the request in `lib/checkout.ts` `parseCreateOrderBody` and builds the sale in `chargeClaimedOrder` (`checkout.ts:674-722` pre-sprint). |
| 2 | Collect.js | `components/storefront/nmi-payment-form.tsx` configures three fields only: `ccnumber`, `ccexp`, `cvv`. No ZIP. |
| 3 | Response handling | Parsed in `packages/payments/src/client.ts` `readResult` (`:104-116`: `response`, `response_code`, `responsetext`, `transactionid` only; AVS/CVV ignored). `declineCode` came from `errors.ts:31-56` `PAYMENT_DECLINE_CODE_MAP`, which cited an unnamed "NMI gateway response codes reference" and mapped `201`, `240`, `250`–`253` and `260` all to `CALL_ISSUER`. |
| 4 | What was persisted | `Order`: `paymentStatus`, `processorPaymentId`, `processorOrderId`, `paymentCapturedAt`, `paymentFailureReason` (customer text), `chargeClaimedAt`, `paidAt`, `cardLast4`. No gateway code, AVS, CVV, or per-attempt history. Logs: `payment.attempt` (info) and `payment.outcome` (info/warn), carrying only `outcomeKind` and `paymentId`. |
| 5 | Were `4xx` distinguishable? | Partly, and badly. `410`/`411` threw `PaymentClientError`, which nothing in checkout caught, so the route returned a generic **500**, left the claim held, sent no alert, and the next retry went into recovery against the same failing gateway. `420`/`421`/`430`/`460` returned 502 "could not confirm", with no alert. `461` counted as a decline. Any other `3xx`/`4xx` also became a 500. |
| 6 | Alerting | `JobType` Postgres enum: `ALERT_MANAGER_PRINT_FAILED`, `_JOB_DEAD`, `_ORDER_UNACKNOWLEDGED`, `_PAYMENT_DISCREPANCY`. An alert is raised by inserting a `BackgroundJob`; `packages/notify/src/handlers.ts` emails the manager, with a delivery-side volume cap per type. |
| 7 | Response code table | **Sourced from `docs/Merchant Pay Connect INC-Direct-Post-API.md`**, which the operator exported from the MPC portal (Developer Docs), sections "Result Code Table", "AVS Response Codes", "CVV Response Codes", "Transaction Response Variables" and "Rate Limits". Reproduced in §1. |

**Two findings shaped the sprint:**

- **The page threw away the server's decline message.** `page.tsx:185-188` always showed "That
  card was declined. Try a different card." So even a correct mapping could never have told a
  customer that their expiry date or security code was wrong.
- **The Payment API returns no processor response code.** Its standard response is exactly
  `response`, `responsetext`, `authcode`, `transactionid`, `avsresponse`, `cvvresponse`,
  `orderid`, `response_code` and `emv_auth_response_data`; the only conditional extra is
  `merchant_advice_code`. The processor `05` that the portal showed is not in any response we
  receive. The MPC document has no Query API section, so whether `query.php` exposes it is
  unknown (see OUTSTANDING).

---

## 1. The response code tables (source: the MPC document above)

### Result Code Table, as implemented (`packages/payments/src/result-codes.ts`)

| Code | MPC description | Internal reason | Classification | Handling | Customer message |
|---|---|---|---|---|---|
| 100 | Transaction was approved. | APPROVED | APPROVED | approved | — |
| 200 | Transaction was declined by processor. | DECLINED_BY_PROCESSOR | DECLINED | decline 402 | DECLINED |
| **201** | **Do not honor.** | **DO_NOT_HONOR** | DECLINED | decline 402 | **DECLINED** |
| 202 | Insufficient funds. | INSUFFICIENT_FUNDS | DECLINED | decline 402 | INSUFFICIENT_FUNDS |
| 203 | Over limit. | OVER_LIMIT | DECLINED | decline 402 | OVER_LIMIT |
| 204 | Transaction not allowed. | TRANSACTION_NOT_ALLOWED | DECLINED | decline 402 | DECLINED |
| 220 | Incorrect payment information. | INCORRECT_PAYMENT_INFORMATION | DECLINED | decline 402 | CHECK_CARD_DETAILS |
| 221 | No such card issuer. | NO_SUCH_CARD_ISSUER | DECLINED | decline 402 | CHECK_CARD_DETAILS |
| 222 | No card number on file with issuer. | NO_CARD_NUMBER_ON_FILE | DECLINED | decline 402 | CHECK_CARD_DETAILS |
| 223 | Expired card. | EXPIRED_CARD | DECLINED | decline 402 | EXPIRED_CARD |
| 224 | Invalid expiration date. | INVALID_EXPIRATION_DATE | DECLINED | decline 402 | CHECK_EXPIRY |
| 225 | Invalid card security code. | INVALID_SECURITY_CODE | DECLINED | decline 402 | CHECK_SECURITY_CODE |
| 226 | Invalid PIN. | INVALID_PIN | DECLINED | decline 402 | DECLINED |
| **240** | **Call issuer for further information.** | **CALL_ISSUER** | DECLINED | decline 402 | **CALL_ISSUER** |
| 250 | Pick up card. | PICK_UP_CARD | DECLINED | decline 402 | DECLINED |
| 251 | Lost card. | LOST_CARD | DECLINED | decline 402 | DECLINED |
| 252 | Stolen card. | STOLEN_CARD | DECLINED | decline 402 | DECLINED |
| 253 | Fraudulent card. | FRAUDULENT_CARD | DECLINED | decline 402 | DECLINED |
| 260 | Declined with further instructions available. (See response text) | DECLINED_WITH_INSTRUCTIONS | DECLINED | decline 402 | DECLINED |
| 261 | Declined-Stop all recurring payments. | STOP_ALL_RECURRING | DECLINED | decline 402 | DECLINED |
| 262 | Declined-Stop this recurring program. | STOP_THIS_RECURRING | DECLINED | decline 402 | DECLINED |
| 263 | Declined-Update cardholder data available. | UPDATE_CARDHOLDER_DATA_AVAILABLE | DECLINED | decline 402 | UPDATED_CARD |
| 264 | Declined-Retry in a few days. | RETRY_IN_A_FEW_DAYS | DECLINED | decline 402 | DECLINED |
| 300 | Transaction was rejected by gateway. | REJECTED_BY_GATEWAY | GATEWAY_FAILURE | incident 503 + alert | PAYMENTS_UNAVAILABLE |
| 301 | Rate limit exceeded. *(Rate Limits section, not the table)* | RATE_LIMITED | GATEWAY_FAILURE | incident 503 + alert | PAYMENTS_UNAVAILABLE |
| 400 | Transaction error returned by processor. | PROCESSOR_ERROR | GATEWAY_FAILURE | incident 503 + alert | PAYMENTS_UNAVAILABLE |
| 410 | Invalid merchant configuration. | INVALID_MERCHANT_CONFIGURATION | CONFIGURATION_FAILURE | incident 503 + alert | PAYMENTS_UNAVAILABLE |
| 411 | Merchant account is inactive. | MERCHANT_ACCOUNT_INACTIVE | CONFIGURATION_FAILURE | incident 503 + alert | PAYMENTS_UNAVAILABLE |
| 420 | Communication error. | COMMUNICATION_ERROR | COMMUNICATION_FAILURE | ambiguous 502 + alert | (existing "couldn't confirm") |
| 421 | Communication error with issuer. | COMMUNICATION_ERROR_WITH_ISSUER | COMMUNICATION_FAILURE | ambiguous 502 + alert | (existing "couldn't confirm") |
| 430 | Duplicate transaction at processor. | DUPLICATE_AT_PROCESSOR | GATEWAY_FAILURE | ambiguous 502 + alert | (existing "couldn't confirm") |
| 440 | Processor format error. | PROCESSOR_FORMAT_ERROR | GATEWAY_FAILURE | incident 503 + alert | PAYMENTS_UNAVAILABLE |
| 441 | Invalid transaction information. | INVALID_TRANSACTION_INFORMATION | GATEWAY_FAILURE | incident 503 + alert | PAYMENTS_UNAVAILABLE |
| 460 | Processor feature not available. | PROCESSOR_FEATURE_NOT_AVAILABLE | CONFIGURATION_FAILURE | incident 503 + alert | PAYMENTS_UNAVAILABLE |
| 461 | Unsupported card type. | UNSUPPORTED_CARD_TYPE | DECLINED | decline 402 | UNSUPPORTED_CARD_TYPE |

Four more readings sit outside the table:

- **`300` with a spent or expired Collect.js token** in `responsetext` becomes
  `PAYMENT_TOKEN_ALREADY_USED`: a decline, with "please re-enter your card".
- **An unmapped code** falls back on the documented `response` field. `2` becomes
  `UNMAPPED_DECLINE` (generic decline); `3` becomes `UNMAPPED_GATEWAY_ERROR` (incident). Both log
  `payment.unmapped_result_code` at warn, naming the code.
- **Transport failures** (no answer received) are all COMMUNICATION_FAILURE and ambiguous:
  `GATEWAY_TIMEOUT`, `GATEWAY_UNREACHABLE`, `GATEWAY_HTTP_<status>`. The exception is **HTTP 429**,
  the MPC "System-Wide Rate Limit": the request was not processed, so it is `RATE_LIMITED_HTTP_429`,
  an incident. `LOCAL_CREDENTIALS_MISSING` is a configuration incident, and nothing is sent.
- **Approved but no transaction id** becomes `APPROVED_WITHOUT_TRANSACTION_ID`, ambiguous.
  Previously this threw and produced a 500.

**The customer messages** (`CustomerMessage` in `result-codes.ts`):

| Key | Customer message |
|---|---|
| DECLINED | "Your card was declined. Please try a different card, or contact your bank." |
| CALL_ISSUER | "Your bank declined this payment and asked you to contact them. Please call the number on the back of your card, or use a different card." |
| CHECK_EXPIRY / CHECK_SECURITY_CODE / EXPIRED_CARD | Name the specific field, because the customer can act on it. |
| PAYMENTS_UNAVAILABLE | "Online payments are temporarily unavailable, and nothing was charged. Please try again in a few minutes, or call the store to place your order." |

- **Pick-up, lost, stolen and fraudulent cards** get exactly the DECLINED message and the same
  public `declineCode` (`CARD_DECLINED`) as `200`/`201`, so the response is indistinguishable from
  an ordinary decline.
- **No customer sentence names fraud, theft, or a lost or stolen card**, asserted by a test over
  every message.
- **The internal reason never reaches the customer**: it is not in the API response, only on the
  attempt row and in the log line.

**`201` and `240`, side by side:**

| | 201 | 240 |
|---|---|---|
| MPC description | Do not honor. | Call issuer for further information. |
| Internal reason | `DO_NOT_HONOR` | `CALL_ISSUER` |
| Public `declineCode` | `CARD_DECLINED` | `CALL_ISSUER` |
| Customer message | "Your card was declined. Please try a different card, or contact your bank." | "Your bank declined this payment and asked you to contact them. Please call the number on the back of your card, or use a different card." |

### AVS Response Codes (stored raw in `PaymentAttempt.avsResponse`)

| Code(s) | MPC meaning |
|---|---|
| X | Exact match, 9-character numeric ZIP |
| Y, D, M | Exact match, 5-character numeric ZIP |
| 2, 6 | Exact match, 5-character numeric ZIP, customer name |
| A, B | Address match only |
| 3, 7 | Address, customer name match only |
| W | 9-character numeric ZIP match only |
| Z, P, L | 5-character ZIP match only |
| 1, 5 | 5-character ZIP, customer name match only |
| N, C | No address or ZIP match only |
| 4, 8 | No address or ZIP or customer name match only |
| U | Address unavailable |
| G, I | Non-U.S. issuer does not participate |
| R | Issuer system unavailable |
| E | Not a mail/phone order |
| S | Service not supported |
| 0, O, B | AVS not available |

**The MPC document lists `B` twice**, as "Address match only" and as "AVS not available". The
code is stored raw, so nothing depends on which is right, but read a `B` with that in mind.

**Because we send a ZIP and no street address,** the expected "good" answers are `Z`, `P` or `L`
(ZIP match), not `Y`.

### CVV Response Codes (stored raw in `PaymentAttempt.cvvResponse`)

| Code | MPC meaning |
|---|---|
| M | CVV2/CVC2 match |
| N | CVV2/CVC2 no match |
| P | Not processed |
| S | Merchant has indicated that CVV2/CVC2 is not present on card |
| U | Issuer is not certified and/or has not provided Visa encryption keys |

The field names come from the same document: `zip` ("Card billing zip code") in the request, and
`avsresponse`, `cvvresponse`, `authcode`, `transactionid`, `response`, `response_code` and
`responsetext` in the response.

---

## 2. Collecting the ZIP (Phase 1)

**Transport decision: an ordinary application input, not Collect.js.** A postal code is not
cardholder data, so PCI scope is unchanged, the field validates and styles with the rest of the
form, and there is no extra iframe. Nothing in Phase 0 argued otherwise; Collect.js is configured
for card number, expiry and CVV only.

- **The field.** "Billing ZIP code" sits in the Payment card directly under the Collect.js fields.
  It uses `inputMode="numeric"` and `autoComplete="billing postal-code"`, and the help text reads
  "The ZIP on your card's statement."
- **Required.** It joins `validateCheckout`, so the Pay button stays disabled until the ZIP is
  valid, and it is marked touched on the Pay click like every other field.
- **Validated loosely** by `lib/billing-zip.ts` `normalizeBillingZip`:
  - Spaces and dashes are stripped. The value must then be exactly 5 or 9 digits, and the first
    five are kept.
  - `60633`, `60633-1234`, `60633 1234` and `606331234` all pass.
  - `606` fails with "Enter the 5-digit ZIP code of your card's billing address."
  - Empty fails with "Billing ZIP is required."
  - The same function runs on the server.
- **Optional in the API contract, always sent by this storefront.** Making it required would
  break any existing client.

---

## 3. Sending it, and what is recorded (Phases 2 and 5)

**The sale request body** (from an evidence run against the stubbed gateway; `security_key`
masked):

```
type=sale&payment_token=tok-EXAMPLE-COLLECTJS-TOKEN&amount=1.74&orderid=<order id>&order_description=Order+<order id>&currency=USD&zip=60633&security_key=<masked>
```

**The ZIP is persisted nowhere.** It travels request → `ChargePayment` → `createPayment` → the
`zip` parameter, and stops there.

- `PaymentAttemptInput` has no field that could carry it.
- The only log mention is the boolean `billingZipProvided`.
- A test runs an approved sale, then counts rows in **every table in the public schema** whose
  text contains the ZIP, and does the same for the payment token. Both counts are unchanged. The
  test also asserts neither value appears in any log line.

**A new `PaymentAttempt` row is written for every sale attempt**, approved or not:

| Group | Fields |
|---|---|
| What it was | amount, gateway environment, gateway origin |
| How it was classified | classification, internal reason |
| What the gateway said | gateway `response`, `response_code`, `responsetext` (truncated to 200 characters), AVS, CVV |
| How to find it | `authcode`, full `transactionid`, HTTP status |

It is written before the outcome is acted on, and a write failure is logged and never changes the
customer's answer. The admin order detail shows a **Payment attempts** table with all of it. The
transaction ID there is shown as `…last6`, like every payment ID on that screen; the full ID is on
the row and in the log line.

**The AVS result is recorded, not acted on.** No gateway-level AVS or CVV rejection rule was
enabled. That decision belongs to the operator (see OUTSTANDING).

**One structured line per attempt**, `payment.outcome`, carries the same facts. Its level is info
for an approval, warn for a decline, and error for an incident. A declined attempt looks like this:

```
{"level":"warn","event":"payment.outcome","scope":"@harolds/payments","orderId":"<id>","orderReference":"<id>","correlationId":"pay:<id>","amountCents":174,"outcomeKind":"declined","paymentId":"12555999010","gatewayEnvironment":"production","gatewayOrigin":"https://mpc.transactiongateway.com","classification":"DECLINED","internalReason":"DO_NOT_HONOR","gatewayResponse":"2","gatewayResponseCode":"201","gatewayResponseText":"DECLINE","avsResult":"N","securityCodeResult":"M","httpStatus":null}
```

The field names deliberately avoid the redaction vocabulary (`securityCodeResult`, not
`cvv...`), because these are result codes, not card data. Tests assert that no line contains the
token, the ZIP, the security key, or a PAN. The gateway sends only a masked `cc_number`, and only
its last four digits are ever extracted, to `Order.cardLast4`, as before.

**Is the "diagnosable without the portal" standard met? Almost, not fully.** For the next decline
our own records will show:

- the gateway code and text (e.g. `201` / "DECLINE");
- AVS and CVV (e.g. `N` / `M`);
- the auth code and transaction ID;
- the classification and internal reason;
- the amount and gateway.

For a reader with no portal access, that answers "was it the card or us", "did AVS match", "did
CVV match", and "which transaction is it". **What it does not show is the processor's own response
code** (the `05` behind 18.1's decline). The Payment API does not return it, and for the rarer
cases where that code differs in meaning from the gateway's, the portal is still needed.

---

## 4. Declines are not gateway errors (Phase 4)

The mechanism is `packages/payments/src/result-codes.ts` plus `chargeClaimedOrder` in
`apps/web/src/lib/checkout.ts`.

| Kind | HTTP | Order afterwards | Claim | Alert |
|---|---|---|---|---|
| **decline** (2xx, 461, spent token) | 402 `PAYMENT_DECLINED`, mapped message | `FAILED` (unchanged behaviour) | released | none |
| **incident** (300, 301, 400, 410, 411, 440, 441, 460, HTTP 429, missing creds) | **503 `PAYMENT_UNAVAILABLE`** (new, additive) | **left `PENDING`/`AWAITING_PAYMENT`** | **released** — nothing was charged | **yes** |
| **ambiguous** (420, 421, 430, timeout, unreachable, non-200) | 502 `PAYMENT_FAILED` (unchanged) | `UNKNOWN` (unchanged) | kept — it may have charged | **yes** (new) |

- **Why incidents leave the order pending.** Marking the order `FAILED` would make a retry with
  the same idempotency key replay it as `PAYMENT_DECLINED`, calling a gateway outage a decline
  again. Leaving it pending and releasing only this attempt's exact claim (`releaseChargeClaim`
  matches the timestamp) means the same checkout retries the same order once the gateway
  recovers. The page does not rotate the nonce and does not lock out on `PAYMENT_UNAVAILABLE`.
- **Why `420`/`421`/`430` stay ambiguous.** The processor may have authorised before the
  conversation broke. That is Sprint 17's double-charge rule, and it is not weakened here. They
  gain an alert and a classification, nothing else.
- **Why `460` changed.** "Processor feature not available" moved from ambiguous to a definite
  incident. The processor refused the feature, so nothing was processed, and that is exactly how
  a merchant account not boarded for card-not-present would present.

**Alert rate limit.** `packages/db/src/payment-attempts.ts` `raisePaymentGatewayIncident` inserts
`ALERT_MANAGER_PAYMENT_GATEWAY_FAILURE` at most once per 15 minutes. It uses a transaction-scoped
advisory lock, so simultaneous failures still produce one alert. The existing delivery-side volume
cap applies on top.

**A simulated `411`, three orders in a row** (evidence run):

- Each order got **HTTP 503**, `PAYMENT_UNAVAILABLE`, with the message "Online payments are
  temporarily unavailable, and nothing was charged. Please try again in a few minutes, or call the
  store to place your order." and `details: { retryable: true }`.
- **Alert jobs created: 1.** Payload: `{"classification":"CONFIGURATION_FAILURE","internalReason":"MERCHANT_ACCOUNT_INACTIVE","gatewayResponseCode":"411","gatewayOrigin":"https://mpc.transactiongateway.com","gatewayEnvironment":"production","windowMinutes":15,...}`.
- The alert email's subject is "Online payments failing — MERCHANT_ACCOUNT_INACTIVE". Its body
  says these are **not** customer declines, that this is the only alert for 15 minutes, shows the
  code and gateway, and ends "Call Merchant Pay Connect support and ask whether the account is
  active and boarded for e-commerce (card-not-present)."

**The recorded classification separates the two in reporting:** `PaymentAttempt.classification`
is `DECLINED` for a `201`, `CONFIGURATION_FAILURE` for a `411`.

---

## 5. Suite (Phase 6)

**The kitchen-alerts flake is fixed, not accounted for.** The sweep alerts every qualifying paid
order in the database, and the test asserted on the sweep's return count, which included paid
orders created concurrently by other `packages/db` test files. Every assertion is now scoped to
the file's own order IDs through an `alertsFor(orderId)` helper. It passed in both full runs.

**`openapi:validate` is fixed.** It now compares `info.version` against the code's
`API_CONTRACT_VERSION` instead of the stale `"1.2.0"` literal, and it knows `PAYMENT_UNAVAILABLE`.
It passes ("OK — 12 paths, 11 error codes, version 1.3.0"), and **the drift check runs and
passes** for the first time since Sprint 17.

**The suite, run twice identically** (typecheck, lint, build, test, with the gateway guard):

| | Run 1 | Run 2 |
|---|---|---|
| Typecheck | clean | clean |
| Lint | 5 errors, 9 warnings | identical |
| Build | pass | identical route table |
| Tests | **537 / 537** | **537 / 537** |
| Gateway guard fired | 0 | 0 |

- **Test counts:** 471 → 537. payments 28→81, web 147→160; config 40, db 145, notify 17, print 25,
  pricing 65 and email 4 are unchanged in count.
- **The five lint errors are the pre-existing set**, unused imports in `packages/db` `order-status`
  and `packages/notify` `handlers`/`templates.test`. One of them (`E164`, now at
  `handlers.ts:36`) is in a file this sprint edited only to add the new handler; it was not fixed.
  None comes from 18.3 code.

**Bundle deltas** (versus Sprint 18.2's final build):

| Route | 18.2 | 18.3 | Why |
|---|---|---|---|
| `/checkout` | 10.4 kB / 129 kB | 10.7 kB / 129 kB | ZIP field, validator, the `PAYMENT_UNAVAILABLE` branch |
| `/admin` | 26.9 kB / 136 kB | 27.1 kB / 136 kB | Payment attempts table |
| `/kitchen` | 5.2 kB | 5.22 kB | shared `@harolds/types` job-type list |
| Middleware, shared | 49.3 kB, 103 kB | unchanged | |

---

## 6. API contract

All changes are additive, and the version stays 1.3.0, as with Sprint 9 and Sprint 18.2:

- `CreateOrderRequest.billingZip` (optional string).
- `ApiErrorCode.PAYMENT_UNAVAILABLE` (HTTP 503).

OpenAPI, `@harolds/types`, the mock API's error messages, and `STOREFRONT-REQUIREMENTS.md` are
all updated. Nothing is removed or renamed.

---

## 7. Deviations

1. **A new table** (`PaymentAttempt`) despite the schema header's "later sprints add rows, not
   tables". An order can see several attempts (retry after an incident, recovery), and each
   answer must survive the next. The header now records the exception.
2. **The migration was written by hand from `prisma migrate diff`** and applied with
   `migrate deploy`, because `migrate dev` refused: the applied `20260919120000_sprint18_seo`
   migration's checksum no longer matches its file (probably CRLF; pre-existing), and Prisma's fix
   is a database reset. The diff contained only this sprint's objects.
3. **No processor response code or text is recorded.** The Payment API does not return one
   (§0), so Phase 5 is met except for that field.
4. **A new error code (`PAYMENT_UNAVAILABLE`)** rather than reusing `PAYMENT_FAILED`. The
   storefront treats `PAYMENT_FAILED` as "may have charged, don't retry", which is the wrong
   instruction for a definite incident.
5. **Behaviour changes beyond the brief's letter, all on non-decline paths:**
   - `410`/`411`: 500 → 503, and the claim is released.
   - `460`: ambiguous → definite incident.
   - Approval without a transaction ID: 500 → ambiguous.
   - Unmapped `3xx`: 500 → 503.

   The decline path and Sprint 17's double-charge rule are unchanged.
6. **The page now shows the server's decline message.** Phase 3's actionable messages were
   otherwise unreachable.
7. **The admin view shows transaction IDs as `…last6`**, following the existing Sprint 8 redaction
   rule. The full ID is stored and logged.
8. **`461` Unsupported card type** is listed with the errors in the MPC table but is treated as a
   decline, because it concerns the card the customer chose and they can fix it.
9. **An evidence file** (`apps/web/src/lib/zz-s183-evidence.test.ts`) was created, run once
   against the stubbed gateway to produce the samples above, and deleted.

---

## 8. Processes started, and how they ended

| Started | Ended |
|---|---|
| `prisma migrate dev --create-only` (refused, changed nothing), `prisma migrate diff`, `prisma migrate deploy` (applied the 18.3 migration to the local DB), `prisma generate` (failed EPERM while the operator's server held the engine; succeeded after they stopped it) | Foreground, exited |
| Targeted `tsx --test` runs; `typecheck` / `lint` / `build` / `test` ×2; `openapi:validate` | Foreground, exited |
| The evidence test | Foreground, exited; file deleted |

The operator's own `pnpm start` was not touched by the agent; the operator stopped it on
request. No dev server, watcher or background process was left running. Temp files are in
`%TEMP%\s183`, outside the repository.
