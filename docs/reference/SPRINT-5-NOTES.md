# Sprint 5 Notes — Kitchen Tickets, ePOS-Print & Server Direct Print

## Status

Phases 1–8 and 10 implemented. Physical print proven on TM-m30III serial `XBVN044247` (one device, both targets). Phase 9 hardware fault drills (paper / cover / power / network) need an operator at the printer; happy-path, ampersand content, two-at-once, reprint, and server-restart recovery were exercised against the device.

---

## Phase 1 — Sprint 4 remediation

### 1.1 Webhook recovery path (real Square delivery) — PASSED

Setup:

1. Next.js `pnpm --filter @harolds/web dev` on `:3000` with temporary `SPRINT5_SUPPRESS_PAID_ALLOCATE=1` (removed after the drill; not left in tree).
2. ngrok: `https://sharing-gecko-gratefully.ngrok-free.app` → `:3000`.
3. Square sandbox subscription `wbhk_48deb6749d4646f58d082be6d71e267e` previously pointed at the **tunnel root**. Updated via Square Webhooks API to:
   - `https://sharing-gecko-gratefully.ngrok-free.app/api/v1/webhooks/square`
4. `.env` `SQUARE_WEBHOOK_NOTIFICATION_URL` matched that URL.

Drill: order left unpaid with `processorPaymentId` set; Square `payment.created` / `payment.updated` completed it **once** (`HC-002`, 2 print + 2 background jobs). Redelivery returned `DUPLICATE`.

Surprise: root notification URL delivered events to `/` (Next.js page 200). Path must be exact.

### 1.2 Job type in migration + drift — PASSED

`ALERT_MANAGER_PAYMENT_DISCREPANCY` is in `packages/db/prisma/migrations/20260809190000_sprint4_orders_payments/migration.sql` and in live `pg_enum`.

---

## Printer configuration runbook (replace a dead TM-m30III during service)

Assume the person reading this has never opened the config page and is in a rush.

### Recover the IP address

1. Power the printer **off**.
2. Hold the **feed** button.
3. Power **on** while holding feed until a status slip prints.
4. Read the IPv4 address on that slip.
5. On a phone/laptop on the **same Wi-Fi/LAN**, open `http://THAT-IP/` (Epson TMNet WebConfig). Default admin login is on the status slip / printer docs.

### Server Direct Print settings (WebConfig)

Typical path: **Settings → Web service settings → Server Direct Print** (wording varies slightly by firmware).

| Setting | Value used in this sprint | Why |
|---|---|---|
| Server Direct Print | **Enable** | Printer must pull; we never push |
| URL | `https://<public-host>/api/v1/print/poll?key=<PRINTER_SDP_SHARED_SECRET>` | HTTPS required. Query `key` is how this firmware sends the shared secret (it does **not** send HTTP Digest). |
| ID / Name | Printer **serial number** (this device: `XBVN044247`) | Must match `PRINTER_SERIAL_NUMBER` exactly. This firmware posts `Name=<serial>` with an empty `ID=` |
| Interval | **5 seconds** (not the 60s default) | Food service; 60s is too slow |
| Spooler | **Enable** | Paper-out / cover-open queues work instead of discarding it |

Save. Confirm the printer’s status page shows SDP enabled.

### Application `.env` (same values)

```
PRINTER_SERIAL_NUMBER="XBVN044247"
PRINTER_SDP_SHARED_SECRET="<same string as ?key=>"
```

Optional if a second printer appears later:

```
PRINTER_KITCHEN_SERIAL="..."
PRINTER_COUNTER_SERIAL="..."
```

Today one serial serves both targets.

### When the server URL moves (tunnel → production)

1. Change the printer SDP URL host to the production domain. Keep the path `/api/v1/print/poll?key=...`.
2. TLS must be a publicly trusted certificate — this device rejected nothing on ngrok’s cert; it **will** refuse self-signed / plain HTTP.
3. Leave the serial and secret unchanged unless rotating the secret (then update both printer URL and `.env` together).
4. Square webhook URL is separate (`/api/v1/webhooks/square`) but also must move to the production host.

### Reset the device

Power off, hold feed, power on for a status slip. Factory reset lives under WebConfig maintenance/reset — only if the UI is unreachable after a network change. Re-enter SDP settings from the table above.

### Health check

If tickets stop: a printer that has **not polled in two minutes** is off, unplugged, or on the wrong URL. Queue report `lastPolledAt` is that signal.

---

## Ticket layout

Content lives in `@harolds/print` (`TicketModel`). Encoding (ePOS-Print XML) is a separate renderer. **No prices on the kitchen ticket.** Times are `StoreConfig.timezone` (`America/Chicago`). Board label is used when present.

### Kitchen ticket (plain-text preview of a realistic order)

```
                  HC-003
------------------------------------------
08/09/26  1:59 PM
ONLINE
Jamal W.
                ** PAID **
              ONLINE PICKUP
------------------------------------------
1/2 CHICKEN
  MILD
  ADD FRIES
  NOTE: Extra crispy if possible
2 X MAYO PACKETS
------------------------------------------
                  HC-003
        Harold's Chicken Oak Lawn
```

