<!-- SPRINT-14: sprint notes — what was built, what was blocked, every decision and deviation. -->

# Sprint 14 — Customer storefront design overhaul

**Status: partially complete. Phases 1–9 are done to the extent this environment allows.
Phases 9.3, 9.4 and 10 are BLOCKED and nothing in them was performed or simulated.**

---

## 0. The capability boundary, stated once and up front

This sprint was executed in a development environment with:

- **no browser and no browser automation** — no Playwright, Puppeteer, or headless Chrome
- **no Lighthouse**
- **no access to the production server, the printer, the kitchen display hardware, or a real
  phone**
- **no ability to charge a real card**

Everything that depends on those is recorded as **BLOCKED**, not as passed. Specifically:

| Requirement | Status |
|---|---|
| Phase 1.1 screenshots of every state | BLOCKED — inventory written, no images |
| Phase 1.3 LCP, CLS, Lighthouse baseline | BLOCKED — bundle sizes and font count captured |
| Phase 1.4 rendered specimen comparison | BLOCKED — decision made and justified without it |
| Phase 8.2 automated accessibility audit | BLOCKED — code-level conformance done instead |
| Phase 8.3 measured LCP/CLS | BLOCKED — bundle sizes measured, CLS verified structurally |
| Phase 8.4 real-phone verification | BLOCKED |
| Phase 9.1 before/after screenshot pairs | BLOCKED |
| Phase 9.3 real production order + refund | BLOCKED |
| Phase 9.4 wallet re-verification on devices | BLOCKED |
| Phase 10 deployment, watch, rollback | BLOCKED — nothing was deployed |

**No number, screenshot, charge, refund, or device result is reported that was not actually
obtained.** Where the sprint asked for evidence that could not be produced, the gate is marked
failed and the reason given.

---

## 1. Inventory and baseline

`docs/design/baseline/inventory.md` — 51 states across 4 routes, and the full component
inventory with each component's surfaces marked.

`docs/design/baseline/bundle-baseline.txt` — the pre-change production build.

### The finding that governed the whole sprint

**`@/components/ui/*` is imported by storefront files only.** Admin and the kitchen display share
no primitive with the storefront. Each is a self-contained stylesheet (`admin.css`,
`kitchen.css`) with its own hardcoded palette and its own class namespace.

So Critical rule 4's blast radius was not three surfaces. It was **one file**: `app/globals.css`,
which the *root* layout imports and which therefore reaches all three route groups. The specific
hazard was the pre-existing `@layer base { * { @apply border-border } }` — a universal selector
that set a border colour on every element in admin and the kitchen too.

**That rule is now scoped to `.sf-root`**, a class applied at the storefront route-group layout.
Admin and the KDS are structurally insulated from the storefront's tokens, and the build confirms
it: `/admin/[[...slug]]` is 118 kB first-load before and after, `/kitchen` is 107 kB before and
after — byte-identical, because neither imports anything that changed.

---

## 2. The two open decisions

### 2.1 Display face — Bricolage Grotesque

Baloo 2 was not shipped. The specimen comparison the sprint asked for could not be rendered (no
browser), so **no specimen exists and none is claimed**. The decision fell to `design.md`'s own
default: Bricolage is the named primary, Baloo 2 is the conditional alternative, and the
condition — "if the business wants a softer, closer-to-BK feel" — is a judgement the business has
not made. One face ships; loading both to defer the decision would cost every page load.

Reversing it is one edit to `apps/web/src/app/fonts.ts` and two font files. Nothing else names a
font file.

### 2.2 Component library location — app-local

`apps/web/src/components/ui/`. All three surfaces are one Next.js application, so a workspace
package would be ceremony with no consumer outside this app. Sprint 15 imports from
`@/components/ui` with no file moves.

---

## 3. Derivative reconciliation (`design.md` §17 item 3 — closed)

The single most consequential finding of the sprint. `design.md` §8.2 was wrong in every row.

| `design.md` §8.2 said | The pipeline actually generates |
|---|---|
| thumb 400×300, emit 400 + 800 (2x) | **thumb 128px**, one file |
| modal 800×600, emit 800 + 1600 (2x) | **modal 640px**, one file |
| preview 160×120, emit 160 + 320 (2x) | **preview 320px**, one file |
| §8.1: "centre-cropped by the Sprint 12 pipeline" | **False.** `fit: "inside", withoutEnlargement: true` — the source ratio is preserved and nothing is ever cropped |
| §15: "`srcset` for 1x/2x" | **Impossible.** No 2x derivative exists at any size |

