<!-- SPRINT-15: sprint notes. This sprint STOPPED AT PHASE 1 on its own blocking prerequisites.
     Nothing in Phases 2-10 was started. No file outside this one was modified. -->

# Sprint 15 — Admin and Kitchen Display overhaul

## STATUS: STOPPED AT PHASE 1. Gate 1 FAILED. No implementation work was performed.

Phase 1.1 says: *"If any is open, stop and report. Do not start work on the assumption that
someone will close them in parallel."* Five of the seven prerequisites are open. Phase 1.2 says:
*"If no browser is available here either, say so now, in Phase 1, and stop."*

**No code was changed. No stylesheet was touched. `design.md` was not amended. Nothing was
committed.** This file is the only thing this sprint wrote.

---

## 0. The environment, stated once

```
SQUARE_ENVIRONMENT="sandbox"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
DATABASE_URL="postgresql://postgres:***@localhost:5432/harolds?schema=public"
```

**This is a development machine, not the production server.** No artifact in this repository is a
production artifact. Every production-dependent requirement in this sprint is unexecutable from
here: Prerequisite 2's tip reconciliation across real orders, Prerequisite 7's deployment and
watch, and Phases 1.4, 1.5, 9.3, 9.4 and all of Phase 10.

There is also no Swan tablet, no kitchen, no thermal printer, no staff, and no means of charging
a real card.

### The browser question, answered precisely

Unlike Sprint 14, `chrome.exe` and `msedge.exe` **do** exist on this machine. That is not enough,
and it should not be re-litigated next session:

- One-shot `chrome --headless --screenshot` renders a single URL. It cannot click, type, sign in,
  or wait.
- **Every state this sprint is about is interaction-gated.** The admin routes are behind
  authentication. The kitchen board is behind a PIN sign-in. The audio-unlock panel, the refund
  confirmation dialog, the age bands, connection-lost, printer-offline, and every empty/loading/
  error state require driving the application, not photographing a URL.
- No Playwright, Puppeteer, Cypress, or Lighthouse is installed, and none appears in any
  manifest.

Installing a driver was considered and rejected: it would not close Prerequisites 1, 2, 4, 6 or
7, and this sprint is blocked on those regardless.

---

## 1. The seven prerequisites — evidence per row

| # | Prerequisite | State |
|---|---|---|
| 1 | Sprint 13 work committed separately; rollback target contains the Square fix | **OPEN — and worse than described.** See §2 |
| 2 | Tip discrepancy reconciled across all tipped orders since cutover | **OPEN.** No reconciliation artifact exists anywhere in `docs/` or `scripts/`, and the order data is on production, which is not reachable from here |
| 3 | Re-quote race closed | **SATISFIED IN CODE, UNVERIFIED.** See §3 |
| 4 | The retry lockout's real guarantee established | **OPEN — and the answer is "there is none."** See §4 |
| 5 | `most-ordered` confirmed healthy; home hides the section on failure | **HALF SATISFIED IN CODE, UNVERIFIED.** See §5 |
| 6 | The 51-state regression walk done by hand in a browser | **OPEN.** Not possible here — see §0 |
| 7 | Sprint 14 deployed and its watch window complete | **OPEN.** Never deployed. `docs/DEPLOYMENT.md` is untouched since 2026-08-15 and carries no Sprint 14 correction entries, which it would if the document had ever been executed |

**Prerequisite 7 is the one that matters most**, and the sprint says so itself: two surfaces must
not ship in one deployment, or a moved payment-failure rate cannot be attributed. Sprint 14 has
not shipped at all.

---

## 2. Prerequisite 1 — the rollback target is knowably broken

`HEAD` is `a7c0697 "Few more changes"` — **the same commit Sprint 14 started from.** Nothing from
Sprint 14 was committed, and nothing from Sprint 13 was either.

### The rollback target does not contain the Square fix

Prerequisite 1 asks this to be confirmed. It can be answered definitively:

```
$ git show HEAD:apps/web/src/components/storefront/square-payment-form.tsx | grep -n "payments"
11:      payments: (appId: string, locationId: string) => Promise<SquarePayments>;
61:    window.Square.payments(appId, locationId)
```

At `HEAD`, `payments()` is still typed and consumed as a **Promise**. The Sprint 13 fix — that the
Square Web Payments SDK returns the Payments object **synchronously** — is absent.

**The only git-reachable rollback target is a broken payment form.** Rolling back to it is the
exact scenario Prerequisite 1 was written to prevent.

### The scope is larger than Prerequisite 1 assumes

```
$ git diff --cached --stat | tail -1
 117 files changed, 7099 insertions(+), 650 deletions(-)
```

Prerequisite 1 says to commit "the uncommitted Sprint 13 work as its own commit, separate from
Sprint 14". That presupposes a two-way split. **The staged blob is not two sprints — it is
Sprints 8 through 14**: the admin route registry and admin auth, the Sprint 12 media pipeline and
its routes, the kitchen layout, health and startup changes, and the entire Sprint 14 storefront
redesign.

Slicing that into per-sprint commits is archaeology across six sprints of interleaved work, and
it determines what production can be rolled back to. **That is a decision with real consequences
and it was not made unilaterally.** Nothing was committed.

---

## 3. Prerequisite 3 — satisfied in code, not verified

Both halves hold structurally in `app/(storefront)/checkout/page.tsx`:

