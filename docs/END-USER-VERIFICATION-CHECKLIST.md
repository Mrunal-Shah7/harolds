<!-- Manual end-user verification — behavior checklist for storefront, kitchen, and admin. -->

# End-user verification checklist — Harold's Chicken Oak Lawn

Use this to walk the product the way people actually use it. Tick only what you **personally saw**.

| Mark | Meaning |
|---|---|
| ☐ | Not done |
| ✅ | Observed and correct |
| ❌ | Broken / unexpected |
| — | Not applicable (missing hardware, domain, or production credentials) |

**How to run today (laptop / sandbox)**

1. `pnpm dev` (or your usual start).
2. Customer site: `http://localhost:3000/`
3. Kitchen: `http://localhost:3000/kitchen`
4. Admin: `http://localhost:3000/admin`  
   - Owner: `test-owner@localhost` / `HaroldsOwner1!`  
   - Kitchen PINs (dev): Staff `2468`, Manager `1357`, Owner `9753`
5. Payments: NMI **sandbox** test cards (not real money). Wallets were removed in Sprint 17 — checkout is card only, so mark any wallet row **—**.
6. Printer / Swan tablet / real email: mark **—** until devices and production messaging are available. SMS was removed in Sprint 18 — mark every SMS row **—** permanently.

**Scope reminder:** pickup only · guest checkout only · ASAP only · no delivery · no customer accounts.

Record date, who ran it, and environment (sandbox / production) at the bottom.

---

## 0. Before you start

| # | Check | Result |
|---|---|---|
| 0.1 | Site loads on phone and desktop | ☐ |
| 0.2 | Menu shows categories and items (photos appear where uploaded) | ☐ |
| 0.3 | Banner shows open / closed / paused correctly for the current time | ☐ |
| 0.4 | You know whether you are on **sandbox** or **production** NMI (`/api/v1/health` → `paymentEnvironment`) | ☐ |

---

## 1. Customer — browse the menu

| # | What to do | What you should see | Result |
|---|---|---|---|
| 1.1 | Open `/` | Store name / branding; menu; cart affordance | ☐ |
| 1.2 | Read the status banner while open | Something like “Open now · Ready in … · Pickup only” | ☐ |
| 1.3 | Scroll categories | Every category you expect; items in a sensible order | ☐ |
| 1.4 | Open an item **with a photo** | Photo loads (not a broken image) | ☐ |
| 1.5 | Open an item **without** a photo | Still usable; no broken image icon | ☐ |
| 1.6 | Find a **sold-out** item (or mark one in admin first) | Clearly not orderable | ☐ |
| 1.7 | Open an item with **modifiers** | Required groups enforced; sold-out options disabled | ☐ |
| 1.8 | Featured / most-ordered sections (if curated) | Lists match what admin set | ☐ |
| 1.9 | Announcement posted in admin | Same text on the storefront banner | ☐ |

---

## 2. Customer — cart and pricing

| # | What to do | What you should see | Result |
|---|---|---|---|
| 2.1 | Add a simple item (no modifiers) | Line appears in cart with correct name and price | ☐ |
| 2.2 | Add the same item again / change quantity | Quantity updates; line total updates | ☐ |
| 2.3 | Add an item **with modifiers** (including a priced one, e.g. Add Fries) | Modifier names shown; price includes add-ons | ☐ |
| 2.4 | Add a **customer note** on a line | Note visible in cart | ☐ |
| 2.5 | Remove a line / clear cart | Cart updates immediately | ☐ |
| 2.6 | Build a mixed cart (several items, mixed modifiers) | Subtotal looks right before checkout | ☐ |
| 2.7 | Try to order only a sold-out item | Cannot complete to payment | ☐ |

---

## 3. Customer — checkout and payment

