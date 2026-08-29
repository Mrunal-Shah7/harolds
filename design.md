---
name: "Harold's Chicken — Oak Lawn"
version: "1.1"
surfaces: ["storefront", "storefront-dark", "admin", "kitchen"]
status: "brand assets partially resolved — see §9 Open Inputs. Weave (#6) and poster face (#7) closed in 1.1; logo, brand red, photography, tip presets, modifier bindings remain open."
tokens:
  colors:
    # Surfaces — four, not three. The band rhythm depends on all four.
    paper: "#F7F0E1"
    paper-sunk: "#EDE3CF"
    surface: "#FFFFFF"
    roast: "#4A2317"
    roast-deep: "#33170F"
    # Brand
    brand: "#CE1126"
    brand-hover: "#AE0E20"
    brand-tint: "#FBE7E9"
    flame: "#F2B233"
    flame-deep: "#D8951A"
    # Ink
    ink: "#241611"
    ink-muted: "#6B5A50"
    ink-faint: "#72655D"
    ink-on-roast: "#F7F0E1"
    ink-on-roast-muted: "#C4AC9C"
    # Structure
    line: "#E0D3BC"
    line-strong: "#8A7C68"
    line-on-roast: "#6B4432"
    # Interaction wash — the hover/press tint on transparent controls
    wash: "rgb(36 22 17 / 0.05)"
    # Brand-as-text alias. Resolves to `brand` in the light scope and to
    # `sfd-brand-text` in the dark scope. All brand-coloured TEXT routes
    # through this alias; brand-coloured FILLS use `brand` directly.
    brand-text: "var(--color-brand)"
    # Semantic
    open: "#2B7542"
    warn: "#9C5408"
    danger: "#A81321"
    focus: "#1B5FCC"
    # Storefront dark scope (new in 1.1) — opt-in, `.sf-root.dark` only.
    # Re-derives the four light surfaces from the roast family. Admin never
    # uses these. The kitchen scope shares nothing with these.
    sfd-paper: "#211712"
    sfd-paper-sunk: "#19100C"
    sfd-surface: "#2B1F18"
    sfd-ink: "#F7F0E1"
    sfd-ink-muted: "#C9B6A8"
    sfd-ink-faint: "#8F7E72"
    sfd-line: "#3E2F25"
    sfd-line-strong: "#8A7C68"
    sfd-brand-tint: "#3B171C"
    sfd-brand-text: "#EE5B67"
    sfd-open-dot: "#3AA45C"
    sfd-wash: "rgb(247 240 225 / 0.07)"
    # Kitchen display — dark scope
    kds-bg: "#141110"
    kds-card: "#221C19"
    kds-card-raised: "#2E2622"
    kds-ink: "#F7F0E1"
    kds-ink-muted: "#A89A90"
    kds-line: "#3A302B"
    kds-line-strong: "#6E6763"
    kds-open: "#2E7D46"
    kds-danger: "#B73C47"
  texture:
    # Resolved in 1.1 (closed Open Input #6): the weave is zero-asset CSS —
    # two crossed 1px repeating-linear-gradients on a 4px period. No image,
    # no request, no CSP change. If a tiling PNG ever arrives it replaces
    # this one declaration and nothing else.
    weave: "two crossed 1px repeating-linear-gradients, 4px period, 0deg + 90deg"
    weave-ink-light: "rgb(36 22 17 / 0.035)"
    weave-ink-dark: "rgb(247 240 225 / 0.03)"
  spacing:
    base: 4
    scale: [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96]
  typography:
    font-poster: "'Alfa Slab One', Georgia, serif"
    font-display: "'Baloo 2', system-ui, sans-serif"
    font-sans: "Inter, system-ui, sans-serif"
    font-mono: "'JetBrains Mono', ui-monospace, monospace"
    scale:
      poster-xl: "clamp(2.5rem, 9vw, 4.5rem)"
      poster-lg: "clamp(1.875rem, 6vw, 2.75rem)"
      display-lg: "1.75rem"
      display-md: "1.375rem"
      display-sm: "1.125rem"
      body-lg: "1.0625rem"
      body: "0.9375rem"
      body-sm: "0.8125rem"
      label: "0.75rem"
      mono-lg: "1.5rem"
      mono: "0.875rem"
    line-heights:
      poster: 1.05
      display: 1.15
      body: 1.5
  elevation:
    flat: "none"
    card: "0 1px 2px 0 rgb(36 22 17 / 0.06)"
    raised: "0 4px 12px -2px rgb(36 22 17 / 0.10)"
    overlay: "0 16px 40px -8px rgb(36 22 17 / 0.18)"
  radius:
    sm: "6px"
    md: "14px"
    lg: "24px"
    pill: "999px"
  motion:
    fast: "120ms"
    base: "200ms"
    slow: "320ms"
    ease: "cubic-bezier(.2,.8,.2,1)"
  breakpoints:
    sm: "640px"
    md: "768px"
    lg: "1024px"
    xl: "1280px"
    container: "1200px"
