# Back office guide — Harold's Chicken Oak Lawn

This is for the owner and managers. You do not need a developer for anything on this list.

Open the back office at `/admin` on a laptop or your phone. Kitchen staff should keep using the kitchen display, not this.

---

## Signing in

1. Go to `/admin/signin`.
2. Enter your email and password.
3. You stay signed in for four hours, then you sign in again.

If you type the password wrong five times, the account locks for 15 minutes. That is not the same as a wrong password — wait, then try again.

Staff accounts cannot sign in here. They use the kitchen display with a PIN.

Sign out when you walk away from a laptop in the office.

---

## Marking an item sold out

1. Open **Menu**.
2. Find the item. You can filter by category or type part of the name.
3. Tap **Available**. It becomes **Sold out**.

The storefront picks this up on the next menu load. You do not need to open the item.

At the start of the next day, tap **Clear all sold-out**.

---

## Editing a price

1. Open the item from the menu list.
2. Type the price in dollars, like `8.79`. Do not type cents.
3. Save.

If the item was one of the placeholder beverage or dessert prices, saving a new price clears the “unverified” flag on that item only.

---

## Changing hours

1. Open **Store**.
2. Edit the seven days. Use 24-hour times like `11:00` and `21:00`. Check **Closed** for a day the store is shut.
3. Save hours.

To close a holiday, add a **closure date**. That date is closed even if the weekly hours say open.

---

## Pausing ordering

On **Store**, uncheck **Accepting orders**. Put a short message in **Not-accepting message** (for example, the fryer is down). Save.

The storefront stops taking new orders immediately. Check the box again when you are ready. That also takes effect immediately.

This is the control to use when something in the kitchen is broken. It is not the same as marking one item sold out.

---

## Finding an order

**Orders** opens on **today**. Search by order number, name, or phone.

The list shows a name and a redacted phone. Open the order for the rest: lines, modifiers, money, payment, print jobs, texts/emails, and who moved the status.

---

## Issuing a refund

On the order:

1. Tap **Full refund** or **Partial refund**.
2. Read the amount.
3. Confirm.

The refund talks to Square. Until Square confirms, treat it as pending — do not tap it again. The remaining refundable amount is on the screen. You cannot refund more than that.

Every refund is recorded with your name.

---

## Reprinting a ticket

**Reprint kitchen** sends the original kitchen ticket again with a reprint marker. If the line does not notice the marker, they may cook the order twice. Confirm only when you mean it.

**Reprint counter** reprints the customer receipt the same way.

---

## Checking whether the printer is working

Open **Dashboard**.

- Each printer shows when it last polled. During trading hours, more than about two minutes is stale — the printer is not talking to us.
- Queued and failed job counts sit on the same card.

If a paid order has no tickets, open **Jobs & print** and use the repair path from that order, or ask whoever has the Jobs screen to run print repair for the order id.

---

## Dead jobs on the dashboard

A **dead job** is a text or email that was supposed to go out and did not. The red number on the dashboard is the thing to look at.

1. Open **Jobs**.
2. Read the last error.
3. **Retry** one job, or **Bulk retry type** after an outage (for example every ready-text after Twilio was down).

Do not ignore a non-zero dead count. Someone was not told their food is ready, or a manager alert never arrived.

---

## Staff (owner only)

Create people with an email, a password, a role, and a PIN.

- **Staff** — kitchen display only.
- **Manager** — this back office, except tax, tips, and staff.
- **Owner** — everything, including tax and staff.

The PIN is shown **once**. Write it down. You can reset a PIN later; you can never look up the old one.

Two people cannot share an active PIN. Deactivate someone who leaves; do not delete them. Revoke their sessions the same day.