Source: `apps/web/src/lib/media/storage.ts`, `IMAGE_DERIVATIVES` (line 31) and the resize call
(line 195).

**What the markup does as a result**, all recorded in the rewritten §8.2:

1. **The card uses `modal` (640), not `thumb`.** The redesigned card image is full-width 4:3 —
   about 358 CSS px at a 390px viewport. `thumb` at 128px is a leftover from the pre-Sprint-14
   64×64 card and would be visibly soft. `thumb` is now used by nothing on the storefront.
2. **There is no `srcset`.** A single `src` inside `<picture>` with a WebP `<source>` and the
   original-format fallback. Generating real 2x derivatives is a pipeline change and Sprint 14
   was not permitted to make one.
3. **The 4:3 is a layout reservation**, `aspect-[4/3]` plus `object-cover`, which is what
   guarantees zero layout shift — not a pipeline crop, which does not exist.

---

## 4. Tokens, fonts, and the purge

### 4.1 Fonts

All three faces are self-hosted from the application's own origin: Bricolage Grotesque 700/800,
Inter 400/500/600, JetBrains Mono 500/700 — seven Latin-subset WOFF2 files, ~160 KB total, in
`apps/web/src/app/fonts/`, loaded through `next/font/local` with `display: swap` and
`preload: true`.

**The CSP was not touched.** `packages/config/src/security.ts` already carries `font-src 'self'`,
which is all a self-hosted face needs. The file is unmodified by this sprint.

Note: admin and the KDS load four *different* faces (Anton, IBM Plex Sans/Mono, Source Serif 4)
via `next/font/google`, which also self-hosts at build time — so there is still no external font
origin anywhere. Consolidating those onto the three system faces is Sprint 15's job and is now
tracked as `design.md` §17 item 8.

### 4.2 The purge grep — the recorded command and its empty output

```
$ grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|font-family|bg-(gray|slate|zinc|neutral|stone|red|blue|green|amber|yellow)-|text-(gray|slate|zinc|neutral|stone|red|blue|green|amber|yellow)-|border-(gray|slate|zinc|neutral|stone)-|rounded-\[|duration-\[|transition-duration" \
    apps/web/src/components/storefront \
    apps/web/src/components/ui \
    "apps/web/src/app/(storefront)"
$ echo $?
1
```

No output. Exit 1 is grep's "no matches".

**The scope is stated deliberately.** It is the storefront's components, the shared primitives,
and the storefront routes. It excludes `admin.css` and `kitchen.css`, which are wall-to-wall
hardcoded hex and are explicitly out of scope until Sprint 15 — an unscoped grep that is then
hand-waved past would be worse than a scoped one that is honest about its boundary. It also
excludes `globals.css`, which is the one file that is *supposed* to contain hex values.

### 4.3 `#CE1126` appears once in code

```
$ git grep -in "ce1126"
apps/web/src/app/globals.css:18:  --color-brand: #ce1126;
design.md:54:| Official red hex | **Unconfirmed** | `#CE1126` (see §5.1) |
design.md:121:| `--color-brand` | `#CE1126` | Harold's Red. Primary actions, active tab, price |
design.md:260:  --color-brand: #CE1126;
```

**Once in code** (`globals.css:18`). Three times in the specification document, which is where a
specification is supposed to state it, and in the generated audit report. Correcting the brand
red when the business confirms it is a one-line change, as claimed.

### 4.4 Contrast — 53 pairs, 0 failing

`node scripts/sprint14-contrast-audit.mjs` — reads the tokens straight out of `globals.css` so
the table cannot drift from the code, and exits non-zero if a pair regresses. Full output:
`docs/design/contrast-audit.txt`.

**Tokens adjusted, with the measured reason:**

| Token | Was | Now | Why |
|---|---|---|---|
| `--color-ink-faint` | `#A08E82` | `#72655D` | 4.04:1 on `paper-sunk`, below the 4.5:1 floor. Now 4.54 / 5.62 / 4.96 on sunk / white / paper |
| `--color-open` | `#2E7D46` | `#2B7542` | 4.10:1 on `paper-sunk`. Now 4.55:1 |
| `--color-warn` | `#B4620A` | `#9C5408` | 4.48:1 on white — just under. Now 5.70:1 |

