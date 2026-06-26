import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRoster } from "./roster.js";

const pluginsDir = join(fileURLToPath(new URL(".", import.meta.url)), "__fixtures__", "plugins");

describe("loadRoster", () => {
  let telosDir: string;
  beforeEach(() => {
    telosDir = mkdtempSync(join(tmpdir(), "telos-roster-"));
  });

  it("scans on first call and serves the cache on the second", () => {
    const first = loadRoster({ telosDir, pluginsDir });
    const second = loadRoster({ telosDir, pluginsDir });
    expect(second.scannedAt).toBe(first.scannedAt); // served from cache
    expect(first.capabilities.length).toBeGreaterThan(0);
    rmSync(telosDir, { recursive: true, force: true });
  });

  it("re-scans when force is set", () => {
    const first = loadRoster({ telosDir, pluginsDir });
    const forced = loadRoster({ telosDir, pluginsDir, force: true });
    expect(forced.scannedAt).toBeGreaterThanOrEqual(first.scannedAt);
    rmSync(telosDir, { recursive: true, force: true });
  });
});
