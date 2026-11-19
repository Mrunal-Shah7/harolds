<!-- SPRINT-16: the operator checklist for Phases 9 and 10. Written for Manav at a terminal on the
     production server. The agent phases (1-8) are done; see docs/SPRINT-16-NOTES.md. -->

# Sprint 16 — Operator checklist

For Manav, on the production server. Phases 1–8 are complete in code and tested locally against
Postgres and Square sandbox. Everything below needs production, real money, or both.

**Order matters. Phase 9 runs BEFORE you deploy anything.**

---

## What changed, in one paragraph

A customer who hit an ambiguous payment outcome and reloaded could be charged twice. The
idempotency key is now derived from the cart rather than minted per page load, the retry lockout
survives a reload, and — the actual guarantee — the server refuses to create a second order for
the same phone and cart inside a 3-minute window. The `PAYMENT_FAILED` message no longer claims
"Nothing has been charged", because on that path the system does not know. Separately, a
read-only script sizes the historic tip discrepancy and finds duplicate charges.

No database migration. No contract change. No new endpoint.

---

# PHASE 9 — Reconciliation and remediation (before deploying)

## 9.1 Snapshot the running build FIRST

Before anything else. This is currently the only known-good artefact of the running system and it
exists in one place.

```bash
cd /srv/harolds            # adjust to the real deploy root
sudo systemctl stop harolds-web   # only if your deploy process requires it; otherwise skip
sudo cp -a .next  /srv/harolds-backups/next-$(date +%Y%m%d-%H%M%S)
sudo cp -a node_modules /srv/harolds-backups/node_modules-$(date +%Y%m%d-%H%M%S)   # if not reproducible
ls -la /srv/harolds-backups/
```

**Do not skip this.** Sprint 15 established that `HEAD` in git does **not** contain the Square
`payments()` fix, so a git-based rollback lands on a broken payment form. This directory snapshot
is your real rollback target until that is resolved.

## 9.2 Run the reconciliation — read-only

```bash
cd /srv/harolds
pnpm reconcile:sprint16 -- --since 2026-08-01 --window 180 --out /tmp/sprint16
```

Replace `2026-08-01` with the actual cutover date.

It cannot write. Every query runs inside `SET TRANSACTION READ ONLY`; Postgres rejects any write
with error `25006`. There is no update, delete, or refund path in the script.

**Output:**

```
/tmp/sprint16-tips.csv
/tmp/sprint16-duplicates.csv
```

plus a summary on stdout: tipped-order count, total tip value, date range, duplicate-pair count,
and the total value of the second charges.

Open both in a spreadsheet. You have to reason about these lists, not read them in a terminal.

### Reading `tips.csv`

| Column | Means |
|---|---|
| `displayed_total_before_sprint14` | What the customer saw on screen — the total **without** their tip |
| `tip` | What they selected |
| `charged_total` | What their card was charged |
| `discrepancy` | Exactly the tip. This is the amount they did not see before authorising |

### Reading `duplicates.csv`

Each row is a **candidate**, not a confirmed double charge. `first_payment_id` and
`second_payment_id` are the Square payment ids. **Look each pair up in Square and confirm two
captures actually exist before refunding anything** — a pair can appear here with only one
successful capture.

## 9.3 Duplicates — refund unconditionally and proactively

For every pair where Square shows **two captures**:

1. Refund the second charge in full.
2. Contact the customer. They were charged twice for one order and may not have noticed.

Do not wait for anyone to complain. Itemise every refund: order numbers, payment ids, amount,
date.

## 9.4 Tips — decide and record

The argument that this is a **disclosure** matter rather than a refund obligation: the customer
selected the tip, so intent was present, and the SMS and email receipts showed the correct figure.

The argument against: they did not see it before authorising the charge.

**If the total is small, refunding is cheaper than deliberating.** Whatever you decide, write the
decision and the reasoning into `docs/SPRINT-16-NOTES.md` with the total value and the order
count. **Honour anyone who raises it, regardless of the decision.**

## 9.5 After deployment — watch the guard's log

The guard logs one JSON line per hit:

```bash
sudo journalctl -u harolds-web --since today | grep checkout.duplicate_guard_hit | jq .
```