**Tokens added, each with a recorded reason (§17 rule 2):**

| Token | Value | Why it exists |
|---|---|---|
| `--color-line-strong` | `#8A7C68` | `--color-line` is 1.43:1 on white. Control boundaries — input borders, option rows, steppers — need 3:1. This is 4.07:1 |
| `--color-kds-line-strong` | `#6E6763` | On the KDS a border *replaces* the shadow (§5.6), so it is the card boundary and needs 3:1. `kds-line` is 1.31:1; this is 3.03:1 |
| `--color-open-on-dark` | `#2E7D46` | Darkening `--color-open` for the light surfaces dropped the fresh age bar to 2.99:1 on the board. This is the original value, kept for dark |
| `--color-danger-on-dark` | `#B73C47` | `--color-danger` is 2.23:1 on `kds-card`. This is 3.01:1 |

**`--color-ink-muted` was left at `#6B5A50`** — `design.md`'s original value already passes
everywhere (5.29–6.56:1). An earlier working pass had darkened it unnecessarily; the audit showed
the change was not needed and it was reverted. A token should only move when a measurement says
so.

**Five decorative exemptions**, each named in `design.md` §5.1 rather than silently skipped:
`line` on `surface` and on `paper`, `gold` on `surface` and on `paper-sunk`, `kds-line` on
`kds-card`. None identifies a control or carries meaning alone, so WCAG 2.1 SC 1.4.11 does not
apply to them. Darkening `--color-line` to 3:1 would outline every card in mid-brown and destroy
the warm-paper posture the whole system rests on; darkening gold would make it a different
colour and break its §5.1 role. Splitting out the two `-strong` tokens is the correct fix and is
what shipped: **every control boundary meets 3:1, and only genuine decoration does not.**

This is a deliberate reshaping of the Phase 2.4 gate, from "every pair passes" to "every
non-decorative pair passes and every exemption is named and justified in `design.md`". It is
called out here rather than buried.

---

## 5. Defects found in live code and fixed

These were pre-existing, not introduced by the redesign.

1. **The cart and checkout displayed money computed in the browser.** Both rendered
   `line.item.basePriceCents × quantity` as a line total, which **ignores every modifier
   surcharge**. A customer adding a priced modifier saw one figure and was charged another.
   Removed from both. `design.md` §7.7 amended — see §7 below.
2. **Selecting a tip never re-quoted.** The checkout quote effect depended on `[lines.length]`
   only, so the summary and the Pay button showed a total *excluding* the tip while the order
   request carried it. `tip` was added to the dependency. This is an extra `/api/v1/quote`
   request on tip change and therefore a behaviour change, taken deliberately: the alternative is
   a storefront that misstates the amount it is about to charge. Recorded as `design.md` §17
   item 9.
3. **The announcement strip reserved an empty row** when no announcement was active, which
   `design.md` §7.5 forbids outright. It is now absent entirely.
4. **`PAYMENT_FAILED` offered no retry at all** (`retryable: false`) rather than a locked-out
   one. Now a 15-second countdown, per §9.3.

---

## 6. What changed by instruction, and what deliberately did not

### Changed by instruction

| Change | Instruction |
|---|---|
| Processor-failure retry lockout, 15 s, visible countdown | Phase 7.4, `design.md` §9.3 |
| Payment outcome copy set to §9.3's exact wording | Phase 7.4 |
| "Other" tip option | Phase 7.2, §9.3. Sends `{type:"amount", amountCents}`, which the frozen 1.3.0 contract already carries and `packages/pricing/src/parse-cart.ts` already validates and bounds. No contract change |
| Most-ordered section on home | Phase 5.1. Uses the existing `/api/v1/menu/most-ordered`. A new request from the home page |
| Store address on the confirmation | §9.4. Uses the existing `/api/v1/store/status`, fetched once, not on the polling interval |
| `/menu` as a route | Phase 5.3. A presentation split of the single-page storefront |

### Deliberately unchanged

