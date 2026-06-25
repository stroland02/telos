import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { CapabilitySource } from "./capability.js";

export interface HarnessConfig { enabled: CapabilitySource[] }

export const ALL_SOURCES: CapabilitySource[] = ["ecc", "superpowers", "headroom"];

function configPath(repoRoot: string): string {
  return join(repoRoot, ".telos", "harness.config.json");
}

/** Read the selected-harnesses config; defaults to none. Never throws. */
export function readConfig(repoRoot: string): HarnessConfig {
  const p = configPath(repoRoot);
  if (!existsSync(p)) return { enabled: [] };
  try {
    const data = JSON.parse(readFileSync(p, "utf8")) as { enabled?: unknown };
    const enabled = Array.isArray(data.enabled)
      ? data.enabled.filter((s): s is CapabilitySource => ALL_SOURCES.includes(s as CapabilitySource))
      : [];
    return { enabled: [...new Set(enabled)] };
  } catch {
    return { enabled: [] };
  }
}

export function writeConfig(repoRoot: string, config: HarnessConfig): void {
  const p = configPath(repoRoot);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ enabled: [...new Set(config.enabled)].sort() }, null, 2) + "\n");
}

/** Turn one harness on/off; returns the resulting config. */
export function setEnabled(repoRoot: string, source: CapabilitySource, on: boolean): HarnessConfig {
  const set = new Set(readConfig(repoRoot).enabled);
  if (on) set.add(source);
  else set.delete(source);
  writeConfig(repoRoot, { enabled: [...set] });
  return readConfig(repoRoot);
}
