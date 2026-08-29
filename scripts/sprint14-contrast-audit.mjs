// SPRINT-14: Phase 2.4 contrast audit. Computes the WCAG 2.1 ratio for every foreground token
// against every surface token it is actually used on, and prints a pass/fail table.
// Run: node scripts/sprint14-contrast-audit.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(path.join(root, "apps/web/src/app/globals.css"), "utf8");

/** Read the token values straight out of globals.css so the table can never drift from the code. */
function tokens() {
  const out = {};
  for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = srgbToLinear((n >> 16) & 255);
  const g = srgbToLinear((n >> 8) & 255);
  const b = srgbToLinear(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const T = tokens();

/**
 * [foreground, surface, requirement, use, exempt?]
 *
 * Requirement per design.md §14: body text 4.5:1, large text and control boundaries 3:1.
 * `exempt: true` marks a pair that is purely decorative under WCAG 2.1 SC 1.4.11 — it does not
 * identify a control and it never carries meaning on its own. Each exemption is named in
 * design.md §5.1 with its reason; none of them is a combination that was quietly avoided in the
 * components. Everything not marked exempt must pass.
 */
const PAIRS = [
  // --- storefront body text, 4.5:1 ---
  ["ink", "paper", 4.5, "Page copy on paper"],
  ["ink", "surface", 4.5, "Card and modal copy"],
  ["ink", "paper-sunk", 4.5, "Totals block, rail labels"],
  ["ink-muted", "paper", 4.5, "Descriptions on paper"],
  ["ink-muted", "surface", 4.5, "Card descriptions, modifier lists"],
  ["ink-muted", "paper-sunk", 4.5, "Totals labels, inactive tab"],
  ["ink-faint", "paper", 4.5, "Helper text on paper"],
  ["ink-faint", "surface", 4.5, "Modifier hint line, Unavailable"],
  ["ink-faint", "paper-sunk", 4.5, "Placeholder text on sunk fills"],
  ["brand", "surface", 4.5, "Price emphasis, active tab, links"],
  ["brand", "paper", 4.5, "Section accents on paper"],
  ["brand", "brand-tint", 4.5, "Selected row text"],
  ["danger", "surface", 4.5, "Payment failure copy"],
  ["danger", "paper", 4.5, "Closure and error copy"],
  ["danger", "paper-sunk", 4.5, "Failure copy on sunk fills"],
  ["danger", "brand-tint", 4.5, "Failed badge"],
  ["open", "surface", 4.5, "Paid badge text"],
  ["open", "paper", 4.5, "Open state copy"],
  ["open", "paper-sunk", 4.5, "Store-open pill text"],
  ["warn", "surface", 4.5, "Degraded notice"],
  ["warn", "paper", 4.5, "Stale-data label"],
  ["warn", "paper-sunk", 4.5, "Degraded chip"],
  ["surface", "brand", 4.5, "Primary button label"],
  ["surface", "brand-hover", 4.5, "Primary button label, pressed"],
  ["surface", "danger", 4.5, "Destructive button label"],
  ["surface", "warn", 4.5, "Warning bar label"],
  ["paper", "ink", 4.5, "Inverted copy on ink"],
  ["ink", "gold", 4.5, "Announcement strip text on gold"],

  // --- control boundaries and meaningful graphics, 3:1 ---
  ["line-strong", "surface", 3, "Input border, secondary control boundary on white"],
  ["line-strong", "paper", 3, "Control boundary on paper"],
  ["line-strong", "paper-sunk", 3, "Control boundary on sunk fills"],
  ["focus", "surface", 3, "Focus ring on white"],
  ["focus", "paper", 3, "Focus ring on paper"],
  ["focus", "paper-sunk", 3, "Focus ring on sunk fills"],
  ["brand", "paper-sunk", 3, "Active tab underline"],
  ["brand", "surface", 3, "Cart count badge fill boundary"],

  // --- decorative, exempt (SC 1.4.11 does not apply; reason recorded in design.md §5.1) ---
  ["line", "surface", 3, "Card outline / divider on white — decorative rule, no control", true],
  ["line", "paper", 3, "Divider on paper — decorative rule, no control", true],
  ["gold", "surface", 3, "Ticket chip dashed rule — decoration; the chip reads from its mono text", true],
  ["gold", "paper-sunk", 3, "Ticket chip rule on its own fill — decoration", true],

  // --- KDS dark scope (declared in Phase 2.1, consumed in Sprint 15) ---
  ["kds-ink", "kds-bg", 4.5, "Board text"],
  ["kds-ink", "kds-card", 4.5, "Card text"],
  ["kds-ink", "kds-card-raised", 4.5, "Selected card text"],
  ["kds-ink-muted", "kds-card", 4.5, "Secondary card text"],
  ["kds-ink-muted", "kds-bg", 4.5, "Column headers"],
  ["kds-line-strong", "kds-card", 3, "Card boundary — replaces the shadow on dark (§5.6)"],
  ["kds-line-strong", "kds-bg", 3, "Board rules"],
  ["gold", "kds-card", 3, "Working age bar"],
  ["open-on-dark", "kds-card", 3, "Fresh age bar"],
  ["open-on-dark", "kds-bg", 3, "Fresh age bar against the board"],
  ["danger-on-dark", "kds-card", 3, "Late age bar"],
  ["danger-on-dark", "kds-bg", 3, "Late age bar against the board"],
  ["kds-line", "kds-card", 3, "Internal hairline inside a card — decorative", true],

  // --- SPRINT-17: storefront DARK theme. design.md §16.3 was lifted for the storefront only;
  //     the same floor applies, and it is verified here rather than assumed.
  ["ink-dark", "paper-dark", 4.5, "Dark: page copy"],
  ["ink-dark", "paper-sunk-dark", 4.5, "Dark: totals block, rails"],
  ["ink-dark", "surface-dark", 4.5, "Dark: card and modal copy"],
  ["ink-muted-dark", "paper-dark", 4.5, "Dark: descriptions on paper"],
  ["ink-muted-dark", "paper-sunk-dark", 4.5, "Dark: totals labels, inactive tab"],
  ["ink-muted-dark", "surface-dark", 4.5, "Dark: card descriptions, modifier lists"],
  ["ink-faint-dark", "paper-dark", 4.5, "Dark: helper text"],
  ["ink-faint-dark", "paper-sunk-dark", 4.5, "Dark: placeholders on sunk fills"],
  ["ink-faint-dark", "surface-dark", 4.5, "Dark: modifier hint, Unavailable"],
  ["brand-dark", "paper-dark", 4.5, "Dark: section accents, links"],
  ["brand-dark", "paper-sunk-dark", 4.5, "Dark: active tab on sunk"],
  ["brand-dark", "surface-dark", 4.5, "Dark: price emphasis, active tab"],
  ["brand-dark", "brand-tint-dark", 4.5, "Dark: selected row text"],
  ["danger-dark", "paper-dark", 4.5, "Dark: closure and error copy"],
  ["danger-dark", "surface-dark", 4.5, "Dark: payment failure copy"],
  ["danger-dark", "brand-tint-dark", 4.5, "Dark: failed badge"],
  ["open-dark", "paper-dark", 4.5, "Dark: open state copy"],
  ["open-dark", "paper-sunk-dark", 4.5, "Dark: store-open pill text"],
  ["open-dark", "surface-dark", 4.5, "Dark: paid badge text"],
  ["warn-dark", "paper-dark", 4.5, "Dark: stale-data label"],
  ["warn-dark", "paper-sunk-dark", 4.5, "Dark: degraded chip"],
  ["warn-dark", "surface-dark", 4.5, "Dark: degraded notice"],
  ["gold", "surface-dark", 4.5, "Dark: announcement strip text is ink; gold reads as text here"],
  // The primary button keeps the LIGHT brand fill in dark mode is wrong — it uses brand-dark as
  // its fill, so the label must be the dark page colour, not white.
  // The Button primary variant is `bg-brand text-surface`, so on dark the label resolves to
  // --color-surface-dark. That is the pair to verify, not the page colour.
  ["surface-dark", "brand-dark", 4.5, "Dark: primary button label on its fill"],
  ["surface-dark", "brand-hover-dark", 4.5, "Dark: primary button label, pressed"],
  ["surface-dark", "danger-dark", 4.5, "Dark: destructive button label on fill"],
  ["line-strong-dark", "paper-dark", 3, "Dark: control boundary on paper"],
  ["line-strong-dark", "paper-sunk-dark", 3, "Dark: control boundary on sunk"],
  ["line-strong-dark", "surface-dark", 3, "Dark: input border on card"],
  ["focus-dark", "paper-dark", 3, "Dark: focus ring on paper"],
  ["focus-dark", "paper-sunk-dark", 3, "Dark: focus ring on sunk"],
  ["focus-dark", "surface-dark", 3, "Dark: focus ring on card"],
  ["surface-dark", "paper-dark", 1, "Dark: card plane against page — separation carried by the border, not luminance", true],
  ["line-dark", "surface-dark", 3, "Dark: decorative divider inside a card", true],
  ["line-dark", "paper-dark", 3, "Dark: decorative divider on paper", true],
];

let failures = 0;
const rows = [];
for (const [fg, bg, need, use, exempt] of PAIRS) {
  const a = T[fg];
  const b = T[bg];
  if (!a || !b) {
    console.error(`MISSING TOKEN: --color-${fg} or --color-${bg}`);
    failures += 1;
    continue;
  }
  const r = ratio(a, b);
  const pass = r >= need;
  if (!pass && !exempt) failures += 1;
  rows.push({ fg, bg, a, b, need, r, pass, use, exempt: Boolean(exempt) });
}

const w = (s, n) => String(s).padEnd(n);
console.log(
  `${w("foreground", 16)}${w("surface", 18)}${w("fg hex", 10)}${w("bg hex", 10)}${w("need", 6)}${w("ratio", 8)}${w("", 6)}use`,
);
console.log("-".repeat(110));
for (const r of rows) {
  console.log(
    `${w("--color-" + r.fg, 16)}${w("--color-" + r.bg, 18)}${w(r.a, 10)}${w(r.b, 10)}${w(r.need + ":1", 6)}${w(r.r.toFixed(2) + ":1", 8)}${w(r.exempt ? "EXEMPT" : r.pass ? "PASS" : "FAIL", 8)}${r.use}`,
  );
}
console.log("-".repeat(110));
const exemptCount = rows.filter((r) => r.exempt).length;
console.log(`${rows.length} pairs, ${exemptCount} decorative exemptions, ${failures} failing.`);
process.exit(failures === 0 ? 0 : 1);
