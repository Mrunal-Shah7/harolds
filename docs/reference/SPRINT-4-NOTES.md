# Sprint 4 Notes — Square Payments, Order Creation & Webhooks

## Phase 1 remediations

1. **Modifier group internal names** — `group-names.json` side fixture (id → `name`) exported with fixtures; mock catalog uses it so snapshots match the real API when `name ≠ prompt`.
2. **Square env required** — `SQUARE_APPLICATION_ID`, `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENVIRONMENT`, `SQUARE_WEBHOOK_SIGNATURE_KEY` are required. Startup / first hit of `/api/v1/orders` logs `Square environment=…`. `GET /api/v1/health` exposes `squareEnvironment` (non-secret). Glance check: if health says `sandbox`, the instance is sandbox.

## Order number after payment

`orderNumber`, `orderSequence`, and `businessDate` are **nullable** until payment succeeds. Allocation runs inside the same transaction that sets `PAID` / `CAPTURED` and enqueues print + notification jobs. Failed / abandoned checkouts do not consume numbers. PostgreSQL UNIQUE on `(businessDate, orderSequence)` allows multiple nulls.

## Payment sequence

1. Validate body (no client prices) + customer (E.164 phone, email, explicit `smsConsent`).
2. Reprice via `@harolds/pricing` + orderability; refuse if invalid / closed / not accepting.
3. Insert pending order (`AWAITING_PAYMENT`, null number) with `lookupToken`, `clientIdempotencyKey`, `cartFingerprint`.
4. Call Square with idempotency key `pay:{orderId}`.
5. **Record `processorPaymentId` immediately** on success (and when known on decline).
6. On success: transaction → allocate number → PAID → enqueue 2 PrintJobs + 2 BackgroundJobs.
7. On decline: `FAILED`, no number, customer-safe message (`PAYMENT_DECLINED`).
8. On transport failure: `UNKNOWN`, tell customer not to retry (`PAYMENT_FAILED`); webhook / `pnpm reconcile` recovers.

## Sync ↔ webhook convergence

Webhook verifies HMAC over **raw body** against `SQUARE_WEBHOOK_NOTIFICATION_URL` or `{NEXT_PUBLIC_APP_URL}/api/v1/webhooks/square`. Events stored by unique `eventId`. Payment-completed on already-paid is a no-op. Payment-completed on unpaid UNKNOWN/PENDING completes via the same `markOrderPaidAndAllocate` (idempotent). Amount mismatch creates `ALERT_MANAGER_PAYMENT_DISCREPANCY` and does not auto-accept.

## Idempotency (three levels)

| Layer | Key |
|---|---|
| Client → API | `idempotencyKey` unique on Order; fingerprint detects different cart |
| API → Square | `pay:{orderId}` |
| Square → API | `ProcessorWebhookEvent.eventId` |

## Reconciliation

`pnpm reconcile --hours 24` reports stuck awaiting, orphan completed payments, amount mismatches. `--alerts` enqueues manager jobs. `--sweep` marks payment-less stale orders `ABANDONED`. Never auto-repairs money mismatches.

## Deviations

1. `SQUARE_WEBHOOK_NOTIFICATION_URL` optional override — when using ngrok, set it to the exact subscribed URL (e.g. `https://sharing-gecko-gratefully.ngrok-free.app/api/v1/webhooks/square`).
2. Create-order response includes internal `id` for support; public status endpoint omits it and the lookup token.
3. OpenAPI examples for orders are abbreviated relative to the quote examples; shapes match types.
4. Mock does not implement the Square webhook route (credentials forbidden on mock).

## Outstanding business inputs

- Production Square credentials / live payments (sandbox only now)
- Tip presets unsigned
- Contact phone
- Exact per-day hours
- Featured / most-ordered curation
- Printer serial / SDP secrets (Sprint 5) — orders use `PRINTER_SERIAL_NUMBER` or `UNCONFIGURED`
- Production webhook URL + TLS
