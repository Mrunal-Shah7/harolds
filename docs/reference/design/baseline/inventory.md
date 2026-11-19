<!-- SPRINT-14: Phase 1.1/1.2 — customer storefront screen/state inventory and component
     blast-radius map. This is the regression baseline the Phase 9 walk is compared against. -->

# Sprint 14 — Phase 1 inventory

## Capability note, stated once and not repeated

This repository has **no browser, no Playwright/Puppeteer, no Lighthouse binary**. Every state
below was enumerated by reading the code paths that produce it, not by visiting it. The
"Screenshot" column is therefore `BLOCKED` for every row. Phase 1.1's screenshot requirement and
the LCP/CLS/Lighthouse half of Phase 1.3 **cannot be satisfied here**, and Gate 1 is recorded as
FAILED on those two checks rather than downgraded to a pass. No image, number, or measurement in
this sprint's deliverables is estimated or invented.

---

## 1.1 Screen and state inventory

Route column is the route as it exists **before** Sprint 14. Sprint 14 adds `/menu` as a
presentation split of the current single-page storefront; the pre-sprint states for it are the
same rows marked `/`.

| # | Route | State | How it is reached | Screenshot |
|---|---|---|---|---|
| 1 | `/` | Menu loaded, store open | `GET /api/v1/menu` + `/store/status` both 200, `isOpen && acceptingOrders` | BLOCKED |
| 2 | `/` | Store closed — schedule | store-status returns `isOpen:false` with `closedMessage` from schedule | BLOCKED |
| 3 | `/` | Store closed — trading override | active override; `closedMessage` names the override | BLOCKED |
| 4 | `/` | Store closed — accepting-orders switch off | `isOpen:true, acceptingOrders:false` -> `notAcceptingMessage` | BLOCKED |
| 5 | `/` | Announcement active | `status.announcement` non-null | BLOCKED |
| 6 | `/` | Announcement absent | `status.announcement` null (today: a reserved empty row — a defect, see Findings) | BLOCKED |
| 7 | `/` | Announcement expired | announcement past its expiry; two cache layers per Sprint 13 §1.1 | BLOCKED |
| 8 | `/` | Empty menu | all categories empty -> "The menu isn't available right now." | BLOCKED |
| 9 | `/` | Menu fetch failure | `fetch` rejects in the server component | BLOCKED |
| 10 | `/` | Most-ordered list populated | `GET /api/v1/menu/most-ordered` non-empty (**not rendered pre-sprint**) | BLOCKED |
| 11 | `/` | Most-ordered list empty | same endpoint empty -> section hidden (Phase 5.1) | BLOCKED |
| 12 | `/` | Item with no photograph | `imageUrl`/`imageDerivatives` null -> placeholder tile | BLOCKED |
| 13 | `/` | Item with photograph | derivatives present | BLOCKED |
| 14 | `/` | Sold-out item | `item.isSoldOut` | BLOCKED |
| 15 | `/` | Category rail / sticky tabs, scroll-spy active | IntersectionObserver sets `activeId` | BLOCKED |
| 16 | modal | Item with no modifier groups (**the common case — ~79 items unbound**) | `GET /api/v1/menu/items/:id` -> `modifierGroups: []` | BLOCKED |
| 17 | modal | Item with one required group | `isRequired && minSelect >= 1` | BLOCKED |
| 18 | modal | Item with several groups | multiple groups | BLOCKED |
| 19 | modal | Priced modifiers | `option.priceDeltaCents != 0` | BLOCKED |
| 20 | modal | Sold-out modifier option | `option.isSoldOut` | BLOCKED |
| 21 | modal | Loading options | request in flight | BLOCKED |
| 22 | modal | Option load error | request rejects | BLOCKED |
| 23 | modal | Required group unsatisfied (button disabled) | `missingRequired.length > 0` | BLOCKED |
| 24 | cart | Empty | `lines.length === 0` | BLOCKED |
| 25 | cart | One line | single line | BLOCKED |
| 26 | cart | Many lines, high quantities | quantity up to 50/line | BLOCKED |
| 27 | cart | Line with modifiers and a note | `optionLabels`, `customerNote` | BLOCKED |
| 28 | cart | Quantity reduced below 1 -> removal | `updateQuantity(key, 0)` | BLOCKED |
| 29 | `/checkout` | Empty cart guard | `lines.length === 0` -> "Your cart is empty." | BLOCKED |
| 30 | `/checkout` | Quote loading | `quoteLoading` | BLOCKED |
| 31 | `/checkout` | Quote loaded, orderable | `quote.orderable` | BLOCKED |
| 32 | `/checkout` | Quote blocked — store closed | `blockingReasons` includes `STORE_CLOSED` | BLOCKED |
| 33 | `/checkout` | Quote blocked — not accepting | `STORE_NOT_ACCEPTING_ORDERS` | BLOCKED |
| 34 | `/checkout` | Validation reasons — availability | `reason.isAvailability` | BLOCKED |
| 35 | `/checkout` | Validation reasons — fixable | `!reason.isAvailability` | BLOCKED |
| 36 | `/checkout` | Tip: no tip selected (**the pre-sprint default**) | `tip === undefined` | BLOCKED |
| 37 | `/checkout` | Tip: each configured preset | `tip.presetIndex = 0..n` from `status.tipPresetsBps` | BLOCKED |
| 38 | `/checkout` | Tipping disabled | `status.tippingEnabled === false` -> section absent | BLOCKED |
| 39 | `/checkout` | Card form loading | Square SDK not yet ready | BLOCKED |
| 40 | `/checkout` | Card form ready | `card.attach` resolved | BLOCKED |
| 41 | `/checkout` | Payments not configured | missing `NEXT_PUBLIC_SQUARE_*` | BLOCKED |
| 42 | `/checkout` | Wallet available (Apple / Google / Cash App) | Square returns an instance per method | BLOCKED |
| 43 | `/checkout` | Wallet unavailable | Square returns null / insecure origin | BLOCKED |
| 44 | `/checkout` | Submitting | `submitting` | BLOCKED |
| 45 | `/checkout` | Outcome: declined | `PAYMENT_DECLINED` | BLOCKED |
| 46 | `/checkout` | Outcome: failed / processor rejection | `PAYMENT_FAILED` | BLOCKED |
| 47 | `/checkout` | Outcome: store closed at submit | `STORE_CLOSED` on create | BLOCKED |
| 48 | `/checkout` | Outcome: tokenisation error | Square `tokenize` non-OK | BLOCKED |
| 49 | `/order/[token]` | Confirmation, paid | successful create -> redirect | BLOCKED |
| 50 | `/order/[token]` | Order not found / bad token | lookup 404 | BLOCKED |
| 51 | any | Offline | network unavailable | BLOCKED |

