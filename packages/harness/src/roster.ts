import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { discoverHarnesses, type HarnessRoster } from "./discover.js";

/**
 * Cached roster loader for the hot path (the UserPromptSubmit hook runs this per
 * prompt — it must not walk the whole plugins tree every time). The cache is
 * re-scanned only when the plugins manifest is newer than the cached scan, or
 * when `force` is set. Any FS error degrades to a fresh in-memory scan.
 */
export function loadRoster(opts: { telosDir?: string; pluginsDir?: string; force?: boolean } = {}): HarnessRoster {
  const pluginsDir = opts.pluginsDir ?? join(homedir(), ".claude", "plugins");
  const telosDir = opts.telosDir ?? ".telos";
  const cachePath = join(telosDir, "harness-roster.json");
  const manifestPath = join(pluginsDir, "installed_plugins.json");

  if (!opts.force) {
    try {
      if (existsSync(cachePath)) {
        const cached = JSON.parse(readFileSync(cachePath, "utf8")) as HarnessRoster;
        const manifestMtime = existsSync(manifestPath) ? statSync(manifestPath).mtimeMs : 0;
        if (cached.scannedAt >= manifestMtime) return cached;
      }
    } catch {
      // fall through to a fresh scan
    }
  }

  const roster = discoverHarnesses({ pluginsDir });
  try {
    mkdirSync(telosDir, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(roster));
  } catch {
    // caching is best-effort; the scan result is still valid
  }
  return roster;
}