---

## 1. Overview & Brand Prose

**Atmosphere Statement:** Loud, warm, and unembarrassed. Harold's is a fifty-year-old South Side chicken shack — red signage, white box, fries under the chicken, mild sauce over everything — and the interface should feel like the storefront, not like software that happens to sell food. Big type, saturated bands of colour, food shot large and close. Confident rather than tasteful. The failure mode to design against is a clean, quiet, well-spaced page that could belong to any restaurant in any city; this one belongs to one restaurant on one street.

**Page Rhythm:** Pages are built from **full-bleed horizontal bands**, not from content floating on a single continuous background. Each band spans edge to edge, carries one surface treatment, and holds one idea. A page reads as a stack of bands: `hero → menu → action → panel → footer`. Bands alternate so that no two adjacent bands share a surface, and every page contains at least one `roast` band, because the deep brown is what stops the page reading as beige. Content inside a band is constrained to the container width; the band's colour is not.

**Hero voice** (new in 1.1): the house hero pattern is three stacked `poster-xl` lines with **exactly one line in `brand-text`** — red spent once, in type, rather than on a component. This is guidance for hero composition, not a constraint on every band header.

**Density by surface:** the storefront is spacious and poster-like — a customer decides in ninety seconds on a phone. Admin is dense and data-first — a manager scans tables on a laptop. The kitchen is enormous and high-contrast — a cook reads it from two metres with their hands full. One token set, three densities, and each surface declares its own scope class: `.sf-root`, `.adm-root`, `.kds-root`.

**The storefront additionally carries an opt-in dark scheme** (new in 1.1): the `.sf-root.dark` scope defined in §2.1. It is a customer preference on one surface, not a theme system. Admin has no dark mode. The kitchen's dark scope is a different surface, not a theme, and shares nothing with the storefront's.

---

## 2. Colors & Semantic Logic

**Intent & Boundaries:** Four surfaces carry the design, and the whole system depends on all four being used. `paper` is the page. `surface` is anything that holds a product. `roast` is emphasis — the band that breaks the page and the button you most want pressed. `brand` is the accent, spent rarely and deliberately.

**Background Rules:**

* Use `paper` for the default band and as the page canvas beneath everything.
* Use `paper-sunk` for recessed strips — category rails, table zebra, totals blocks — where a region should read as set *into* the page rather than laid on top of it.
* Use `surface` (white) **exclusively** for cards, modals, sheets, and inputs. White is the signal that something is a discrete, interactive object; a white full-bleed band is prohibited.
* Use `roast` for emphasis bands, the primary wide call-to-action, and the footer. **Every storefront page must contain at least one `roast` region.**
* Use `roast-deep` only for the footer's lower block and for nested surfaces inside a `roast` band.
* Use `brand` for accent only: the active tab underline, badges, the cart count, destructive controls. **`brand` is never a page or band background** — a full red band competes with the food and with the store-closed state, both of which need red to mean something.
* Use `flame` as a fill and a rule, never as text on a light surface.

**Text Contrast:**

* `ink` on `paper`, `paper-sunk`, and `surface` — the default. Never on `roast`.
* `ink-muted` for descriptions and metadata on light surfaces only.
* `ink-faint` for placeholders and disabled text. Never for anything a customer needs to read to order.
* `ink-on-roast` and `ink-on-roast-muted` are the **only** text colours permitted on `roast` and `roast-deep`. Putting `ink` on brown is the most likely accidental contrast failure in this system.
* **All brand-coloured text routes through the `brand-text` alias** (new in 1.1), which resolves to `brand` in the light scope and `sfd-brand-text` in the dark scope. `brand-text` is permitted on `surface` and `paper` (and their dark equivalents) only, and only for short accent strings — never for body copy, never on `roast`. Brand-coloured *fills* (buttons, badges, the cart count) use `brand` directly and do not change in dark.
* On the kitchen board, `kds-ink` and `kds-ink-muted` only, and `kds-ink-muted` is prohibited for modifiers (see §6).

### 2.1 The storefront dark scope (new in 1.1)

`.sf-root.dark` swaps the resolved values of the light tokens inside the storefront scope and nothing else. It is implemented as a custom-property override at the scope root — components never branch on theme; they consume the same semantic tokens and the scope decides what those resolve to.

