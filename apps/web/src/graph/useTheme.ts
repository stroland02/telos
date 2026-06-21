/**
 * useTheme — light/dark toggle with localStorage persistence.
 *
 * Sets data-theme="light" on <html> for the light token set in tokens.css.
 * Dark is the default (no attribute needed; :root tokens are dark-first).
 * Reads system preference on first load if no stored choice exists.
 *
 * Research: prefers-color-scheme API (MDN), WCAG AA contrast requirements,
 * design direction §2 "Light theme is token-swappable but dark is the default."
 */

import { useState, useCallback, useEffect } from "react";

export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "telos:theme";

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "dark" || v === "light") return v;
    // Fall back to system preference
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  } catch { /* SSR / private browsing */ }
  return "dark";
}

function applyTheme(theme: ThemeMode) {
  const html = document.documentElement;
  if (theme === "light") {
    html.setAttribute("data-theme", "light");
  } else {
    html.removeAttribute("data-theme");
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const t = readStored();
    applyTheme(t);
    return t;
  });

  // Sync on mount in case SSR set a different value
  useEffect(() => { applyTheme(theme); }, [theme]);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeMode = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return { theme, setTheme, toggle };
}