| # | What to do | What you should see | Result |
|---|---|---|---|
| 3.1 | Go to checkout with a valid cart | Name, phone, email (as required), tip choices, payment form | ☐ |
| 3.2 | Leave tip **none** | Total matches food + tax only | ☐ |
| 3.3 | Choose a **tip preset** | Total increases by that tip | ☐ |
| 3.4 | Enter a **custom tip** | Total updates correctly | ☐ |
| 3.5 | Pay with a **successful sandbox card** | Confirmation with order number; “paid” | ☐ |
| 3.6 | Double-tap Pay / refresh mid-submit | **One** order only (no double charge) | ☐ |
| 3.7 | Pay with a **declined** sandbox card | Clear decline message; can retry with another card | ☐ |
| 3.8 | After decline, pay successfully | One paid order; no orphan “ghost” charge confusion | ☐ |
| 3.9 | Apple Pay (real iPhone, HTTPS domain) | Completes → paid → later refunded in admin | ☐ / — |
| 3.10 | Google Pay (real Android, HTTPS) | Completes → paid → refunded | ☐ / — |
| 3.11 | Cash App Pay (real device, HTTPS) | Completes → paid → refunded | ☐ / — |
| 3.12 | Confirmation page | Order number, pickup messaging, items/modifiers/totals match cart | ☐ |
| 3.13 | Open order status / lookup link if shown | Status updates as kitchen advances the order | ☐ |
| 3.14 | ~~SMS confirmation / ready text~~ | **Removed in Sprint 18.** No text is ever sent. The email receipt (3.15) is the only confirmation. | — |
| 3.15 | Email receipt (prod email) | Inbox (not only spam); money and lines match | ☐ / — |

**Sandbox card tips (NMI):** use the published test PANs in `packages/payments/src/test-cards.ts` (Visa `4111111111111111`, expiry `10/29`, CVV `999`). The NMI sandbox decides the outcome from the AMOUNT, not the card: **≥ $1.00 approves, under $1.00 declines**. Do not use a real personal card against sandbox.

---

## 4. Customer — when the store won’t take orders

Do each from admin, then check the storefront **without** refreshing cleverly — just open `/` and try checkout.

| # | Setup in `/admin` → Store | Customer experience | Result |
|---|---|---|---|
| 4.1 | Uncheck **Accepting orders** + paused message | Can browse; cannot place order; paused message shown | ☐ |
| 4.2 | Re-check accepting orders | Ordering works again immediately | ☐ |
| 4.3 | Temporary override: **close early** / closed rest of day | Closed messaging; cart may show prices but checkout blocked | ☐ |
| 4.4 | Cancel the override | Open again per weekly hours | ☐ |
| 4.5 | Outside weekly hours (or set hours closed today) | Closed message; browse OK; no checkout | ☐ |
| 4.6 | Mark one item sold out mid-browse | That item stops being orderable on next menu load | ☐ |

---

## 5. Kitchen display — staff journey

| # | What to do | What you should see | Result |
|---|---|---|---|
| 5.1 | Open `/kitchen` | Sign-in: staff names + PIN pad | ☐ |
| 5.2 | First tap (name or key) | Audio unlock gesture done (needed for alerts) | ☐ |
| 5.3 | Wrong PIN several times | Lockout / clear error (not a silent failure) | ☐ |
| 5.4 | Sign in with staff PIN | Board loads; your name shown | ☐ |
| 5.5 | Place a paid customer order | New card appears on the board | ☐ |
| 5.6 | New order alert | Audible chime (on a real device after unlock) | ☐ / — |
| 5.7 | Read the card | Order number, items, modifiers, note, times readable at a glance | ☐ |
| 5.8 | Advance to **Ready** | Card moves to Ready; customer ready notification fires (if configured) | ☐ |
| 5.9 | Mark **Picked up** | Leaves active board appropriately | ☐ |
| 5.10 | Cancel an order from kitchen (if allowed for role) | Confirm step; order cancelled; no longer cooked as live | ☐ |
| 5.11 | Leave board idle with an unacked order | Escalation styling / alert behavior | ☐ |
| 5.12 | Sign out | Returns to PIN pad; board not usable without PIN | ☐ |
| 5.13 | Reopen within session window | Stays signed in (12-hour kitchen session) unless signed out | ☐ |
| 5.14 | Swan kiosk: PWA full screen, wake, pin, audio | Per kitchen runbook | ☐ / — |

---

## 6. Admin — sign-in and roles

