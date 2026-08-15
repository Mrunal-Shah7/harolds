# Sprint 8 Notes — Admin Back-Office

Harold's Chicken Oak Lawn. Password admin sessions, menu and modifier control, store hours, orders/refunds, operations dashboard, staff, reporting.

**Contract:** public storefront remains `1.2.0`. Nothing in this sprint is in `docs/openapi/v1.yaml`. Admin lives at `/admin` and `/api/internal/admin/*`, same isolation as kitchen and print.

---

## Phase 1 — Carry-forward audit

| Item | State |
|---|---|
| Sprint 5 printer failure drills (paper / cover / power / network) | **Blocked** — needs a person at the TM-m30III. Unchanged since Sprint 5. |
| Physical kitchen ticket showing modifiers | **Blocked** — no printer in this environment this sprint. Layout tests already cover indented uppercase modifiers. |
| Android audio unlock on the kitchen display | **Blocked** — no Android / Swan device. Documented since Sprint 6. |
| Swan 1 Pro kiosk walkthrough | **Blocked** — runbook exists (`docs/KITCHEN-KIOSK-RUNBOOK.md`); device not on hand. |
| Seeded test staff accounts | **Deferred to Phase 9, then resolved as capability** — UI can create real accounts and deactivate the test ones. Seed still upserts `test-staff@localhost`, `test-manager@localhost`, `test-owner@localhost` for development. Do not delete; deactivate so attribution remains. |
| Eight placeholder-priced items | **Deferred to Phase 4, then resolved as capability** — editing the price clears `isUnverifiedPrice` on that item only. Count remains 8 until someone types the real prices. |
| Four provisional modifier groups | **Deferred to Phase 5, then resolved as capability** — editing name/prompt/min/max/required clears `isProvisional`. Real per-item modifier data was not supplied this sprint. |
| Empty featured / most-ordered | **Deferred to Phase 4, then resolved as capability** — `/admin/menu/curation`. Still empty until curated. |
| Null / placeholder manager alert phone and email | **Deferred to Phase 6, then resolved as capability** — editable on Store. Seeded placeholders remain until replaced. |
| Workbook CONFLICT / DUPLICATE? / REVIEW rows | **Blocked** — business input. Seeded verbatim since Sprint 1. |
| A2P 10DLC | **Blocked** — not started (Sprint 7). |
| Production Square, production domain, TLS | **Blocked** — Sprint 10. |

**Phase 1.2 code debt:** none that was blocking. Password login was the dummy hash Sprint 6 left on purpose.

Existing tests passed (full workspace). `pnpm db:verify` exited 0 (87 items, 8 unverified, 4 provisional).

---

## Role permission matrix (as implemented)

| Capability | Staff | Manager | Owner |
|---|---|---|---|
| Kitchen display (PIN) | Yes | Yes | Yes |
| Password sign-in to `/admin` | No (rejected at sign-in) | Yes | Yes |
| Kitchen PIN session on any admin endpoint | No | No | No |
| Menu, modifiers, sold-out, curation | No | Yes | Yes |
| Store identity, hours, closures, alerts, accepting-orders, prep/busy | No | Yes | Yes |
| Tax rate, tax basis, tip presets | No | **No** (403 at the service) | Yes |
| Orders, refunds, cancel, reprint, status correction | No | Yes | Yes |
| Dashboard, jobs, print repair | No | Yes | Yes |
| Reports, CSV, reconciliation (read-only) | No | Yes | Yes |
| Staff create/edit/deactivate, PIN reset, revoke sessions, audit log | No | **No** | Yes |

Authorisation is `requireAdmin(request, minRole)` on every `/api/internal/admin/*` route except sign-in/sign-out. A hidden nav link is not access control. Staff with a correct password are refused at sign-in with a distinct message. A manager kitchen session (`purpose=KITCHEN`) is refused even if the user is a manager — refunds require the shorter admin password session.

---

## Admin session and lockout

| Knob | Default | Why |
|---|---|---|
| `ADMIN_SESSION_TTL_MS` | 4 hours | Shorter than kitchen's 12-hour shift token. This session can refund money and change prices, and the device is a laptop or a phone, not a mounted kitchen tablet. |
| `ADMIN_PASSWORD_MAX_FAILURES` | 5 | Same count as PIN lockout. |
| `ADMIN_PASSWORD_LOCKOUT_MS` | 15 minutes | Longer than the 5-minute PIN window. Password guessing is slower (scrypt N=32768) and a lockout should outlast a burst. Distinct error from a wrong password (`PASSWORD_LOCKED` 423 vs `PASSWORD_INVALID` 401). |