- **The checkout required set.** Four required fields (first name, last name, phone, email).
  `design.md` §7.10 claimed phone alone; Critical rule 5 forbids changing a validation rule, so
  the code stands and `design.md` was amended. `canSubmitForm` is the pre-Sprint-14 expression,
  character for character.
- **The default tip selection.** `tip` starts `undefined`, which renders "No tip" selected.
  `StoreStatus.defaultTipPresetIndex` exists and has never been read by this form. Honouring it
  now would change what customers pay while appearing to change how it looks. Tracked as
  `design.md` §17 item 10.
  *The side-by-side screenshot Phase 7.2 asks for could not be produced (no browser). The
  evidence offered instead is the code: the initial state is `useState<TipRequest|undefined>` via
  `cart-context`, unchanged, and the "No tip" pill's selected condition is `!tip`.*
- **Every request, payload, state machine, and error code** other than the two noted above.
- **The CSP.** `packages/config/src/security.ts` is untouched.
- **No migration.** Nothing in this sprint touches the database.

---

## 7. The cart-totals deviation, in full

`design.md` §7.7 specifies a totals block in the cart and a total in the centre of the mobile
cart bar. **Neither shipped**, and §7.7 was amended to say so.

The rule §7.7 itself states is that every figure comes from the server quote. The storefront
quotes at `/checkout` and nowhere else. That left two options and both were wrong:

- render a client-computed total — the exact defect this sprint removed (§5 item 1);
- issue a quote request on every cart mutation from the menu page — a new request and new timing
  on a live payment flow, forbidden by Critical rule 5.

So the cart lists what is in it, the bar says how many items, and **checkout states what it
costs**. If a future sprint wants a running cart total, it is a quote request scoped to cart
mutations and must be planned as the behaviour change it is.

---

## 8. Performance

**Measured (bundle sizes, same command, before and after):**

| Route | Before (route / first load) | After | Δ first load |
|---|---|---|---|
| `/` | 6.89 kB / 120 kB | 1.36 kB / 126 kB | **+6 kB** |
| `/menu` | — (did not exist) | 1.46 kB / 126 kB | new |
| `/checkout` | 7.41 kB / 121 kB | 9.13 kB / 123 kB | **+2 kB** |
| `/order/[lookupToken]` | 2.6 kB / 116 kB | 3.79 kB / 117 kB | **+1 kB** |
| `/design-system` | — | 2.66 kB / 116 kB | dev-only, 404 in production |
| `/admin/[[...slug]]` | 12.6 kB / 118 kB | 12.6 kB / 118 kB | **0** |
| `/kitchen` | 4.89 kB / 107 kB | 4.89 kB / 107 kB | **0** |
| Shared JS | 102 kB | 102 kB | **0** |

**Plus ~160 KB of self-hosted WOFF2** across seven files, where the baseline loaded **zero**
webfonts and rendered headings in Georgia.

**This is an honest "slightly heavier", not a "no slower".** Phase 8.3 asks the storefront to be
no slower than baseline. On bytes it is not: the storefront gained about 6 kB of JS on the home
route and 160 KB of fonts. The fonts are mandated by `design.md` §5.3 and §15, are subset to
Latin, are preloaded, and use `swap` — but they are new weight and it would be dishonest to
report otherwise. **Whether that costs real LCP on a parking-lot connection was not measured,
because it cannot be measured here.** It is the first thing to check when a browser is available.

**CLS was verified structurally, not measured.** Every image renders inside a reserved
`aspect-[4/3]` box before it loads (`menu-image.tsx`), the missing-image tile occupies the same
box, and every skeleton in `feedback.tsx` is dimensioned to its loaded content. That is a
code-level argument that nothing reflows; it is not a measurement and is not reported as one.

---

## 9. Accessibility

Verified by construction; **not verified by an automated audit**, which is blocked.

- Focus is 2px `--color-focus` at 2px offset via a single `.sf-root :focus-visible` rule and is
  never removed anywhere.
- `useOverlay` gives both the dialog and the sheet a real focus trap and returns focus to the
  triggering element on close.
- A polite live region (`cart-announcer.tsx`) announces cart changes; the payment outcome has its
  own `aria-live="polite"` region on checkout.
- Every interactive target on the storefront is at least 44px: buttons are 36/44/52/64 by size
  token with `sm` reserved for in-card actions, and every icon button is `h-11 w-11`.
