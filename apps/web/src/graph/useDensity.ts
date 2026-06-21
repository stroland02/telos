/**
 * useDensity — persona/density mode hook.
 *
 * Three tiers of metadata density on graph nodes (design direction §6 progressive disclosure):
 *   overview  — label only; fastest scan, most calm. "What is the shape?"
 *   learn     — label + layer chip + symbol count. Default.
 *   deep      — label + all chips (layer, sym, in/out, complexity). Maximum detail.
 *
 * Persisted in localStorage under key "telos:density".
 * Research: Material Design information density, VS Code editor zoom, GitHub table density.
 */

import { useState, useCallback } from "react";

export type DensityMode = "overview" | "learn" | "deep";

const STORAGE_KEY = "telos:density";
const MODES: DensityMode[] = ["overview", "learn", "deep"];

function readStored(): DensityMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "overview" || v === "learn" || v === "deep") return v;
  } catch {
    // SSR / private browsing — fall through
  }
  return "learn";
}

export function useDensity() {
  const [mode, setModeState] = useState<DensityMode>(readStored);

  const setMode = useCallback((next: DensityMode) => {
    setModeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  return { mode, setMode, modes: MODES };
}
