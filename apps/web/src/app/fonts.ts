// SPRINT-14: self-hosted typefaces (design.md §5.3, §15).
// All three faces are OFL-licensed, Latin-subset WOFF2, served from this application's own
// origin. No external font origin is contacted and the CSP (packages/config/src/security.ts)
// is not widened — see docs/SPRINT-14-NOTES.md.
import localFont from "next/font/local";

/** Display — Bricolage Grotesque 700/800. design.md §17 item 2, resolved in Phase 1.4. */
export const displayFont = localFont({
  src: [
    { path: "./fonts/bricolage-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/bricolage-800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-bricolage",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "sans-serif"],
});

/** Body / UI — Inter 400/500/600. */
export const bodyFont = localFont({
  src: [
    { path: "./fonts/inter-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/inter-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "sans-serif"],
});

/** Utility — JetBrains Mono 500/700. Order numbers, ticket chip, PINs, timers. */
export const monoFont = localFont({
  src: [
    { path: "./fonts/jetbrains-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/jetbrains-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-jetbrains",
  display: "swap",
  preload: true,
  fallback: ["ui-monospace", "monospace"],
});

/** Applied to <html> so every route group resolves the same three faces. */
export const fontVariables = `${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`;
