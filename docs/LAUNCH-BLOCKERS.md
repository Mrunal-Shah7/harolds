    <!-- SPRINT-13: launch blockers — Phase 1 carry-forward closed; production cutover still gated. -->

    # Launch blockers — Harold's Chicken Oak Lawn

    This is the list to act on before the site takes real orders. It is not a developer punch-list. Items marked **blocks launch** must be resolved or explicitly accepted in writing. Items marked **does not block launch** can go live if you accept the limitation.

    Owner of every business row is **the store**, unless it says **developer**.

    ---

    ## Closed in Sprint 13 (Phase 1)

    | Closed | What changed |
    |---|---|
    | Menu cache invalidation unproven over HTTP | Proven for price, deactivate, sold-out, image attach/remove, reorder, category change; 304 path intact; both cache layers checked. |
    | Restore drill without images | Backup + restore of DB and image directory drilled; restore **2408 ms**; derivatives verified. |
    | Test suite serialised (`--test-concurrency=1`) | Race identified (admin-menu vs admin-reports temporary `s8rep-*` rows); scoped to `itm_*`; concurrency restored. |
    | `cnon:card-nonce-rejected` → INTERNAL_ERROR | Processor payment 404 → `PAYMENT_FAILED` (transport_failure). Misclassification audit recorded. |
    | Wallet verification unprepared | Checklist at [`WALLET-VERIFICATION-CHECKLIST.md`](./WALLET-VERIFICATION-CHECKLIST.md) for Phase 8. |

    ## Closed in Sprint 12

    | Closed | What changed |
    |---|---|
    | Customer storefront absent | Storefront is in this repo: browse, cart, quote, tip, checkout. |
    | Payments not configured on checkout | Root cause was missing `NEXT_PUBLIC_SQUARE_*` at build time. Build now fails without them; production start fails without complete Square config; sandbox card payment produces PAID orders. |
    | No way to upload item photographs | Admin upload → local content-addressed storage → derivatives → storefront. |
    | No temporary trading overrides | Early close / late open / closed rest of day / open anyway, with self-expiry. |
    | Banner messaging hardcoded | Announcement + editable closed/paused/prep phrasing; trading and prep stay derived. |
    | Contract stuck at 1.2.0 | Public contract is **1.3.0** (additive only). |

    **The business can now resolve these without a developer** (enter them in `/admin`):

    - The eight unverified / placeholder prices
    - Missing photographs
    - Real per-item modifier bindings and provisional group replacement
    - Real per-day hours and one-off closures
    - Curated featured and most-ordered lists
    - Temporary early-close / late-open without editing the weekly schedule
    - Storefront announcements and closed/paused wording

    ---

    ## Blocks launch

    | # | Item | Why it blocks | Current state | Who |
    |---|---|---|---|---|
    | 1 | ~~Customer storefront~~ | — | **Resolved in Sprint 12.** | — |
    | 2 | **Ubuntu production server** | Nowhere to run the app, database, or TLS. | Not provisioned. **Sprint 13 Phase 2: absent — Phases 3–10 blocked.** | Store / hosting |
    | 3 | **Registered domain + DNS** | Printer, Square webhooks, wallets, and customers need HTTPS. | Not supplied. **Sprint 13 Phase 2: absent.** | Store |
    | 4 | **Production Square credentials** | Sandbox charges are not real. | This machine is `SQUARE_ENVIRONMENT=sandbox`. | Store / Square Dashboard |
    | 5 | **Twilio + completed A2P 10DLC** | Incomplete registration looks like “sent” while the customer gets nothing. | Vars present; campaign completion not verified → treated as absent. | Store / Twilio |
    | 6 | **Production email + verified sending domain** | Receipts land in spam or are rejected. | `EMAIL_API_KEY` / from address empty. | Store / Resend |
    | 7 | **Eight unverified prices** | Invented beverage/dessert prices. | Still flagged — **business can clear in `/admin` now.** | Store |
    | 8 | **Tip preset sign-off** | Unsigned since Sprint 1. | Not signed. | Store |
    | 9 | **Contact phone** | Shown on public store status. | Placeholder. | Store |
    | 10 | **Manager alert phone and email** | Print failures and unacked orders cannot reach a human. | Placeholders on the development database. | Store |
    | 11 | **Real staff accounts; deactivate test ones** | Test PINs must not be on a live kiosk. | Test accounts only in development. | Store (owner in `/admin/staff`) |
    | 12 | **Decision on third-party ordering platform** | Cutover needs an explicit keep / redirect / retire plan. | Not decided. | Store |

    ---

    ## Does not block launch (accept in writing if still true)

    | # | Item | Why it is not a blocker | Current state | Who |
    |---|---|---|---|---|
    | 13 | Item photographs | Menu works without photos. | Upload path exists; photos until the store uploads. | Store (`/admin` item → photograph) |
    | 14 | Featured / most-ordered lists | Empty lists are valid. | Curated in `/admin/menu/curation`. | Store |
    | 15 | Provisional modifier groups | Kitchen can run if accepted as-is. | Editable in `/admin/modifiers`. | Store |
    | 16 | Exact per-day hours | Ops issue, not a charge issue. | Editable in `/admin` Store. | Store |
    | 17 | Workbook CONFLICT / DUPLICATE? / REVIEW rows | Confusing names, not invented prices beyond the eight. | Unresolved since Sprint 1. | Store |
    | 18 | Printer failure drills | Behaviour coded; physical confirmation outstanding. | Not run on the TM-m30III. | Kitchen + developer |
    | 19 | Physical ticket with modifiers | Layout tested; paper outstanding. | — | Kitchen |
    | 20 | Android audio unlock + Swan kiosk | Runbook exists; device not on hand. | — | Kitchen + developer |
    | 21 | Independent uptime monitor | Needs a domain. | — | Developer after domain |
    | 22 | Apple Pay / Google Pay / Cash App | Need HTTPS + domain registration with Square. | Checklist ready ([`WALLET-VERIFICATION-CHECKLIST.md`](./WALLET-VERIFICATION-CHECKLIST.md)); blocked until domain. | Developer after domain |

    ---

    ## What we will not do

    - Deploy with sandbox Square credentials.
    - Invent a domain or a server.
    - Go live with unregistered SMS.
    - Charge a real card until production credentials exist.

    When items 2–12 are supplied, continue Sprint 13 Phases 3–10 using [`DEPLOYMENT.md`](./DEPLOYMENT.md) and [`CUTOVER-PLAN.md`](./CUTOVER-PLAN.md). See [`SPRINT-13-NOTES.md`](./SPRINT-13-NOTES.md).
