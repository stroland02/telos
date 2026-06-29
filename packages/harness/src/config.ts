import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { CapabilitySource } from "./capability.js";

export interface HarnessConfig {
  enabled: CapabilitySource[];
  /**
   * Quality gate for full-roster specialist routing (Phase 3): the minimum
   * semantic cosine a roster capability must clear to be injected. Higher =
   * stricter (fewer, surer specialists); lower = more reach, more noise risk.
   * Optional — falls back to the code default when unset, so the full roster is
   * reachable + gated without ever re-introducing the all-352 junk matching.
   */
  specialistMin?: number;
  /** Max specialists injected per prompt (tunable cap on the gated full roster). */
  specialistLimit?: number;
}

export const ALL_SOURCES: CapabilitySource[] = ["ecc", "superpowers", "headroom"];

// Tunable-but-bounded: a cosine outside [0,1] or a non-positive/huge limit is a
// misconfiguration that would silently open the junk-match floodgates — clamp it.
const MIN_RANGE: [number, number] = [0, 1];
const LIMIT_RANGE: [number, number] = [1, 12];
const clamp = (n: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, n));

function configPath(repoRoot: string): string {
  return join(repoRoot, ".telos", "harness.config.json");
}

/** Read the selected-harnesses config; defaults to none. Never throws. */
export function readConfig(repoRoot: string): HarnessConfig {
  const p = configPath(repoRoot);
  if (!existsSync(p)) return { enabled: [] };
  try {
    const data = JSON.parse(readFileSync(p, "utf8")) as { enabled?: unknown; specialistMin?: unknown; specialistLimit?: unknown };
    const enabled = Array.isArray(data.enabled)
      ? data.enabled.filter((s): s is CapabilitySource => ALL_SOURCES.includes(s as CapabilitySource))
      : [];
    const config: HarnessConfig = { enabled: [...new Set(enabled)] };
    if (typeof data.specialistMin === "number" && Number.isFinite(data.specialistMin))
      config.specialistMin = clamp(data.specialistMin, MIN_RANGE);
    if (typeof data.specialistLimit === "number" && Number.isFinite(data.specialistLimit))
      config.specialistLimit = clamp(Math.round(data.specialistLimit), LIMIT_RANGE);
    return config;
  } catch {
    return { enabled: [] };
  }
}

export function writeConfig(repoRoot: string, config: HarnessConfig): void {
  const p = configPath(repoRoot);
  mkdirSync(dirname(p), { recursive: true });
  const out: Record<string, unknown> = { enabled: [...new Set(config.enabled)].sort() };
  if (config.specialistMin !== undefined) out.specialistMin = clamp(config.specialistMin, MIN_RANGE);
  if (config.specialistLimit !== undefined) out.specialistLimit = clamp(Math.round(config.specialistLimit), LIMIT_RANGE);
  writeFileSync(p, JSON.stringify(out, null, 2) + "\n");
}

/** Turn one harness on/off; returns the resulting config. Preserves routing tunables. */
export function setEnabled(repoRoot: string, source: CapabilitySource, on: boolean): HarnessConfig {
  const current = readConfig(repoRoot);
  const set = new Set(current.enabled);
  if (on) set.add(source);
  else set.delete(source);
  writeConfig(repoRoot, { ...current, enabled: [...set] });
  return readConfig(repoRoot);
}
