# System review

The source of truth for how the product behaves, one document per module. Read the module's document before
changing it, and update it in the same pull request. Template: [_template.md](_template.md). Rules:
[SDLC-GUIDE.md, 7.7](../../SDLC-GUIDE.md#77-docssystem-reviewnn-modulemd-how-a-module-behaves).

## Marks

Every statement carries one mark:

- **[confirmed]**: intended behaviour, said by the owner or the team;
- **[observed]**: seen in the running product or a real request, not yet confirmed as intended;
- **[tested]**: held by an automated test (name it);
- **[code]**: read in the code, not run;
- **[question]**: looks wrong, or two parts disagree; listed under "Questions" and in the index.

When a question is answered, write the answer into the review, re-mark the statement, and remove the question
from `docs/README.md`.

## Modules

| # | Module | Code it covers |
|---|---|---|
| 01 | [Menu and storefront browsing](01-menu-storefront.md) | `apps/web/src/app/(storefront)/` (home, menu), `components/storefront/` (except checkout parts), `lib/cart-context.tsx`, `/api/v1/menu*`, `/api/v1/store/status`, `/api/v1/media/*`; `packages/db/src/repositories/menu.ts`, `store.ts`, `menu-cache.ts`, `trading-state.ts`, `mappers/`; `packages/mock-api/` |
| 02 | [Checkout and payments](02-checkout-payments.md) | `/checkout`, `/api/v1/quote`, `/api/v1/orders`, `/api/v1/webhooks/nmi`; `apps/web/src/lib/checkout*.ts`, `webhooks-nmi.ts`, `payment-methods.ts`, `retry-lockout.ts`, `order-key.ts`; `packages/pricing/`, `packages/payments/`; `packages/db/src/repositories/orders.ts`, `order-numbers.ts`, `payment-attempts.ts` |
| 03 | [Order status and customer email](03-order-status-email.md) | `/order/[lookupToken]`, `/api/v1/orders/status/*`; `packages/email/`; `packages/notify/src/handlers.ts`, `templates-email.ts` |
| 04 | [Kitchen display](04-kitchen-display.md) | `/kitchen`, `/api/internal/kitchen/*`; `components/kitchen/`, `lib/kitchen-*.ts`; `packages/db/src/staff-auth.ts`, `kitchen-*.ts`, `order-status.ts`, `pin.ts` |
| 05 | [Printing](05-printing.md) | `/api/v1/print/*`; `lib/sdp-*.ts`, `print-sweeper.ts`, `print-ops.ts`; `packages/print/`; `packages/db/src/print-jobs.ts` |
| 06 | [Admin: menu and store](06-admin-menu-store.md) | `/admin/menu`, `/categories`, `/modifiers`, `/store`; `/api/internal/admin/menu/*`, `/modifiers/*`, `/store/*`; `packages/db/src/admin-menu.ts`, `admin-store.ts`, `admin-trading.ts`; `lib/media/`, `media-sweeper.ts` |
| 07 | [Admin: orders and money](07-admin-orders-money.md) | `/admin` dashboard, `/orders`, `/reports`, `/jobs`; `/api/internal/admin/orders/*`, `/reports*`, `/reconcile`, `/jobs*`, `/print`; `lib/refunds.ts`, `reconcile-scheduler.ts`; `packages/db/src/admin-orders.ts`, `admin-reports.ts`, `admin-dashboard.ts`, `refunds.ts`, `reconcile*.ts`, `scheduled-reconcile.ts` |
| 08 | [SEO](08-seo.md) | `/admin/seo`, `/api/internal/admin/seo`, `app/robots.ts`, `app/sitemap.ts`, `components/seo/`, `lib/seo/`; `packages/db/src/seo.ts` |
| 09 | [Platform](09-platform.md) | `packages/config/`, `packages/types/`, `packages/notify/src/worker.ts`, `registry.ts`; `apps/web/src/middleware.ts`, `instrumentation*.ts`, `lib/startup.ts`, `health.ts`, `job-worker.ts`, `rate-limit.ts`, `admin-auth.ts`, `admin-http.ts`, `admin-route-registry.ts`, `errors.ts`; `packages/db/src/admin-auth.ts`, `admin-staff.ts`, `admin-audit.ts`, `password.ts`, `jobs.ts`, `seed/`; `scripts/` |

Cross-cutting: the order status table (`packages/db/src/order-status.ts`) is described in module 04 and used by 05
and 07. Database schema and migrations are in `packages/db/prisma/`; each module names the tables it owns.

## Status

All nine reviews were written on 2026-11-19 from the code and from the earlier sprint notes now kept in
[../reference/](../reference/). Statements are `[code]` or `[question]`, except those seen in the smoke run of
2026-11-19 ([../runs/2026-11-19-smoke.md](../runs/2026-11-19-smoke.md)), which are `[observed]`. None has been
`[confirmed]` by the owner yet. The test suite passed in full the same day (656 tests), but statements were not yet
mapped to individual tests, so none is marked `[tested]`. The smoke checklist touches each module once; module
checklists do not exist yet.