| # | What to do | What you should see | Result |
|---|---|---|---|
| 6.1 | Open `/admin` signed out | Redirected to sign-in | ☐ |
| 6.2 | Sign in as owner | Dashboard | ☐ |
| 6.3 | Wrong password ×5 | 15-minute lock (distinct from “wrong password”) | ☐ |
| 6.4 | Staff account tries `/admin` | Cannot use back office | ☐ |
| 6.5 | Manager vs owner | Manager cannot open Staff / tax-sensitive controls reserved for owner | ☐ |
| 6.6 | Sign out | Session ended | ☐ |

---

## 7. Admin — menu and merchandising

| # | What to do | What you should see on storefront next load | Result |
|---|---|---|---|
| 7.1 | Toggle item **Sold out** / Available | Sold-out state matches | ☐ |
| 7.2 | **Clear all sold-out** | All cleared | ☐ |
| 7.3 | Change a price (`8.79` style) | New price on menu/cart | ☐ |
| 7.4 | Edit placeholder/unverified price | Unverified flag clears for that item | ☐ |
| 7.5 | Deactivate an item | Gone from public menu | ☐ |
| 7.6 | Reactivate | Back on menu | ☐ |
| 7.7 | Upload JPEG/PNG/WebP photo | Thumb / modal / preview look correct | ☐ |
| 7.8 | Remove photo | Photo gone on storefront | ☐ |
| 7.9 | Reject a non-image / huge file | Clear validation error | ☐ |
| 7.10 | Reorder items / categories | Order matches on storefront | ☐ |
| 7.11 | Move item to another category | Appears under the new category | ☐ |
| 7.12 | Edit modifiers / bindings | Item modal options match | ☐ |
| 7.13 | Curate featured & most-ordered | Sections match curation | ☐ |

---

## 8. Admin — store controls

| # | What to do | What you should see | Result |
|---|---|---|---|
| 8.1 | Edit weekly hours; save | Storefront open/closed follows new hours | ☐ |
| 8.2 | Add a closure date | That date closed | ☐ |
| 8.3 | Pause / resume accepting orders | Immediate effect | ☐ |
| 8.4 | Post announcement (+ optional start/end) | Shows / lapses as scheduled | ☐ |
| 8.5 | Edit closed / paused / prep phrasing | Banner wording updates (`{minutes}` replaced) | ☐ |
| 8.6 | Create trading override; let expire or cancel | Override applies, then clears | ☐ |
| 8.7 | Accepting-orders off **while** an “open anyway” override exists | Switch wins — still not accepting | ☐ |

---

## 9. Admin — orders, money, print, jobs

| # | What to do | What you should see | Result |
|---|---|---|---|
| 9.1 | Open **Orders** (today) | Latest paid test orders listed | ☐ |
| 9.2 | Search by order number / name / phone | Finds the right order | ☐ |
| 9.3 | Open order detail | Lines, modifiers, tip, tax, total, payment, status history | ☐ |
| 9.4 | **Full refund** (sandbox or prod) | Succeeds; remaining refundable updates; recorded with your user | ☐ |
| 9.5 | **Partial refund** | Partial amount only; cannot exceed remaining | ☐ |
| 9.6 | Refund after Ready | Still works; kitchen/admin status coherent | ☐ |
| 9.7 | **Reprint kitchen** | Job queued; ticket marked REPRINT (on paper if printer live) | ☐ / — |
| 9.8 | **Reprint counter** | Same idea for customer receipt | ☐ / — |
| 9.9 | Cancel from admin | Order cancelled; kitchen reflects it | ☐ |
| 9.10 | Dashboard printer “last polled” | Fresh during service if printer configured | ☐ / — |
| 9.11 | Dead jobs > 0 | Jobs screen shows error; Retry / bulk retry works | ☐ |
| 9.12 | **Reports** for today | Order counts and money match the orders you placed | ☐ |

---

## 10. Admin — staff (owner)