**51 states across 4 routes.**

---

## 1.2 Component inventory and blast radius

The finding that governs Critical rule 4:

> **`@/components/ui/*` is imported by storefront files only.** Admin and the kitchen display do
> not consume a single shared primitive. Each is a self-contained stylesheet
> (`app/(admin)/admin.css`, `app/(kitchen)/kitchen.css`) with its own hardcoded palette and its
> own `.adm-*` / `.kds-*` class namespace.

Verified with:

```
grep -rn "@/components/ui" apps/web/src --include=*.tsx --include=*.ts
```

which returns 7 hits, all under `components/storefront/` or `app/(storefront)/`.

**The blast radius of Phase 3 is therefore not the three surfaces — it is the storefront alone,
plus exactly one leak vector:** `app/globals.css` is imported by the *root* layout, so it applies
to all three route groups. Both `.adm-root` and `.kds-root` set their own `background` and
`color`, which insulates them from token changes, but the pre-sprint
`@layer base { * { @apply border-border } }` universal selector reaches admin and kitchen
elements. That rule is the one thing in this sprint that can visibly change admin or the KDS, and
it is handled in Phase 2.1.

| Component | File | Storefront | Admin | KDS |
|---|---|---|---|---|
| `Button` | `components/ui/button.tsx` | yes | no | no |
| `Badge` | `components/ui/badge.tsx` | yes | no | no |
| `Dialog` | `components/ui/dialog.tsx` | yes | no | no |
| `Sheet` | `components/ui/sheet.tsx` | yes | no | no |
| `StorefrontHeader` | `components/storefront/header.tsx` | yes | no | no |
| `StoreStatusBanner` | `components/storefront/store-status-banner.tsx` | yes | no | no |
| `CategoryNav` | `components/storefront/category-nav.tsx` | yes | no | no |
| `ItemCard` | `components/storefront/item-card.tsx` | yes | no | no |
| `ItemModal` | `components/storefront/item-modal.tsx` | yes | no | no |
| `CartSheet` | `components/storefront/cart-sheet.tsx` | yes | no | no |
| `MenuBrowser` | `components/storefront/menu-browser.tsx` | yes | no | no |
| `SquarePaymentForm` | `components/storefront/square-payment-form.tsx` | yes | no | no |
| `AdminApp` + admin views | `components/admin/*` | no | yes | no |
| Kitchen board + views | `components/kitchen/*` | no | no | yes |
| `ClientErrorReporter` | `components/ClientErrorReporter.tsx` | yes | yes | yes (root layout) |
| `app/globals.css` | stylesheet | yes | yes (inherited) | yes (inherited) |
| `app/(admin)/admin.css` | stylesheet | no | yes | no |
| `app/(kitchen)/kitchen.css` | stylesheet | no | no | yes |

