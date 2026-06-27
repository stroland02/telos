import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectRouteTargets, targetsHash, readEmbeddingCache, writeEmbeddingCache } from "./routeTargets.js";
import type { HarnessRoster } from "./discover.js";

const roster = {
  capabilities: [
    { id: "ecc:code-reviewer", kind: "agent", source: "ecc", title: "Code reviewer", description: "reviews code quality", triggers: ["review"] },
    { id: "other:thing", kind: "agent", source: "other", title: "Thing", description: "does things", triggers: [] },
  ],
  sources: [],
  scannedAt: 0,
} as unknown as HarnessRoster;

describe("route targets + cache", () => {
  it("emits template + enabled-capability targets with text", () => {
    const t = collectRouteTargets(roster, ["ecc"]);
    expect(t.some((x) => x.kind === "template")).toBe(true);
    expect(t.some((x) => x.id === "ecc:code-reviewer" && /reviews code/.test(x.text))).toBe(true);
    // capability from a disabled source is excluded
    expect(t.some((x) => x.id === "other:thing")).toBe(false);
  });

  it("hash changes with content", () => {
    const a = targetsHash([{ id: "x", kind: "template", text: "one" }]);
    const b = targetsHash([{ id: "x", kind: "template", text: "two" }]);
    expect(a).not.toBe(b);
  });

  it("cache round-trips and is null on missing/corrupt", () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-emb-"));
    try {
      expect(readEmbeddingCache(dir)).toBeNull();
      writeEmbeddingCache(dir, { hash: "h", dim: 2, vectors: { x: [1, 0] } });
      const c = readEmbeddingCache(dir);
      expect(c!.hash).toBe("h");
      expect(c!.vectors.x).toEqual([1, 0]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
