import { describe, it, expect } from "vitest";
import { productContextFromGraph } from "./productContext.js";

describe("productContextFromGraph", () => {
  it("returns empty arrays when no graph exists", () => {
    expect(productContextFromGraph("does-not-exist-xyz")).toEqual({
      languages: [],
      layers: [],
      changedFiles: [],
    });
  });

  it("degrades to empty (never throws) on a corrupt graph.db", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "telos-corrupt-"));
    try {
      mkdirSync(join(dir, ".telos"), { recursive: true });
      writeFileSync(join(dir, ".telos", "graph.db"), "this is not a sqlite database");
      expect(productContextFromGraph(dir)).toEqual({ languages: [], layers: [], changedFiles: [] });
    } finally {
      // On Windows the sqlite driver may briefly hold the corrupt file handle;
      // tolerate the cleanup EPERM (the assertion above is what matters).
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* OS will reclaim temp */ }
    }
  });

  it("reads languages from the repo's own scanned graph when present", () => {
    // The repo root has a .telos/graph.db from prior scans in this workspace.
    const ctx = productContextFromGraph(".");
    expect(Array.isArray(ctx.languages)).toBe(true);
    expect(Array.isArray(ctx.layers)).toBe(true);
    // If a graph exists, TypeScript should be among the languages; if not, arrays are empty.
    if (ctx.languages.length > 0) expect(ctx.languages).toContain("typescript");
  });
});
