# Sprint 6 Notes — Kitchen Display, Staff PIN Auth, Order Queue

Harold's Chicken Oak Lawn. Kitchen display PWA, PIN sessions, status machine, polling, alerts.

**Contract:** public storefront remains `1.2.0`. Nothing in this sprint is in `docs/openapi/v1.yaml`.

---

## Phase gates

| Phase | Result |
|---|---|
| 1 Sprint 5 remediation | Passed (see counts below) |
| 2 Staff authentication | Passed |
| 3 Kitchen queue API | Passed |
| 4 Status transition engine | Passed |
| 5 Live queue refresh | Passed (logic + desktop Chrome; Swan not on hand) |
| 6 Unacknowledged alerts | Passed (on-screen/sound in PWA; audio unlock documented) |
| 7 Kitchen display PWA | Passed for installable shell + tap-only board; Swan hardware not used |
| 8 Offline / session resume | Passed in PWA logic (retain last queue, reload uses stored token) |
| 9 Swan kiosk | **Documentation only** — device was not available. Runbook is honest about that. |
| 10 Tests, notes, typecheck | See final deliverable in chat |

---

## Phase 1 — Sprint 5 remediation

### 1.1 Kitchen ticket printed → order `PRINTED`

`recordPrintCompletion` success on a **kitchen ticket** calls `applyAutomaticPrintTransition`: if the order is still `PAID`, it becomes `PRINTED` and `printedAt` is stamped. That transition is **only** allowed with source `KITCHEN_TICKET_PRINTED` — the KDS cannot request `PRINTED`.

A **counter receipt** reaching printed does nothing to the order.

If the kitchen already moved the order to `IN_PROGRESS`, a late kitchen-ticket ack is a no-op (never a reversal). Staff can `PAID → IN_PROGRESS` whether or not a ticket printed. That is the Sprint 5 invariant, now structural.

### 1.2 Orphan print jobs

Sprint 4 queued jobs to placeholder serials (`UNCONFIGURED` and anything not in `PRINTER_SERIAL_NUMBER`). Cleanup uses the Sprint 5 cancel path for `QUEUED`, and `SENT → FAILED → CANCELLED` / `FAILED → CANCELLED` for the rest, because `SENT → CANCELLED` is not in the print table. Rows are **not** deleted.

**Count cancelled: 4.** Skipped (still pre-printed and addressed to configured serial `XBVN044247`): 0. Command: `pnpm db:cancel-orphans`.

---

## State transition table (Phase 4.1)

Enforced only in `packages/db/src/order-status.ts`.

| From | To | Who |
|---|---|---|
| PAID | PRINTED | Automatic — kitchen ticket print job reaches printed |
| PAID | IN_PROGRESS | Kitchen display (allowed even if never printed) |
| PRINTED | IN_PROGRESS | Kitchen display |
| IN_PROGRESS | READY | Kitchen display |
| READY | PICKED_UP | Kitchen display |
| PAID | CANCELLED | Kitchen display |
| PRINTED | CANCELLED | Kitchen display |
| IN_PROGRESS | CANCELLED | Kitchen display |

Rejected (logged): `READY → IN_PROGRESS`, `PICKED_UP → *`, `READY → CANCELLED`, KDS requesting `PRINTED`, anything else.

Optimistic lock: `updateMany` where `id` and current `status` match. Concurrent taps: one success, one `StaleOrderTransitionError` or illegal-from-new-status.

Attribution: `OrderStatusEvent` row with `sessionId` / `userId` for KDS actions.

---

## PIN, lockout, session

Sign-in is **roster then PIN** (tap a name, then the on-screen pad). Deviation from “PIN only”: both seeded accounts share PIN `2468` as requested, and a PIN-only lookup cannot attribute the session. A shared tablet should show who is signed in anyway.

| Knob | Default | Why |
|---|---|---|
| Session TTL | 12 hours (`KITCHEN_SESSION_TTL_MS`) | Covers open-to-close plus overlap; not a multi-day credential |
| Max PIN failures | 5 | Short PIN; lockout is the guessing control |
| Lockout | 5 minutes | Visible countdown (`423 PIN_LOCKED` + `retryAfterSeconds`). Wrong PIN is `401 PIN_INVALID`. During lockout even the correct PIN is refused. After the window, a correct PIN succeeds and resets the counter. |
| Token | `hks_` + 32 random bytes, shown once | `AdminSession.tokenHash` is SHA-256. PIN is scrypt with per-row salt. Nothing recoverable. |
| Sign-out | sets `revokedAt` | Row kept |

Seeded accounts (not real people):

| Display name | Email | Role | PIN |
|---|---|---|---|
| Test Staff | test-staff@localhost | STAFF | 2468 |
| Test Manager | test-manager@localhost | MANAGER | 2468 |

**Change the PIN before a live shift.** `passwordHash` is a dummy scrypt of an unusable placeholder; password login is Sprint 8.

Kitchen endpoints: `Authorization: Bearer <token>`. Missing / expired / revoked are distinct codes: `SESSION_REQUIRED`, `SESSION_EXPIRED`, `SESSION_REVOKED`.

---

## Queue query (Phase 3)

`GET /api/internal/kitchen/queue` — statuses `PAID | PRINTED | IN_PROGRESS | READY`, `ORDER BY paidAt ASC`. **No join to print jobs.** An order with every print job cancelled/failed still appears.