| # | What to do | What you should see | Result |
|---|---|---|---|
| 10.1 | Create a staff user + PIN | PIN shown **once**; can sign in on `/kitchen` | ☐ |
| 10.2 | Create a manager | Can use `/admin` (limited); kitchen PIN works | ☐ |
| 10.3 | Deactivate a user | Cannot sign in; historical orders still attributable | ☐ |
| 10.4 | Reset PIN | New PIN works; old PIN does not | ☐ |
| 10.5 | Two people cannot share the same active PIN | Enforced | ☐ |

---

## 11. One order — seven surfaces must agree

Pick **one** paid order with modifiers + a note + a tip. Compare:

| Surface | Money | Items / modifiers | Times / order # | Result |
|---|---|---|---|---|
| 11.1 Storefront confirmation | | | | ☐ |
| 11.2 ~~SMS~~ (removed Sprint 18) | — | — | — | — |
| 11.3 Email receipt (if configured) | | | | ☐ / — |
| 11.4 Kitchen ticket (paper) | | | | ☐ / — |
| 11.5 Counter receipt (paper) | | | | ☐ / — |
| 11.6 Kitchen display card | | | | ☐ |
| 11.7 Admin order detail | | | | ☐ |

If any column disagrees, mark ❌ and note which surfaces disagree.

---

## 12. Edge cases (still end-user visible)

| # | What to do | What you should see | Result |
|---|---|---|---|
| 12.1 | Two people order at once | Distinct order numbers; both on kitchen board; both print (if live) | ☐ |
| 12.2 | Item sells out between quote and pay | Clear unavailable error; no silent wrong charge | ☐ |
| 12.3 | Store closes / pause between quote and pay | Order blocked with clear reason | ☐ |
| 12.4 | Very long customer note | Still readable on kitchen card / ticket | ☐ |
| 12.5 | High quantity on one line | Prices and kitchen card still correct | ☐ |
| 12.6 | Ampersand names (Mac & Cheese, etc.) | Display / print not truncated oddly | ☐ |
| 12.7 | Go offline mid-kitchen session | Board behavior is understandable (no silent empty board that looks “fine”) | ☐ |

---

## 13. Printer failure drills (on-site only)

For each, note: what kitchen sees · what admin sees · whether a manager alert fired · how it recovered.

| # | Failure | Result / notes |
|---|---|---|
| 13.1 | Out of paper | ☐ / — |
| 13.2 | Cover open | ☐ / — |
| 13.3 | Printer powered off | ☐ / — |
| 13.4 | Network loss | ☐ / — |

---

## 14. Suggested “happy path” script (do this once end-to-end)

Use as a single continuous story before a shift.

1. Admin: confirm accepting orders; clear sold-outs you don’t want; post a short announcement.  
2. Customer: browse → add 2–3 items (one with modifiers + note) → tip preset → pay.  
3. Kitchen: hear/see new order → cook → Ready → customer gets ready message (if configured) → Picked up.  
4. Admin: open the same order → confirm money and lines → reprint kitchen once → full refund the test order.  
5. Customer: try ordering again while you pause accepting orders → confirm blocked → resume.  

| # | Script completed cleanly | Result |
|---|---|---|
| 14.1 | Full happy path above | ☐ |

---

## Sign-off

| Field | Value |
|---|---|
| Date | |
| Tester name(s) | |
| Environment | ☐ Sandbox / laptop · ☐ Production |
| Base URL | |
| Device(s) | ☐ Desktop · ☐ iPhone · ☐ Android · ☐ Kitchen tablet · ☐ Printer |
| Overall verdict | ☐ Ready for staff dry run · ☐ Ready for go-live · ☐ Not ready |
| Blockers found | |

---

## Related docs

- Back office how-to: [`ADMIN-OPERATOR-GUIDE.md`](./ADMIN-OPERATOR-GUIDE.md)
- Kitchen device setup: [`KITCHEN-KIOSK-RUNBOOK.md`](./KITCHEN-KIOSK-RUNBOOK.md)
- Printer: [`PRINT-RUNBOOK.md`](./PRINT-RUNBOOK.md)
- Wallets (HTTPS): [`WALLET-VERIFICATION-CHECKLIST.md`](./WALLET-VERIFICATION-CHECKLIST.md)
- Launch inventory: [`LAUNCH-BLOCKERS.md`](./LAUNCH-BLOCKERS.md)