**Surface mapping:** `paper → sfd-paper`, `paper-sunk → sfd-paper-sunk`, `surface → sfd-surface`, `ink → sfd-ink`, `ink-muted → sfd-ink-muted`, `ink-faint → sfd-ink-faint`, `line → sfd-line`, `line-strong → sfd-line-strong`, `brand-tint → sfd-brand-tint`, `brand-text → sfd-brand-text`, `wash → sfd-wash`. The sunk/paper relationship is preserved: sunk is darker than the page in both schemes.

**What does not change:** `roast`, `roast-deep`, `ink-on-roast`, `ink-on-roast-muted`, `line-on-roast`, `flame`, `brand` as a fill, `focus`, and the semantic set. Roast bands keep their light-scheme values and still function as the band that breaks the page — in dark they read as the warmer, redder block against the near-black page, and the band rhythm survives intact.

**Dark-specific rules:**

* **Shadows are dropped in the dark scope**; borders carry depth, as on the kitchen board. Elevation tokens still exist but resolve to none on `.sf-root.dark` cards and the header.
* Raw `#CE1126` fails text contrast on the dark surfaces — this is exactly why `brand-text` exists. Never place `brand` as text in the dark scope.
* The weave texture inverts to `weave-ink-dark` light hairlines.
* The store-status open dot lifts to `sfd-open-dot`; badge washes recompute against the dark surfaces (`open` on ~25% green wash, `warn` text in `flame`, `danger` text in `sfd-brand-text` on `sfd-brand-tint`).
* The tip control's pressed state, `roast`-filled in light, moves to a `flame` fill with `ink` text in dark — roast-on-dark-card is too quiet to read as selected.
* Photography and the placeholder initial tiles render unchanged; the initial's ink lifts to a light wash.

**Behaviour** (deliberate, stated here so no sprint has to guess): light is the default. The scheme does not consult `prefers-color-scheme`; it changes on the explicit header toggle only. The choice persists in `localStorage` under the key `hc:theme` with the single value `"dark"` (absent means light), is read once before first paint by an inline script at the document root so a returning dark-mode customer never sees a light flash, and is cleared by nothing except the customer toggling back. This is presentation state — it is, with the cart, one of exactly two things the storefront persists client-side, and it must never gate, alter, or accompany any request, payload, or total.