- **Pay is disabled while a quote is in flight.** `payDisabled` (line 200) includes
  `quoteLoading`, and `refreshQuote` sets `quoteLoading` true on entry. The tip-change effect
  routes through `refreshQuote`, so the in-flight window is covered.
- **"Other" does not fire per keystroke.** The custom amount commits on `onBlur` (line 334), not
  on `onChange`.

Neither has been exercised in a browser. Structurally correct is not the same as closed, and
Prerequisite 6 exists precisely because that gap has never been walked.

---

## 4. Prerequisite 4 — neither mechanism guarantees it. This is a live double-charge path.

This is the most serious finding of the session and it is in code Sprint 14 wrote.

**The lockout does not persist.** `lockoutSeconds` is component state (line 60). A page reload
clears it.

**Server-side idempotency does not cover the reload case.** The chain:

1. The client mints its key with `useState(newIdempotencyKey)` — **a fresh key on every mount.**
2. `apps/web/src/lib/checkout.ts:263` calls `findOrderByIdempotencyKey(request.idempotencyKey)` —
   keyed on that **client-supplied** value.
3. A reload therefore presents a key that has never been seen, matches nothing, and creates a
   **new order**.
4. `squarePaymentIdempotencyKey(orderId)` (line 54) derives the Square key from **our order id** —
   so a new order means a new Square idempotency key, and **a second charge is reachable.**
5. The cart persists to `localStorage`. The idempotency key does not.

So on the `PAYMENT_FAILED` path — the one whose copy reads *"Nothing has been charged. Give it a
minute before trying again."* — a customer who reloads and pays again after an ambiguous first
attempt is not protected by the countdown (gone) or by idempotency (fresh key).

Prerequisite 4 asks which mechanism provides the guarantee. **The answer is that neither does**,
and closing it requires a real change: persist the idempotency key alongside the cart, persist
the lockout deadline, or key server-side idempotency on something stable across a mount. That is
a behaviour change in the payment path and belongs to whoever owns that decision.

---

## 5. Prerequisite 5 — half satisfied, half unknown

**The second half holds in code.** `app/(storefront)/page.tsx` fetches through a `fetchJson`
helper that catches and returns `null`, and the home view receives `mostOrdered?.items ?? []`, so
a failed response hides the section rather than erroring the route.

**The first half is unknown.** `/api/v1/menu/most-ordered` has not been confirmed healthy:

- The process that returned 500 for it during Sprint 14 is gone (see §6).
- `@prisma/client` is not generated in this working tree (`"@prisma/client did not initialize
  yet"`), so the database cannot be queried directly either, despite Postgres listening on 5432.

---

## 6. Phase 1.6 — the localhost:3000 process

**Nothing is listening on port 3000 now.**

```
$ curl -s -o /dev/null -w "status=%{http_code}" http://localhost:3000/
status=000
$ netstat -ano | grep LISTENING | grep :3000
(no output)
```

During Sprint 14 that port answered `/api/v1/menu/most-ordered` with "Internal Server Error". It
has since exited. It was not started by Sprint 14 and not by Sprint 15; consistent with a stale
development server that has since been stopped. **Recorded rather than inherited a second time,
as Critical rule 2 asks.** Nothing was killed, because there was nothing to kill.

---

## 7. Gate accounting

| Gate | Result |
|---|---|
| **1 — Inventory, baseline, prerequisites** | **FAILED.** Check 1 fails (five prerequisites open). Check 2 fails (no interaction-capable browser; neither surface inventoried or screenshotted). Check 3 fails (no accessibility baseline possible). Check 4 fails (no printer, no production — the ticket fallback is unproven). Check 5 fails (no tablet). Check 6 **passes** — the :3000 process is identified and dealt with |
| **2–10** | **NOT STARTED.** Phase 1 says stop, so they were never entered. Recorded as not-started rather than blocked, because no attempt was made |

Final-deliverable items 3 through 23 have no content. They were not attempted.

---

## 8. Processes started and terminated

| Started | How it was stopped |
|---|---|
| `git` read commands (`log`, `status`, `show`, `diff`) | Foreground, exited |
| `grep` / `ls` / `curl` / `netstat` probes | Foreground, exited |
| Two short `node -e` probes (TCP check to 5432, Prisma count attempt) | Foreground, exited; the Prisma one failed to initialise and connected to nothing |

**No dev server, watcher, build, browser, or database console was started, so none is running.**

**No production service was touched.** Nothing was deployed, restarted, or reconfigured. No
commit was made, no file outside this one was modified.

---

## 9. What has to happen before Sprint 15 can begin

In order:

1. **Decide how the 117 staged files are committed** (see §2). This is a user decision. Until it
   is made there is no coherent rollback target, and both Prerequisite 1 and Critical rule 9 are
   unclosable.
2. **Close Prerequisite 4** (§4). It is a live double-charge exposure in the payment path,
   independent of any redesign, and it should not wait for a design sprint.
3. **Reconcile the tips** (Prerequisite 2) against production order data.
4. **Deploy Sprint 14 alone and watch it** (Prerequisite 7). One surface, one watch window.
5. **Walk the 51 states by hand** (Prerequisite 6), which requires a browser against a seeded
   local instance — `prisma generate` and a seed first.
6. Then Sprint 15 Phase 1, which additionally needs the Swan tablet, the kitchen, the printer,
   and access to the staff.