**Shared set (the Critical rule 4 surface): `app/globals.css` and `ClientErrorReporter` only.**

The 13 shadcn primitives named in `design.md` §6.2 that do **not** exist in this codebase:
`input`, `label`, `select`, `textarea`, `separator`, `skeleton`, `sonner`, `table`, `tabs`,
`switch`, `alert`, `dropdown-menu`, `form`. Phase 3.1 says "restyle the permitted list"; a
component that does not exist cannot be restyled. Sprint 14 creates only those the redesigned
storefront actually renders and leaves the rest uncreated rather than scaffolding dead code —
`design.md` §6.2 is a permission list, not a manifest.

---

## Findings carried into later phases

1. **`store-status-banner.tsx` renders a reserved empty announcement row** when no announcement is
   active. `design.md` §7.5 requires the strip to be **absent entirely** — "never a zero-height
   element, never a placeholder". Fixed in Phase 4.3.
2. **Client-computed money in two places**: `cart-sheet.tsx` and `checkout/page.tsx` both render
   `line.item.basePriceCents * line.quantity` as a line total. `design.md` §7.7 forbids it and
   Phase 6.2 requires it removed. These are base prices only — they ignore modifier surcharges, so
   the figure shown can already differ from the quote today. This is a live defect, not just a
   design one.
3. **Checkout requires four fields** (first name, last name, phone, email) plus SMS consent as an
   optional checkbox. `design.md` §7.10 and §9.3 claim phone is the only required field. Critical
   rule 5 forbids changing the required set, so the **code stays and `design.md` is amended**.
4. **The item modal's live footer price is client-computed** (`unitPriceCents * quantity`). This is
   permitted: `design.md` §7.6 explicitly requires "Add to cart · $14.99 ... updates live". §7.7's
   prohibition is on the **cart and checkout totals**, which must come from the server quote. The
   distinction is recorded so a later reader does not "fix" the modal.
5. **`.kds` (the §5.2 dark scope) is a new, unconsumed scope.** The live KDS uses `.kds-root` with
   a palette that contradicts §5.2 outright (light `#efe6c9` cards on `#12100c`). Phase 2.1
   declares the `.kds` tokens as instructed; nothing consumes them until Sprint 15.
