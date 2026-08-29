"use client";

// SPRINT-17: the storefront theme toggle — the fourth header element (design.md §7.4, amended).
//
// It carries a VISIBLE TEXT LABEL, not just an icon. §16.4 permits icon-only buttons for cart,
// close and back and nothing else, and a theme control is not on that list.
//
// The label names the OUTCOME, per §13: it reads "Dark" when pressing it will make the page dark.
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
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
  const Icon = next === "dark" ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next);
        applyTheme(next);
      }}
      aria-label={`Switch to ${next} theme`}
      className={`t-body-sm inline-flex h-11 shrink-0 items-center gap-2 rounded-pill bg-paper-sunk px-4 font-semibold text-ink motion-fast transition-colors hover:bg-line ${className ?? ""}`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className={mounted ? undefined : "invisible"}>{next === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