**Texture:** `paper` and `paper-sunk` carry the subtle CSS weave defined in the frontmatter — two crossed 1px repeating hairlines on a 4px period at `weave-ink-light` (light) or `weave-ink-dark` (dark). It is the difference between cream and *paper*. Applied as a background layer on band roots only — never on cards, never on `roast`, never on the kitchen board. Zero-asset by construction (Open Input #6 closed): no image request, no CSP implication.

**Colour never carries meaning alone.** Every state that uses colour also carries text or a shape: the store pill has a dot *and* the reason, badges are text-first, the kitchen age bar prints its elapsed minutes beside it, and the theme toggle carries a text label beside its switch.

---

## 3. Typography Hierarchy

Four faces, four distinct jobs. All open-source, all self-hosted as Latin-subset WOFF2 with `display: swap` and preload. **No external font origin** — the content security policy carries `font-src 'self'` and is not to be widened.

| Face | Role | Where |
|---|---|---|
| **Alfa Slab One** (`font-poster`) | Poster. Heavy Americana slab, one weight | Hero headlines, band section headers, the wide CTA label |
| **Baloo 2** (`font-display`) 600/700/800 | Display. Rounded, chunky, warm | Item names, prices, buttons, modal titles, kitchen card headers |
| **Inter** (`font-sans`) 400/500/600 | Body and UI | Everything else. `tabular-nums` on all numeric columns |
| **JetBrains Mono** (`font-mono`) 500/700 | Utility | Order numbers, the ticket chip, PINs, kitchen timers, admin IDs |

**Alfa Slab One is confirmed as the shipped poster face** — Open Input #7 closed in 1.1 with sign-off. Bevan is not loaded, not subset, and not referenced anywhere.

**Heading Roles:**

* `poster-xl` — `h1`, one per page, hero band only. Uppercase, `letter-spacing: -0.01em`, line-height `poster`.
* `poster-lg` — `h2`, band section headers (`OUR MENU`, `MOST ORDERED`). Uppercase. This is the tier that gives the page its voice; do not substitute `display-lg` because a heading felt loud.
* `display-lg` / `display-md` — `h3`, card and modal titles, kitchen card headers. **Sentence case** — "Half dark with mild sauce", never shouted.
* `display-sm` — prices, subtotals, category tabs, button labels.
* `label` — uppercase, `letter-spacing: 0.08em`, for eyebrows, badges, and table headers only.

**Line Heights:** poster type at 1.05, display at 1.15, body at 1.5. Never set body copy tighter than 1.5; never set poster type looser than 1.1, because loose heavy type reads as an accident.

**Rules:**

* Uppercase is reserved for poster tiers and `label`. Product names are never uppercase.
* Prices are `font-display` 700 with `tabular-nums`, in `ink` — **not** in `brand` or `brand-text`. Red is for actions.
* No italics anywhere. No text-shadow. No letter-spacing on body copy.
* Descriptions clamp to two lines with a real ellipsis, never a gradient fade.
* On the kitchen board the whole scale steps up one stop, and nothing below `body` is permitted.

---

## 4. Layout Density & Spacing

**Base Grid:** every margin, gap, and padding value comes from the 4px scale in the frontmatter. No arbitrary values, no `gap-[13px]`.

**Bands:** the structural primitive. A band is full-bleed, has one surface treatment, and pads `64` top and bottom on desktop, `40` on mobile. Its content is capped at `container` and centred. Adjacent bands never share a surface. A band never carries a shadow — bands meet edge to edge, and the colour change *is* the boundary.

**Density States:**

* **Storefront** — spacious. Cards pad `20` on desktop, `16` on mobile. Grid gutters `20` / `12`. Product grid is 1 column below `sm`, 2 at `sm`, 3 at `lg`. Page margin `16` on mobile.
* **Admin** — dense. Table cells pad `12`/`16`, `body-sm` default, rows separated by 1px `line` rules with `paper-sunk` zebra at 40%. Money and times are `tabular-nums`, right-aligned, and **never wrap**.
* **Kitchen** — enormous. Card padding `20`, minimum touch target 64×64, minimum 16 between targets, no element below `body`.

**Responsive Breakpoints:** mobile-first, with the storefront's primary target a 390px viewport. Layout snaps at `sm 640`, `md 768`, `lg 1024`, `xl 1280`; the content container maxes at `1200`. Admin is verified at 1024, 1280, and 1440. The kitchen board is landscape-only at the tablet's native viewport and must tell the user to rotate rather than reflowing into portrait.

**Reserved space:** every image, price, and status has its box before it has its value. All product imagery is a reserved 4:3 box via `aspect-ratio` plus `object-cover`. Cumulative layout shift on the menu page is zero, and that is a gate, not an aspiration.

**Z-index, exhaustive:** `sticky-header 100`, `sticky-tabs 90`, `cart-bar 110`, `overlay 200`, `toast 300`. Nothing else declares one.

---

## 5. Elevation & Depth

**Shadow Hierarchy:** shadows lift interactive objects off paper. They are not decoration and they never soften a layout.

* `elevation.flat` — bands, footers, and anything full-bleed. Bands are never raised.
* `elevation.card` — resting cards and sticky bars.
* `elevation.raised` — hover and pressed states on cards, and the header once scrolled past 8px.
* `elevation.overlay` — modals, sheets, and dropdowns only.

**On `roast` surfaces, shadows are replaced by a 1px `line-on-roast` border.** A brown shadow on a brown band is invisible and costs paint time.

**In the storefront dark scope, shadows are dropped** (new in 1.1) and 1px `sfd-line` borders carry depth. A dark shadow on a near-black page is invisible; this mirrors the kitchen rule for the same reason.

**On the kitchen board, shadows are prohibited entirely** and replaced by `kds-line-strong` borders. Shadows do not read on a dark board and they cost frames on modest tablet hardware.

**No gradients, no glass, no backdrop blur, anywhere, on any surface.** Depth in this system comes from four flat surface colours meeting each other.

---

## 6. Component Blueprints

### Band
Full-bleed section wrapper. Props: `surface` (`paper` | `paper-sunk` | `roast` | `roast-deep`) and `textured` (boolean, light-family surfaces only — including their dark-scope equivalents). Renders its own vertical padding and its own container. **Every page section is a Band.** A section rendered as a plain `div` with margins is a defect.

### Buttons
| Variant | Fill | Text | Border | Use |
|---|---|---|---|---|
| `primary` | `brand` | white | none | The one action. Add to cart, Pay, Advance |
| `poster` | `roast` | `ink-on-roast` | none | The wide band CTA. `font-poster`, uppercase, `radius.pill`, full container width up to 560, centred |
| `secondary` | transparent | `ink` | 1.5px `ink` | Add + on cards, Cancel |
| `ghost` | transparent | `ink-muted` | none | Tertiary, table row actions |
| `danger` | transparent | `danger` | 1.5px `danger` | Refund, cancel. Always confirmed |

Heights `sm 36` / `base 44` / `lg 52` / `poster 60` / `kds 64`. All `radius.pill`. Hover shifts to `brand-hover` or lightens `roast` by 6% over `motion.fast`, and transparent variants tint with `wash`; active scales to `0.98`. Labels name the outcome — **Pay $18.40**, not "Submit"; **Mark ready**, not "Update status".

The `poster` variant is the reference site's widest, most confident element and the storefront's signature control. Use it once per page, in its own band. On `roast` bands it fills `brand` instead, since roast-on-roast is invisible.

### Cards
`surface` white, `radius.md`, 1px `line`, `elevation.card`. On a `roast` band, the border becomes `line-on-roast`. In the dark scope, shadowless with `sfd-line`. Cards never nest.

**Product card anatomy**, in order: reserved 4:3 image; name in `display-md` sentence case; description in `body` `ink-muted` clamped to two lines; a modifier hint in `body-sm` when the item has groups; then a footer row with the price in `display-sm` `ink` on the left and a `secondary` "Add +" on the right. A badge slot sits top-right of the image.

**The badge slot carries availability, not dietary information** — the system has no nutrition data and must not imply it. **The third line carries a modifier hint, not a calorie count**, for the same reason.

The whole card is the tap target and opens the item modal. The Add button adds directly **only** when the item has no required modifier groups, and opens the modal when it has any.

**Sold out:** image at 45% opacity, `Sold out` badge in the slot, the button replaced by the static word `Unavailable`, card not tappable, **and still in the grid.** A customer looking for something that isn't there should find out, not wonder.

### Corner badge
A `brand` square anchored to the top-right of a hero or card image, `label` type in white. Square, not a ribbon. Reserved for `New` and `Sold out`. Two per page maximum, or it stops meaning anything.

### Ticket chip — the signature
Order numbers render as a stamped ticket: `font-mono`, uppercase, `letter-spacing 0.12em`, on `paper-sunk` with a 1px dashed `flame` rule inset 4px and **true notched corners** (refined in 1.1): the chip is a `clip-path` octagon with 8px corner cuts, and the dashed rule is a `::before` at `inset: 4px` clipped to a matching 6px-cut octagon so the rule follows the notch. `mono-lg` on the storefront confirmation and the kitchen card, `mono` in admin tables.

It is **one parameterised component** rendering identically on the storefront confirmation, the kitchen display card, and the admin order detail — the same order, recognisable across every surface that shows it. It is the only place a dashed border is permitted.

### Board leaders (new in 1.1)
A dotted rule — 2px dotted `line-strong` — binding an item or line label to its `tabular-nums` price, the way a physical menu board does. **Totals and receipt contexts only:** the checkout order summary, the checkout totals block, and the admin order-detail totals. Never in product cards, tables, navigation, or anywhere a price is not being formally stated.

Dots, never dashes — the dashed border stays exclusive to the chip. The chip and the board leaders are the only two system elements, and each earns its place by encoding how this system actually works: the ticket, and the board that sets every price. Nothing else decorative is permitted.

### Category rail and sticky tabs
Rail (home): horizontally snap-scrolling pill tiles on a `paper-sunk` band, each with a category image in a white circle and a `label` beneath. Chevrons on pointer devices only, no visible scrollbar.

Tabs (menu): the same categories as a sticky bar under the header. Active is `display-sm` in `brand-text` with a 3px `brand` underline; inactive is `ink-muted`. Scroll-spy sets active; tapping scrolls to the section **with the sticky offset accounted for**, derived from one shared measurement rather than three independent constants. The active tab auto-scrolls into view.

### Header
**Four elements, no more** (amended in 1.1): wordmark, store status pill, theme toggle, cart with count. Sticky, `surface`, `elevation.raised` once scrolled (borders in dark).

**Store status pill:** `paper-sunk` fill, `radius.pill`, `body-sm`. Open shows an `open` dot (`sfd-open-dot` in dark) and the prep estimate. Closed shows a `danger` dot and **the reason exactly as the server returns it** — "Closed until 11:00", never a generic "Closed", never a reason computed on the client. Tapping opens a sheet with today's hours.

**Theme toggle** (new in 1.1): a pill with a **text label and a 34×20 switch — never icon-only**. The label names the outcome of pressing: it reads `Dark` in the light scheme and `Light` in the dark scheme. Border 1.5px `line-strong`; the switch track fills `flame` when dark is active. Storefront only — admin and the kitchen render no such control. Behaviour per §2.1.

### Announcement strip
Full-width, `flame` at 18% mixed over the page surface (which makes it self-adapting in dark), 1px `flame` rules top and bottom, `body-lg`, centred, dismissible per session. **Absent entirely when no announcement is active** — not a zero-height element, not a placeholder.

### Empty States
Centred within the band: a `display-md` line naming what would be here, one `body` line of context, and — only where an action exists — a single `primary` button. **No illustration, no icon.** Where a section has no content and no action, the section is **hidden entirely** rather than rendered empty; an empty carousel is worse than no carousel.

### Modal / Sheet
Dialog at `md` and above, bottom sheet below. Portals **inherit the scope class of the surface that opened them, including `.dark`** — a portal hardcoded to one surface renders admin dialogs in storefront tokens, kitchen dialogs in light tokens on a dark board, and a light modal over a dark storefront.

Item modal: full-bleed 4:3 image, name, description, modifier groups, quantity stepper, note field, sticky footer with live price and the primary button reading `Add to cart · $14.99`. Group headers state their rule ("Choose 1", "Choose up to 3", "Optional"). An unsatisfied required group disables the button and shows its rule in `danger` **only after a first submit attempt** — a form that is red before it is touched teaches people to ignore red.

### Cart
Mobile: sticky bottom bar above the safe area, appearing only when non-empty. Desktop: sheet from the right. Line items show name, modifiers in `body-sm` `ink-muted`, stepper, and quantity.

**No monetary figure is computed in the browser, anywhere, ever.** The storefront quotes at checkout; the cart therefore lists contents and count, and checkout states the cost. If a running cart total is wanted, it is a debounced server quote scoped to cart mutations and it is planned as the behaviour change it is.

### Tip control (stated explicitly in 1.1)
A pill group of the configured presets; presets and the default selection are business inputs and are never moved by design work. Pressed state fills `roast` with `ink-on-roast` in the light scheme, and `flame` with `ink` in the dark scheme.

### Kitchen order card
`kds-card`, 1px `kds-line-strong`, no shadow. A **6px left age bar** encodes elapsed time since payment — `kds-open` under 5 minutes, `flame` from 5 to 12, `kds-danger` beyond — **with the elapsed minutes always printed beside it.**

Contents in order: ticket chip, elapsed time, item lines, modifiers, note, one full-width action. **Modifiers render in `kds-ink` at full weight, never muted** — a modifier is the difference between the right and the wrong plate, and it must not be quieter than the item it modifies. The customer note gets a `flame`-bordered block.

One primary action per card at 64 high, naming the next state: Start → Mark ready → Picked up. Destructive actions behind a long-press or overflow, never adjacent to the primary. **No card scrolls** — it expands or truncates with a count. **No hover states** — there is no pointer.

### Admin shell and tables
Sidebar in `paper-sunk`, active item in `brand-tint` with a 3px `brand` left bar. Tables per §4. Every destructive confirmation **restates the consequence with real values** — "Refund $18.40 to the customer's card for HC-042" — binds to the row that opened it including across a background refresh, and requires an explicit button, never the Enter key. **No autosave anywhere**; a price that changes because a manager tabbed through a field is a real financial event. The unverified-price flag is a `warn` badge in the table and a banner on the item form.

### Imagery
The media pipeline emits **`thumb` 128, `modal` 640, `preview` 320 — one file each, no 2x, `fit: inside`, no cropping.** Therefore:

* Product cards use **`modal` (640)**, not `thumb` — the card image is full-width 4:3, roughly 358 CSS px at a 390px viewport, and `thumb` would be visibly soft.
* There is **no `srcset`**. A single `src` inside `<picture>` with a WebP source and the original-format fallback.
* The 4:3 is a **layout reservation**, not a pipeline crop. The pipeline does not crop.
* `loading="lazy"` below the fold, `fetchpriority="high"` on the hero.
* Items without a photograph render a `paper-sunk` tile at the reserved ratio with the item's initial in `font-poster` at 40% `ink-faint` (a light wash in dark). Not a camera icon, not stock photography.

---

## 7. Interactive States

**Hover & Focus:** every interactive element shows a 2px `focus` outline at 2px offset on keyboard focus, and it is **never removed** — including inside portalled overlays, which mount outside their surface's scope root unless explicitly given it. Focus is blue on purpose: a red ring on a red-accented interface is invisible to the people who most need it, and it holds contrast on both schemes and the kitchen board.

Hover raises cards to `elevation.raised` and lifts 2px over `motion.fast` (border-colour shift instead, in dark). Buttons shift fill; transparent variants tint with `wash`. Nothing hovers on the kitchen board.

**Loading Indicators:** a button entering a loading state disables, replaces its label with a centred spinner and the present-tense verb ("Paying…"), and **does not change width**. Content loads behind skeletons dimensioned to the exact final content — a skeleton of the wrong height reintroduces the layout shift the reserved ratios eliminated.

**The five states.** Every list and panel defines all five; a missing state is an incomplete component.

| State | Treatment |
|---|---|
| Loading | Skeleton at exact final dimensions. Never a spinner for content |
| Empty | Per the Empty States blueprint. Section hidden if there is no action |
| Error | What failed, in plain words, and a retry that retries. No status codes reach a customer |
| Offline | Persistent `warn` bar, last known data retained, writes disabled with an explanation |
| Partial | Stale data is labelled stale with its age, never silently mixed with fresh |

**Theme switching** (new in 1.1): the class flip is instantaneous — no cross-fade, no transition on surface colours, which on a class swap produces a smear of every element animating independently. The persisted key is read before first paint per §2.1 so no flash occurs on load. Every screenshot-based regression check runs in both schemes.

**Motion:** `fast` for hover, focus, and press; `base` for modals, sheets, and the tab underline; `slow` for the cart bar and toasts. All motion sits inside `@media (prefers-reduced-motion: no-preference)`; the kitchen's late-order pulse becomes a static bar under reduced motion. **No scroll-triggered animation anywhere** — people are ordering food, not reading a portfolio.

**Voice.** Sentence case except poster tiers and `label`. Active voice. Say *Pay $18.40*, not "Submit"; *We couldn't load the menu. Try again.*, not "Oops!"; *Enter a 10-digit mobile number*, not "Invalid input"; *Sold out*, not "Item unavailable"; *Closed until 11:00*, not "Store is currently closed". The vocabulary is fixed across every surface and every message: **order, order number, pickup, ready, picked up, sold out, refund.** Not "collection", not "complete", not "out of stock".

---

## 8. Anti-Patterns (Do's and Don'ts)

* 🚫 **Un-tokenised values.** No hex, `rgb()`, `hsl()`, font stack, pixel radius, or duration in any component. No Tailwind default palette classes (`bg-gray-*`, `text-slate-*`). The gate is a grep across the whole application, excluding only the token declaration file, returning nothing.
* 🚫 **Sections that are not Bands.** A page section rendered as a plain container with vertical margins breaks the page rhythm that §1 defines.
* 🚫 **A page with no `roast` band.** Without it the page is beige, and beige is the failure this specification exists to prevent.
* 🚫 **`brand` as a band or page background.** Red is an accent and a state; a red band destroys both.
* 🚫 **White full-bleed bands.** White means "discrete object" in this system.
* 🚫 **`ink` on `roast`.** Use `ink-on-roast`.
* 🚫 **Raw `brand` as text in the dark scope.** Brand-coloured text goes through `brand-text`, everywhere, in both schemes.
* 🚫 **Components that branch on theme.** A component reads semantic tokens; the scope resolves them. `if (dark)` in a component is a defect.
* 🚫 **Gradients, glassmorphism, backdrop blur, and decorative illustration.** Depth is four flat surfaces.
* 🚫 **Pill radius on structural containers.** `radius.pill` is for controls; `radius.lg` is the maximum for anything that holds content.
* 🚫 **Fixed-height content containers.** Blocks adapt via Flex or Grid. The only reserved dimensions are image ratios and skeletons.
* 🚫 **Client-computed money.** Anywhere, for any reason.
* 🚫 **Colour carrying meaning alone.**
* 🚫 **Icon-only buttons** other than cart, close, and back — the theme toggle carries its text label. No emoji in product UI.
* 🚫 **Carousels of one item**, or of items that do not exist.
* 🚫 **Toasts for anything the person must act on.**
* 🚫 **Dark mode on admin, and ad-hoc dark theming anywhere.** (Amended in 1.1.) The storefront's dark scheme is the `.sf-root.dark` scope defined in §2.1 and nothing else — one scope, one token set, one toggle. The kitchen's dark scope remains a different surface, not a theme, and never shares a token with the storefront's.
* 🚫 **Dashed borders outside the chip; dotted rules outside the board leaders' stated contexts.**
* 🚫 **UI for features that do not exist.** No login, no delivery toggle, no store locator, no deals, no search, no loyalty, no scheduling. The product is pickup-only, guest-checkout-only, ASAP-only, one location. Adopting a visual pattern from a reference is correct; adopting a *feature* from one is how an interface starts lying.

---

## 9. Agent Instructions

**System Prompt Core:** You are an expert design-engineer working on a live restaurant ordering system that takes real payments. Read this specification in full before executing any code command. Every colour, size, radius, duration, and component behaviour comes from the tokens and blueprints above. A component that hardcodes a value is a defect regardless of how it looks.

**Enforcement Clause:** Where a requested layout conflicts with the band rhythm, the spacing scale, or the four-surface logic, **structural consistency wins**. Where this specification and the shipped code disagree, one of them is wrong and it must be resolved in writing — amend this file in the same change that alters the code. This file describes what ships, not what was intended.

**Live-system clause:** this system is in production. Presentation work changes no request, payload, total, state machine, validation rule, message, or timing. Any change that appears to require one is a change to this specification instead. Payment-path work is never presentation work and never travels in a design sprint. **The single behaviour addition 1.1 authorises** is the theme toggle of §2.1 — a `localStorage` read/write and a class flip, tested as the deliberate behaviour change it is, touching no request and no payload.

**Accessibility floor**, non-negotiable and verified rather than assumed: body text ≥ 4.5:1 and large text and control boundaries ≥ 3:1, **measured per token pair in both storefront schemes** and re-measured whenever a token moves — the dark pair table must be computed and pass before the dark scheme ships; visible focus on every interactive element; full keyboard operation of the storefront and admin with focus trapped and returned by every overlay; ≥ 44px touch targets on the storefront and ≥ 64px on the kitchen; alt text on every image; status changes announced through a polite live region; `prefers-reduced-motion` respected everywhere.

**Performance floor:** self-hosted subset WOFF2 only, no external font origin, no widening of the content security policy; derivatives only, per the imagery blueprint; zero cumulative layout shift on the menu page in both schemes; the weave is CSS and stays CSS unless the texture asset ships; no backdrop blur, large shadows, `filter` animation, or continuous animation on the kitchen board.

**Surface scoping:** `.sf-root` (with the optional `.dark` modifier resolved per §2.1), `.adm-root`, `.kds-root`. Shared primitives resolve tokens from the scope they render inside, portals inherit the scope — including `.dark` — of whatever opened them, and no universal selector reaches across scopes. The `sfd-*` tokens exist only inside `.sf-root.dark`; the `kds-*` tokens exist only inside `.kds-root`; neither set is ever referenced by the other or by admin.

### Open Inputs

Unresolved business inputs. Build against the documented placeholder; do not block, and do not silently invent a value. Numbering is stable across versions — closed inputs stay in the table, marked closed, because sprints reference them by number.

| # | Input | Status / placeholder in use |
|---|---|---|
| 1 | Logo, SVG, horizontal + mark | Open — text wordmark in `font-poster`, `brand-text` on the page surface |
| 2 | Official brand red | Open — `#CE1126`, declared in exactly one place (the dark scope's `sfd-brand-text` is derived from it and moves with it) |
| 3 | Food photography, shot to fill a 4:3 frame | Open — `paper-sunk` initial tile |
| 4 | Signed-off tip presets | Open — existing configured values; default selection unchanged |
| 5 | Modifier bindings for the unbound majority of the menu | Open — modal renders correctly with zero groups |
| 6 | Paper weave texture asset, 128px tiling | **Closed in 1.1** — zero-asset CSS weave per frontmatter; a shipped PNG may later replace the one declaration |
| 7 | Poster face confirmation: Alfa Slab One vs Bevan | **Closed in 1.1** — Alfa Slab One, signed off |

### On adoption

1.1 is **additive over 1.0**: no token is renamed or removed, no light-scheme value changes, and every 1.0-compliant component remains compliant. What 1.1 adds must land whole, not partially:

* The **dark scope** ships as one unit — all `sfd-*` tokens, the `brand-text` alias, the toggle, the persistence, the pre-paint read, and the recomputed dark contrast table — or not at all. A storefront with the toggle but without the alias puts raw red text on near-black, which is the exact failure the alias exists to prevent.
* The **board leaders** and the **chip construction** are independent of the dark scope and of each other; either may ship alone.
* The contrast table must be recomputed for every dark pair before the dark scheme ships, and every screenshot-based regression baseline gains a dark counterpart for the storefront.
* Nothing in 1.1 touches admin or the kitchen. Their token sets, scopes, and rules are byte-for-byte those of 1.0.

---

## 10. Changelog

**1.0 → 1.1** (all six previewed and approved in the v1.1 HTML design file):

1. **Weave texture** resolved as zero-asset CSS (two crossed 1px hairlines, 4px period) — Open Input #6 closed. Inverts to light hairlines in dark.
2. **Board leaders** added: dotted `line-strong` rules binding labels to prices in totals/receipt contexts only. Second and final system element beside the chip; dots never dashes.
3. **Ticket chip construction** made literal: clip-path octagon with 8px notches, dashed flame rule following the notch at a 6px cut.
4. **Alfa Slab One** confirmed as the poster face — Open Input #7 closed. Bevan removed from consideration.
5. **Hero voice** stated: three stacked poster lines, exactly one in `brand-text`.
6. **Storefront dark scheme** added (amends §8's prohibition, storefront only): `.sf-root.dark` scope, `sfd-*` tokens, `brand-text` alias, light default, manual header toggle (text + switch, four-element header), persisted in `localStorage` under `hc:theme`, read before first paint, no `prefers-color-scheme`. Admin stays light; the kitchen scope is untouched and isolated.
