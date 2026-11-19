# Smoke checklist

_2026-11-19. A quick pass over the whole product on a local server: health, the storefront, a sandbox order through
the kitchen, admin, SEO and sign-out. About 20 minutes. Last run: [2026-11-19](../../runs/2026-11-19-smoke.md)._

**Build and data.** Local dev server (`npx pnpm@9.15.0 dev`) started as [../../testing.md](../../testing.md) says,
with email and Sentry switched off for the run. Local `harolds` database migrated and seeded (`db:seed`). Test
accounts `test-manager@localhost` and `test-staff@localhost` (PINs from `packages/db/src/seed/run.ts`; admin
passwords from the same file). NMI sandbox (`NMI_ENVIRONMENT=sandbox`). The store must be open now, or an
"open anyway" override set first (and put back).

**Settings to put back.** One item's sold-out flag (S-11); any trading override set to open the store.

**Clean-up.** The run creates one sandbox order with a `TEST` name and an `@example.test` email. It is moved to
picked up in the kitchen (S-09) and refunded in admin (S-12). Orders cannot be deleted; the run log records the
order number.

| ID | Who | Do | Expect | Review |
|---|---|---|---|---|
| S-01 | A | `curl -s http://localhost:3000/api/v1/health` | HTTP 200; `checks.database` is `up`, `checks.worker` is `up`, `paymentEnvironment` is `sandbox` | [09](../09-platform.md) How it works, Health |
| S-02 | P | Open `/` | The hero, the category rail and the store status pill render; no error text; the server log has no `error` line for the request | [01](../01-menu-storefront.md) Home |
| S-03 | P | Open `/menu` | Every active category has a section with its items and prices; the tabs scroll to each section | [01](../01-menu-storefront.md) Menu |
| S-04 | P | Add one item with a required modifier to the cart, then reload the page | The cart shows the item, its modifier and a total; after reload the cart still holds it | [01](../01-menu-storefront.md) Cart |
| S-05 | P | Open `/checkout`, fill name `TEST Smoke`, an `@example.test` email, a phone and a ZIP | Subtotal, tax, tip and total are shown in dollars and cents; the card fields load | [02](../02-checkout-payments.md) Quote, Form |
| S-06 | P | Pay with the NMI sandbox approval card | The page moves to `/order/<token>` with an order number; the database shows the order `PAID` with a `PaymentAttempt` | [02](../02-checkout-payments.md) Place order |
| S-07 | D | Query `BackgroundJob` and `PrintJob` for the new order | One `EMAIL_ORDER_RECEIPT` job and one `KITCHEN_TICKET` print job in `QUEUED` exist for it | [03](../03-order-status-email.md) Receipt email, [05](../05-printing.md) Enqueue |
| S-08 | P | Open `/kitchen`, tap Test Staff, enter the PIN | The board shows the new order with its lines and modifiers within 3 seconds | [04](../04-kitchen-display.md) Sign-in, Board |
| S-09 | P | Move the order to in progress, then ready, then picked up | Each step moves the ticket; after picked up it leaves the board; `OrderStatusEvent` has three rows for it | [04](../04-kitchen-display.md) Actions |
| S-10 | A | `curl` the print poll with a wrong secret | HTTP 401 with no serial in the body | [05](../05-printing.md) Rules |
| S-11 | P | Sign in at `/admin/signin` as the test manager; mark one item sold out; check `/menu`; mark it available again | The item shows as sold out on `/menu` after the change, and orderable again after the undo | [06](../06-admin-menu-store.md) Items, Loading and caching |
| S-12 | P | In `/admin/orders` open the test order and refund the full amount | The order shows refunded; `refundedCents` equals `totalCents` | [07](../07-admin-orders-money.md) Refund |
| S-13 | A | `curl` `/robots.txt` and `/sitemap.xml` | Both 200; the sitemap lists `/` and `/menu` | [08](../08-seo.md) Who uses it |
| S-14 | P | Sign out of admin, then open `/admin/orders` | The sign-in page is shown; the orders list is not | [09](../09-platform.md) Admin sign-in |
| S-15 | P | Sign out of the kitchen, then reload `/kitchen` | The roster is shown, not the board | [04](../04-kitchen-display.md) Session |

## YOU

| ID | Why Claude cannot | What the owner does |
|---|---|---|
| Y-01 | Needs the real printer | After a release, place one real order and see the ticket print |
| Y-02 | Needs a real phone with a wallet | Check Apple Pay or Google Pay shows (only if its flag is on in production) |
| Y-03 | Needs a real inbox | Check one real receipt arrives and is not in spam |