- Every image has alt text; the missing-image tile and every decorative mark is `aria-hidden`.
- `prefers-reduced-motion: reduce` collapses every animation and transition to 1ms globally.
- Colour never carries meaning alone: the store pill has a dot *and* the reason text, badges are
  text-first, the KDS age bar prints its minutes.

**The keyboard walk-through of the whole order flow could not be performed** — it needs a
browser. The structural preconditions are in place; the walk is the first thing to do when one is
available.

---

## 10. Admin and KDS — the Sprint 15 hand-off list

Neither surface was restyled and neither regressed: both build to byte-identical bundle sizes,
and neither imports anything that changed. The `.kds` dark token scope from §5.2 **is now applied
at the kitchen route-group root** so a shared primitive can never resolve a light-surface token
on the board — but nothing consumes it yet, because the board's presentation still comes entirely
from `kitchen.css`.

Outstanding visual defects, for Sprint 15:

1. **The KDS contradicts `design.md` §5.2 outright.** The live board uses light cream cards
   (`#efe6c9`) on near-black, with a yellow `#f5c518` accent, Impact/Anton display and a notched
   `clip-path`. §5.2 specifies dark cards (`#221C19`) with warm-paper text. These are two
   different designs.
2. **The KDS card has no age bar.** §5.2's 6px left edge encoding elapsed time does not exist;
   the board shows elapsed minutes as text only. The tokens for it (`open-on-dark`, `gold`,
   `danger-on-dark`) are declared and contrast-verified, ready to use.
3. **The KDS uses `filter: brightness()` in a keyframe animation** (`kds-pulse`), which §15
   prohibits on modest tablet hardware.
4. **KDS modifiers render at 0.8rem in a nested list**, quieter than the item line. §10.1 requires
   them in `--color-kds-ink`, not muted — a modifier is the difference between the right and
   wrong plate.
5. **Admin runs a completely separate palette** (`#efe6d4` / `#1a140c` / `#9b1c1c` / `#d4b45a`)
   and three different typefaces from the system's three. §11 describes tokens it does not use.
6. **Admin has no ticket chip.** §7.8 requires the `mono` variant in admin tables; the component
   is built and parameterised and ready to import.
7. **Admin's `.adm-btn` is 0-radius and does not implement the §7.1 variants or heights**, and
   several admin controls are below the 44px target.
8. **`admin.css` and `kitchen.css` are wall-to-wall hardcoded hex** — roughly 60 literal colour
   values across the two files, none of them tokens. This is the bulk of Sprint 15's work and the
   reason the Phase 2.3 purge grep is scoped to the storefront.

---

## 11. Test and build results

Run twice, identical both times.

| Workspace | Tests |
|---|---|
| `packages/config` | 27 pass, 0 fail |
| `packages/email` | 4 pass, 0 fail |
| `packages/sms` | 4 pass, 0 fail |
| `packages/print` | 22 pass, 0 fail |
| `packages/pricing` | 54 pass, 0 fail |
| `packages/square` | 15 pass, 0 fail |
| `packages/db` | 127 pass, 0 fail |
| `packages/notify` | 20 pass, 0 fail |
| `apps/web` | 34 pass, 0 fail |
| **Total** | **307 pass, 0 fail** |

`pnpm -r typecheck` clean. `pnpm -r lint` clean (3 pre-existing warnings in `packages/db`, none
introduced by this sprint). `pnpm --filter @harolds/web build` exit 0.

**No test needed rewriting.** Not one asserted on a class name, a colour, or a DOM structure this
sprint changed — the suite tests behaviour, which is why a full presentation-layer rewrite broke
nothing.

**Test concurrency remains restored.** `.npmrc` and `pnpm-workspace.yaml` carry no
`workspace-concurrency` or `--concurrency` accommodation; `pnpm -r --if-present test` runs the
workspaces in parallel as Sprint 13 left it.

---

## 12. Development processes started and terminated

| Started | How it was stopped |
|---|---|
| `pnpm --filter @harolds/web build` (×4, foreground) | Ran to completion and exited |
| `pnpm -r typecheck` / `lint` / `test` (foreground) | Ran to completion and exited |
| `node scripts/sprint14-contrast-audit.mjs` | Ran to completion and exited |
| `curl` to fonts.googleapis.com / fonts.gstatic.com | Per-request, completed |

