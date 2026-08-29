"use client";

// Design v1.1 — the theme toggle, the fourth header element.
// Text plus switch, never icon-only: the label names the OUTCOME, so it reads "Dark" when
// pressing it will make the page dark. `aria-pressed` drives the switch's flame-lit state.
import { useEffect, useState } from "react";
import { applyTheme, readStoredTheme, resolveTheme, type Theme } from "@/lib/theme";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readStoredTheme());
    setMounted(true);
  }, []);

  // While "system" is in force, follow the device if the user changes it mid-session.
  useEffect(() => {
    if (theme !== "system") return;
    let media: MediaQueryList;
    try {
      media = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const rerender = () => setTheme("system");
    media.addEventListener("change", rerender);
    return () => media.removeEventListener("change", rerender);
  }, [theme]);

  // Before mount the stored value is unknown, and guessing would flash the wrong label. The
  // button keeps its exact final dimensions so nothing shifts when the real label arrives.
  const resolved = mounted ? resolveTheme(theme) : "light";
  const next: Theme = resolved === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next);
        applyTheme(next);
      }}
      aria-pressed={resolved === "dark"}
      aria-label={`Switch to ${next} theme`}
      className={`theme-toggle ${className ?? ""}`}
    >
      <span className={`tx${mounted ? "" : " invisible"}`}>{next === "dark" ? "Dark" : "Light"}</span>
      <span className="sw" aria-hidden="true" />
    </button>
  );
}