Index: `Order_status_paidAt_idx` on `("status", "paidAt")`. The filter is a small status set; sort matches the leading columns.

`EXPLAIN` on the current tiny table (a handful of rows) chooses a sequential scan — cheaper than an index at that size. With `enable_seqscan = off` the same statement uses `Index Scan using Order_status_paidAt_idx` with `Index Cond` on the status list. As the table grows, the planner will prefer the index without being forced. There is no extra cache layer; polling is this query plus `reportPrintQueue`.

Per card: order number, first name + last initial, lines with modifiers and notes, status, `paidAt`, `printedAt`. Print health from Sprint 5 `reportPrintQueue` is on the same payload (header), not used to filter.

---

## Polling and change detection (Phase 5)

Fixed **3s** interval (`KITCHEN_POLL_INTERVAL_MS`; also returned on the queue payload). No backoff — a human is watching.

**New vs already shown:** client-side diff of order ids (`appearedOrderIds`). Chosen because the query is already cheap and indexed; a server cursor would be extra machinery for the same information. New cards get a yellow outline + chime (if audio is unlocked).

A failed poll keeps the last successful queue and shows **Connection lost — showing last tickets**. Recovery is the next successful interval — no reload.

---

## Unacknowledged alerts (Phase 6)

Applies to `PAID` and `PRINTED` only (not yet in progress).

| Layer | Default | Signal |
|---|---|---|
| On-screen | 60s | Ticket turns mustard |
| Audible | 120s | Ticket turns red and pulses; square-wave beep every 8s until started |
| Manager job | 180s | `ALERT_MANAGER_ORDER_UNACKNOWLEDGED` **once per order** (same `payload.orderId` path as Sprint 5 print unacked, so the two paths cannot double-insert) |

Audio: Android Chrome blocks playback without a user gesture. The sign-in pad’s first pointer-down calls `AudioContext.resume()`. Required in the kiosk runbook.

Sweeper: `kitchen-alert-sweeper` every 15s from `instrumentation.ts` so alerts still enqueue if the kiosk is off. The queue GET also runs the same enqueue (idempotent).

---

## PWA (Phases 7–8)

- Route: `/kitchen` (Sprint 1 group).
- Manifest: `/kitchen/manifest.webmanifest`, `display: standalone`, landscape.
- Service worker: `/kitchen-sw.js` caches the shell; API traffic is never cached. Brief outages do not blank the React board.
- On-screen numeric pad only (no OS keyboard).
- Screen Wake Lock while the board is open; Android limitation documented in the runbook.
- Session token in `localStorage` (`harolds.kitchen.sessionToken`). Reload with a valid token skips the PIN pad. Expired/revoked → clean sign-in.

Aesthetic: industrial expo window (oil-black, safety yellow, serrated ticket cards, Anton + IBM Plex Mono). Not the storefront theme.

---

## Kiosk (Phase 9)

See `docs/KITCHEN-KIOSK-RUNBOOK.md`. Swan 1 Pro was **not** in the room. The runbook does not claim a factory-reset device was walked. Closest Android 13 control is **screen pinning**, not MDM kiosk — stated as a limitation.

---

## Public order status

`GET /api/v1/orders/status/{lookupToken}` is unchanged. `getPublicOrderView` already returns `order.status`. Once the KDS advances an order, later lifecycle values (`IN_PROGRESS`, `READY`, `PICKED_UP`, …) are what the customer poll sees. No OpenAPI change.

---

## Deviations

1. **Roster then PIN**, not PIN-only — shared test PIN `2468` plus attribution (see above).
2. **Swan 1 Pro not tested.** PWA verified as logic + desktop Chrome. Phase 9 gate is a complete, honest runbook rather than a hardware walkthrough.
3. **Orphan `SENT` jobs** walk `SENT → FAILED → CANCELLED` instead of `cancelQueuedPrintJob` alone, because Sprint 5’s cancel function only accepts `QUEUED`.
4. **READY is on the queue** (Phase 3 said “at minimum” paid/printed/in-progress; Phase 7 requires a pickup column).
5. Kitchen APIs live under `/api/internal/kitchen/*`, not `/api/v1/*`, so they cannot be mistaken for the public contract (print in Sprint 5 used `/api/v1/print/*` and also stayed out of OpenAPI).

---

## Outstanding business inputs (updated)

- Production Square credentials / live payments
- Tip presets unsigned
- Contact phone
- Exact per-day hours
- Featured / most-ordered curation
- Production domain + TLS (printer SDP URL + Square webhook + **kitchen PWA origin**)
- Kitchen ticket photograph for pixel-level layout fidelity
- Confirm whether a second physical printer will exist for counter receipts
- **Change test staff PINs** before a live shift; replace Test Staff / Test Manager with real accounts in Sprint 8 admin
- **Swan 1 Pro on the store network** — walk `docs/KITCHEN-KIOSK-RUNBOOK.md` on the real device (pinning, wake, audio unlock, Add to Home screen)
- Manager alert phone / email (jobs enqueue; Sprint 7 sends)
- Item photographs / unverified prices / provisional modifiers (carried from earlier sprints)

---

## Commands

```bash
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm db:verify
pnpm db:cancel-orphans
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Kitchen locally: `pnpm dev` → `http://localhost:3000/kitchen`