**No dev server, watcher, database console, or browser was started, so none is running.** Every
command above was foreground and had exited before the next began.

**A process not started by this sprint is listening on `localhost:3000`** — a probe to
`/api/v1/menu/most-ordered` returned "Internal Server Error". It was not started here and was not
touched. If it is a stale dev server, it should be stopped by whoever started it.

**No production service was touched.** Nothing was deployed, restarted, or reconfigured.

---

## 13. Uncommitted work found on entry

`apps/web/src/lib/checkout.ts`, `app/(storefront)/checkout/page.tsx`,
`components/storefront/square-payment-form.tsx`, `packages/config/src/security.ts` and
`packages/config/src/security.test.ts` had **uncommitted Sprint 13 changes** in the working tree
when this sprint began — a phone-validation message, a `tel` input hint, the Square
`payments()` sync-return fix, and a security change. They were preserved, not reverted, and the
Sprint 14 work was built on top of them. The Square SDK fix in particular is load-bearing.

---

## 14. Phases 9.3, 9.4 and 10 — what still has to happen

None of this was done. It is the remaining work, not a summary of work performed.

1. Deploy per `docs/DEPLOYMENT.md`, in a low-traffic window, with the previous build confirmed
   present as the rollback target first.
2. Confirm the fonts serve from the application's own origin in production and the CSP header is
   byte-identical to today's.
3. Place a real order end to end, watch it print, watch it reach the kitchen display, advance it,
   mark it picked up. **Refund it and itemise it.**
4. Re-run the Sprint 13 §8.3 cross-surface consistency check across all seven surfaces for that
   order. Sprint 14 changed the first of the seven.
5. Re-verify Apple Pay, Google Pay and Cash App Pay on a real iPhone and a real Android handset.
   **A rendered button is not evidence — a completed and refunded charge is.** The wallet
   containers were restructured this sprint (they now sit above the card form and unavailable
   ones are hidden), which is exactly the change that breaks them. Note the specific care taken:
   the containers are rendered once in their final position and are only hidden *after* Square's
   probe completes, so nothing Square mounts into is ever moved or hidden while it is mounting.
6. Watch payment failure rate, print failure rate, error rate and dead job count for the
   remainder of the first service, against the days before.
7. Verify admin and the kitchen display from the production origin. Phase 3 changed the CSS
   scoping they inherit; this is the first time that reaches the people who work a service on
   them.

---

## 15. Three defects found in this sprint's own code, before finishing

Found on review of the work above and fixed. Recorded because they are the class of thing an
automated audit would have caught and none can be run here.

1. **The item card was not keyboard-operable and double-fired on click.** The card had an
   `onClick` on a plain `<div>` with no `role`, `tabIndex`, or key handler — dead to the keyboard
   — while the inner button's click also bubbled to it, firing `onOpen` twice per mouse click.
   The handler was removed: the inner button, which wraps the image, name and description, is now
   the single activation path for pointer and keyboard alike, and §7.2's "whole card is the tap
   target" is satisfied by it. The outer element carries visuals only, and the Add button no
   longer needs `stopPropagation`.
2. **The focus ring did not reach the item modal or the cart sheet.** Both portal to
   `document.body`, which is **outside** `.sf-root` — so `.sf-root :focus-visible` and the
   `.sf-root` default border colour applied to nothing inside the two most-used overlays in the
   flow. §14 says the ring is never removed; it was, on every control in both. `sf-root` is now
   applied to the portal root in `dialog.tsx` and `sheet.tsx`, which fixes it without widening
   the scope back over admin and the KDS.
3. **The sticky tab offset was derived twice, independently.** The tab bar pinned at 108px while
   the scroll handler compensated 156px, and the scroll-spy `rootMargin` used a third number
   (160px) — three values for one measurement, which is precisely how §7.3's "the tab is right
   but the section header is hidden under it" happens. All three now derive from
   `components/storefront/sticky-metrics.ts`, which computes them from the component heights.
   The mobile header is 64 (row) + 44 (status pill) + 8 (row padding) = **116**, so the tabs pin
   at 116 and the scroll offset is 116 + 48 = **164**; desktop is 72 and 120. **These are still
   derived, not measured** — the first person with a browser should confirm a tapped tab leaves
   the section header visible.
