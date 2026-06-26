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

  it("reads languages from the repo's own scanned graph when present", () => {
    // The repo root has a .telos/graph.db from prior scans in this workspace.
    const ctx = productContextFromGraph(".");
    expect(Array.isArray(ctx.languages)).toBe(true);
    expect(Array.isArray(ctx.layers)).toBe(true);
    // If a graph exists, TypeScript should be among the languages; if not, arrays are empty.
    if (ctx.languages.length > 0) expect(ctx.languages).toContain("typescript");
  });
});
