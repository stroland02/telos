import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRoster } from "./roster.js";
import { discoverHarnesses } from "./discover.js";

// Disaster-recovery: bad/missing local state must never crash the per-prompt path.
const fixtures = join(fileURLToPath(new URL(".", import.meta.url)), "__fixtures__", "plugins");

describe("harness robustness (disaster recovery)", () => {
  let telosDir: string;
  beforeEach(() => { telosDir = mkdtempSync(join(tmpdir(), "telos-robust-")); });
  afterEach(() => rmSync(telosDir, { recursive: true, force: true }));

  it("recovers from a CORRUPT roster cache by re-scanning", () => {
    writeFileSync(join(telosDir, "harness-roster.json"), "{ totally broken json");
    const roster = loadRoster({ telosDir, pluginsDir: fixtures });
    expect(roster.capabilities.length).toBeGreaterThan(0); // re-scanned, didn't throw
  });

  it("returns an empty roster (never throws) on a MALFORMED plugins manifest", () => {
    const badPlugins = mkdtempSync(join(tmpdir(), "telos-badplugins-"));
    try {
      writeFileSync(join(badPlugins, "installed_plugins.json"), "<<<not json>>>");
      const roster = discoverHarnesses({ pluginsDir: badPlugins });
      expect(roster.capabilities).toEqual([]);
      // known defaults still surface as "available"
      expect(roster.sources.find((s) => s.source === "ecc")!.state).toBe("available");
    } finally { rmSync(badPlugins, { recursive: true, force: true }); }
  });

  it("handles a plugins dir that does not exist at all", () => {
    expect(() => discoverHarnesses({ pluginsDir: join(telosDir, "nope") })).not.toThrow();
  });

  it("handles a manifest pointing at a non-existent install path", () => {
    const d = mkdtempSync(join(tmpdir(), "telos-badpath-"));
    try {
      writeFileSync(join(d, "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "ecc@ecc": [{ installPath: join(d, "missing"), version: "1.0.0" }] } }));
      const roster = discoverHarnesses({ pluginsDir: d });
      // ecc is "installed" but yields zero capabilities — no crash on missing dirs.
      expect(roster.sources.find((s) => s.source === "ecc")!.counts.agents).toBe(0);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