Online deltas vs in-store POS: `ONLINE` operator line, customer first name + last initial, `** PAID **`, `ONLINE PICKUP` emphasis, `N X` quantity prefix, `NOTE:` under the item.

No kitchen-ticket photograph was in the repo; this follows the sprint prompt’s described structure.

### Counter receipt

Same identity + items, then stored money (never recomputed): `SUBTOTAL` / `TAX` / `TIP` / `TOTAL`, `PAYMENT <status>`, `CARD ****NNNN` only when Square supplied last four.

---

## State machine (permitted transitions)

| From | To | When |
|---|---|---|
| QUEUED | SENT | Poll claims the job |
| SENT | PRINTED | Printer reports success |
| SENT | FAILED | Printer reports a device error |
| SENT | QUEUED | Sweeper: sent, never acknowledged, under attempt ceiling |
| FAILED | QUEUED | Sweeper retry (after backoff) |
| FAILED | CANCELLED | Attempt ceiling |
| QUEUED | CANCELLED | Manual cancel |
| CANCELLED | QUEUED | Manual requeue (attempts reset) |

Illegal examples (rejected): `PRINTED → QUEUED`, `QUEUED → PRINTED`. A reprint is a **new** row with the **same stored payload** and `isReprint=true`. A `*** REPRINT ***` banner is applied at send time only.

---

## Sweeper knobs

| Knob | Default | Reasoning |
|---|---|---|
| `PRINT_SENT_TIMEOUT_MS` | 90000 | Poll is ~5s; print + ack should finish in seconds. 90s catches silence without flapping |
| `PRINT_MAX_ATTEMPTS` | 5 | Enough for paper-out reload; not infinite |
| `PRINT_RETRY_BACKOFF_MS` | 30000 | Base 30s, doubles each attempt (cap 16×) so an empty printer is not hammered every 5s |
| `PRINT_UNACKNOWLEDGED_ORDER_MS` | 120000 | If the printer is off, jobs stay QUEUED forever — this raises `ALERT_MANAGER_ORDER_UNACKNOWLEDGED` after two minutes |

In-process interval: 10s, started from Next.js `instrumentation.ts`, cleared on SIGTERM/SIGINT inside the sweeper module.

---

## Design invariant (Phase 7.3)

**A print job that fails must never make the order invisible.** The order stays `PAID`. Sprint 6’s kitchen display is a second channel and must not share this failure mode: a ticket that never printed must still appear on the screen.

---

## Encoding

- Documents are UTF-8 XML.
- Order-derived text is NFKD-folded to printable ASCII, then XML-escaped (`&` → `&amp;`, etc.).
- Accented names degrade (`José` → `Jose`) rather than corrupting the document.
- TM-m30III firmware posts `ConnectionType=GetRequest&ID=&Name=<serial>` (not `ID=` as in older TM-i manuals).

---

## Phase 9 drills (physical printer)

| Drill | Result |
|---|---|
| Happy path paid order | **Passed.** `HC-001` kitchen + counter both `PRINTED` with `sentAt` and `acknowledgedAt` set. Item `Chicken & Catfish` plus note with `<> &`. |
| Reprint | **Passed.** New job, byte-identical payload, `isReprint=true`, printed with banner; original stayed `PRINTED`. |
| Two orders in one poll interval | **Passed.** `HC-004` and `HC-005` — four tickets, kitchen before counter, no duplicate rows. |
| Ampersand / markup note | **Passed** (same as happy path). Payload contains `&amp;` / `&lt;` and still printed. |
| Server restart with SENT in flight | **Passed.** Stale `SENT` job requeued by sweeper after process restart, then printed. |
| Out of paper | **Not performed** — operator kept paper loaded. |
| Cover open | **Not performed** — operator skipped remaining hardware faults. |
| Printer powered off | **Not performed** — operator skipped. |
| Network loss | **Not performed** — operator skipped. |

---

## Deviations from the prompt

1. Webhook suppress flag for Phase 1.1 — temporary, reverted.
2. Square sandbox webhook URL corrected from tunnel root to `/api/v1/webhooks/square`.
3. Shared secret is a **query parameter** (`?key=`), not Digest. This TM-m30III polls with `User-Agent: curl/8.10.1` and never sends `Authorization: Digest` even after 401. Query param is something the device can actually send (it is part of the configured URL).
4. Printer identity field is `Name=`, with empty `ID=`.
5. No kitchen-ticket photograph in the repo; layout follows the prompt’s written structure.
6. Reprint banner is applied at **send** time so the stored payload stays byte-identical to the original.
7. Print endpoints are **not** on the public OpenAPI storefront contract.
8. Phase 9 paper / cover / power / network were **not run** (operator skipped). Server restart, two-at-once, ampersand content, reprint, and happy-path physical print **were** run.

---

## Outstanding business inputs

- Production Square credentials / live payments
- Tip presets unsigned
- Contact phone
- Exact per-day hours
- Featured / most-ordered curation
- Production domain + TLS (replace ngrok host on the printer SDP URL and Square webhook)
- Kitchen ticket photograph for pixel-level layout fidelity (staff feedback may still tweak spacing)
- Confirm whether a second physical printer will exist for counter receipts
