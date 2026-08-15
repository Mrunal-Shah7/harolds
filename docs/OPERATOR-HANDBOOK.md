<!-- SPRINT-10: operator index — everyday operations without a developer. -->

# Operator handbook — Harold's Chicken Oak Lawn

Use this page to find the right guide. Do not print the sprint notes; print this and the three runbooks.

**Back office:** `/admin` (password, 4-hour session)  
**Kitchen display:** `/kitchen` (PIN, 12-hour session)  
**Customer site:** `/` (not live until the storefront is integrated)

---

## Everyday operations (managers)

Walk these on `/admin` until they are muscle memory. Detail lives in [`ADMIN-OPERATOR-GUIDE.md`](./ADMIN-OPERATOR-GUIDE.md).

| Job | Where |
|---|---|
| Mark an item sold out / clear it next day | Menu → Available / Sold out; **Clear all sold-out** |
| Change a price | Open the item, dollars like `8.79`, Save |
| Change hours / add a closure | Store → hours; Store → closure date |
| Pause / resume online ordering | Store → Accepting orders |
| Find an order | Orders (today by default) |
| Refund | Order → Full or Partial → confirm |
| Reprint a ticket | Order → Reprint kitchen / Reprint counter (marked REPRINT) |
| Is the printer working? | Dashboard → last polled; queued/failed counts |
| Add / remove staff | Staff (owner only). Deactivate; do not delete. PIN shown once. |

Staff with wet hands should use the kitchen display, not `/admin`.

---

## Printer

Keep [`PRINT-RUNBOOK.md`](./PRINT-RUNBOOK.md) by the TM-m30III.

- Paper, cover, power, network first.
- Do not take payment twice.
- Reprint from `/admin` if the kitchen never got the ticket. A reprint is not a second order.

The printer URL contains a secret. Do not copy it into chat, email, or a screenshot of the printer’s web page unless you are rotating it.

---

## Kitchen tablet

[`KITCHEN-KIOSK-RUNBOOK.md`](./KITCHEN-KIOSK-RUNBOOK.md) — Swan 1 Pro: Chrome → Add to Home screen, screen wake, audio unlock, screen pinning.

**Before the first live shift:** change the seeded test PINs. Test Staff `2468` / Test Manager `1357` / Test Owner `9753` are development only.

---

## Security and incidents

[`SECURITY.md`](./SECURITY.md) — what we hold, what we never hold (card numbers), how to rotate credentials, what to do if you think the system was compromised.

---

## When to call a developer

- Dashboard printer last-polled is stale **and** the printer itself looks healthy.
- Dead-job count is rising and retry does not send.
- `/admin` or `/kitchen` will not load.
- A paid order is not on the kitchen board **and** did not print.

Do not call Square about a missing ticket. The card was already captured. Reprint or correct status from `/admin`.