Each line carries `matchedOrderId`, `matchedOrderNumber`, `matchedAgeMs`, `matchedPaymentStatus`,
`customerPhone`, `cartFingerprint`, and `guardWindowMs`.

**A false positive is a legitimate repeat order collapsed into one** — the same customer ordering
the same thing twice inside three minutes. Look for hits where `matchedPaymentStatus` is
`CAPTURED` and `matchedAgeMs` is near the window edge. If any appear, shorten the window:

```bash
# in the production .env
ORDER_DUPLICATE_GUARD_WINDOW_SECONDS=90
```

then restart. No deploy needed — it is configuration.

## 9.6 The `most-ordered` 500

Not reproduced locally. `getMostOrderedItems` is a bare `findMany` that returns `[]`, so an empty
curated list cannot cause it, and every DB-backed route returns 200 locally. The leading
hypothesis is environmental — Sprint 15 found `@prisma/client` ungenerated, which would 500 every
DB-backed route, not just this one.

On production:

```bash
curl -si https://<your-domain>/api/v1/menu/most-ordered | head -20
curl -so /dev/null -w '%{http_code}\n' https://<your-domain>/api/v1/menu
curl -so /dev/null -w '%{http_code}\n' https://<your-domain>/api/v1/store/status
```

- All three erroring → environmental. Check that the build ran `prisma generate`.
- Only `most-ordered` erroring → route-specific. Check whether the curated list references a
  **deactivated or deleted** item:

```sql
SELECT id, name, "isActive", "isMostOrdered"
FROM "MenuItem" WHERE "isMostOrdered" = true;
```

Either way the storefront is safe: a failed response hides the section and the page renders. That
is now covered by tests.

---

# PHASE 10 — Deploy

## 10.1 Deploy this sprint ALONE

**Not with Sprint 14.** One change, one watch window, so a moved payment failure rate is
attributable to something.

Follow `docs/DEPLOYMENT.md`. Correct it in place where it is wrong and record every correction —
it has never been executed end to end, so expect it to be wrong somewhere.

Optional, before deploying:

```bash
# in the production .env — omit entirely to accept the 180s default
ORDER_DUPLICATE_GUARD_WINDOW_SECONDS=180
```

**No migration is required.** If your deploy process wants to run one, stop and find out why —
this sprint adds no schema change and no index.

## 10.2 Verify from outside the network

On a phone, on mobile data:

1. Place a real order. Pay on a real card.
2. Confirm the ticket prints and the order reaches the kitchen display.
3. Refund it. **Itemise the charge and the refund.**

## 10.3 Prove the fix — sandbox first

Reach the failure path deliberately. Do this in **sandbox first**, and only in production if you
can do it safely:

1. Reach an ambiguous outcome (`PAYMENT_FAILED`).
2. Confirm the message reads *"We couldn't confirm that payment. Don't try again just yet…"* and
   **not** "Nothing has been charged".
3. **Reload the page.** Confirm the countdown is still running — it survives the reload now.
4. Attempt to pay again with the same cart. Confirm **no second order** is created:

```sql
SELECT id, "orderNumber", "paymentStatus", "createdAt", "clientIdempotencyKey"
FROM "Order" WHERE "customerPhone" = '<your test phone>'
ORDER BY "createdAt" DESC LIMIT 5;
```

Expect **one** row for the cart, and a `checkout.duplicate_guard_hit` line in the log if the guard
was what caught it.

5. Separately, confirm a **decline** still lets you retry with a different card. This is the
   regression the nonce rotation exists to prevent — it is tested, but it is worth seeing once on
   a real card.

## 10.4 Watch a full service

Not the first hour. Watch:

- payment failure rate, against the days before
- `checkout.duplicate_guard_hit` count, and how many look like false positives
- error rate and dead job count

Be reachable. Be able to revert to the 9.1 snapshot.

## 10.5 Then, and only then

Deploy Sprint 14 on its own separate watch window.

---

## Rollback

```bash
sudo systemctl stop harolds-web
sudo rm -rf /srv/harolds/.next
sudo cp -a /srv/harolds-backups/next-<timestamp> /srv/harolds/.next
sudo systemctl start harolds-web
curl -so /dev/null -w '%{http_code}\n' https://<your-domain>/api/v1/health
```

No migration was applied, so there is nothing to reverse in the database. Rehearse this **before**
you deploy, and time it.
