// SPRINT-17: the storefront theme preference.
//
// design.md §16.3 previously prohibited dark mode outright. It was lifted for the STOREFRONT
// ONLY, with the full dark palette declared in globals.css and every dark pair added to
// scripts/sprint14-contrast-audit.mjs. Admin and the KDS are unchanged and still prohibited —
// the dark scope is `html[data-theme="dark"] .sf-root`, which neither surface can match.

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "harolds.theme.v1";

/**
 * Runs before first paint, inlined into <head>. Without it the page renders in light and repaints
 * dark, which is worse than not having the feature — design.md §3.4 forbids the layout changing
 * under the person's thumb, and a full-page colour flip is the loudest possible version of that.
 *
 * Deliberately tiny and dependency-free: it must not throw on a browser with storage blocked,
 * because throwing here would leave the document with no theme at all.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});document.documentElement.setAttribute("data-theme",t==="light"||t==="dark"?t:"system")}catch(e){document.documentElement.setAttribute("data-theme","system")}})()`;

export function readStoredTheme(): Theme {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    if (theme === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked — the attribute still applies for this page's lifetime.
  }
}

/** What "system" currently resolves to, for deciding which way a toggle should flip. */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}