Password hashes are `scrypt$N$r$p$salt$hash` with N=32768, per-row salt. PIN hashes stay `scrypt$salt$hash`. Session tokens are `has_…`, stored SHA-256 only, httpOnly cookie `harolds_admin`. Cookie is never logged.

Failed password attempts use `failedPasswordAttempts`, independent of `failedPinAttempts`. `lockedUntil` is shared: a lockout blocks both until it expires.

---

## Which existing services each screen calls

| Screen | Service |
|---|---|
| Sold-out / menu edits | `invalidateMenuCache` / `invalidateAllPublicCaches` (Sprint 2) |
| Refund | `refundOrder` (Sprint 4) — not reimplemented |
| Cancel | `cancelOrder` (Sprint 4) |
| Reprint | `reprintTicket` (Sprint 5) |
| Print requeue / cancel / repair | `requeuePrintJob`, `cancelQueuedPrintJob`, `repairMissingPrintJobs` |
| Dashboard printer panel | `reportPrintQueue` (Sprint 5) |
| Dashboard / Jobs | `reportBackgroundJobs`, `retryDeadJob`, `retryDeadJobsByType`, `cancelBackgroundJob`, `inspectBackgroundJob` (Sprint 7) |
| Store hours / status | `evaluateOpenClosed`, `getStoreStatus` (Sprint 2) |
| Reconciliation | `runReconciliation` (Sprint 4), `enqueueAlerts: false` |
| Currency input | `dollarsToCents` (Sprint 1) |
| Money display | `formatCents` (Sprint 3) |

---

## Reporting methodology

Daily and range reports read `totalCents`, `taxCents`, `tipCents`, and `refundedCents` from orders. Tax is **never** recomputed with `applyBasisPoints`. Paid money is bucketed on the store-local calendar date of `paidAt`. Unpaid cancelled/abandoned rows are bucketed on `createdAt` so they stay visible. Net = stored gross − stored refunds. Item sales sum snapshotted `itemName` / `quantity` / `lineTotalCents` on paid orders.

CSV is the same figures, comma-separated, for the accountant.

---

## Deviations

1. **Admin sessions are a separate `purpose=ADMIN` on the same `AdminSession` table**, not a new table. A kitchen PIN session cannot authorise `/admin` even for a manager.
2. **Admin status correction does not enqueue `SMS_ORDER_READY`.** A manager moving an order is not a kitchen "ready" tap. Retry the job from the dashboard if the customer still needs a message.
3. **`refundOrder` gained `actedByUserId` and an optional `refundPaymentFn`.** The Square call is unchanged; the injector exists so tests do not need live credentials.
4. **Real modifier data was not entered** — the interface can express required single-select, multi-select with a max, and nested combo-style bindings. Outstanding business input.
5. **Placeholder prices were not invented.** The eight unverified items stay flagged until a manager types the real price.
7. **`@harolds/web` tests load `.env` via `--env-file`.** ESM hoists `refunds.ts` → `@harolds/square` → `parseEnv` before a dotenv call in the test body can run.
8. **Password scrypt uses a typed callback wrapper**, because TypeScript's `promisify(scrypt)` does not include the options overload (N=32768).
9. **Admin UI is a catch-all `/admin/[[...slug]]`** plus `/admin/signin`, not a tree of page files. The shell still routes by path.

---

## Test accounts (development only)

| Email | Role | Password | PIN |
|---|---|---|---|
| test-staff@localhost | STAFF | `HaroldsStaff1!` | 2468 |
| test-manager@localhost | MANAGER | `HaroldsManager1!` | 1357 |
| test-owner@localhost | OWNER | `HaroldsOwner1!` | 9753 |

Change or deactivate before a live shift. Seed resets these credentials if re-run.

---

## Outstanding business inputs

1. Real prices for the eight unverified beverage/dessert items.
2. Real per-item modifier data replacing the four provisional groups.
3. Featured and most-ordered curation (tooling is ready).
4. Manager alert phone and email (replace Sprint 7 placeholders).
5. Exact store contact phone.
6. Exact per-day hours (seeded uniform week is still provisional).
7. Workbook CONFLICT / DUPLICATE? / REVIEW rows.
8. Deactivate seeded test accounts after creating real staff.
9. A2P 10DLC brand + campaign; Twilio; verified email domain.
10. Android kitchen audio; Swan 1 Pro walkthrough; printer failure drills; physical modifier ticket.
11. Production Square, domain, TLS (Sprint 10).
