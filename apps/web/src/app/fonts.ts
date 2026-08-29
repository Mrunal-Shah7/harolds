// Self-hosted typefaces for design v1.1 (harolds-design-v1_1.html).
// All four faces are OFL-licensed, Latin-subset WOFF2, served from this application's own
// origin. No external font origin is contacted and the CSP (packages/config/src/security.ts)
// is not widened.
//
// v1.1 ships FOUR faces with four jobs, shared by every surface — storefront, admin, kitchen:
//   Alfa Slab One  poster    headlines, wordmark, section titles
//   Baloo 2        display   component type: buttons, card titles, prices, board buttons
//   Inter          body      running text, form controls, table cells
//   JetBrains Mono utility   order numbers, the ticket chip, timers, clocks
import localFont from "next/font/local";

/** Poster — Alfa Slab One 400. The only weight the family has. */
export const posterFont = localFont({
  src: [{ path: "./fonts/alfaslabone-400.woff2", weight: "400", style: "normal" }],
  variable: "--font-alfa",
  display: "swap",
  preload: true,
  fallback: ["Georgia", "serif"],
});

/** Display — Baloo 2, variable weight axis. The design uses 600/700/800. */
export const displayFont = localFont({
  src: [{ path: "./fonts/baloo2-var.woff2", weight: "400 800", style: "normal" }],
  variable: "--font-baloo",
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

/** Applied to <html> so every route group resolves the same four faces. */
export const fontVariables = `${posterFont.variable} ${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`;
