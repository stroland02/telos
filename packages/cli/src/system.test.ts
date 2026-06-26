import { describe, it, expect, beforeAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { GraphStore } from "@telos/engine";
import { loadRoster, planWorkflow } from "@telos/harness";
import { runScan, runMeasure } from "./main.js";
import { readProductContextCache } from "./productContextCache.js";

// SYSTEM / INTEGRATION (QA #3) + MAP ACCURACY (QA #5): drive the whole pipeline
// on a known fixture (scan -> graph -> measure -> product-context cache -> route)
// and assert the map Telos builds is faithful to the source on disk.
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../engine/fixtures/scan-sample");

describe("system flow: scan -> graph -> measure -> route", () => {
  beforeAll(async () => { await runScan(repo); });

  it("MAP ACCURACY: scans the fixture into a faithful graph", () => {
    const store = GraphStore.open(join(repo, ".telos", "graph.db"));
    try {
      const { nodes, edges } = store.loadGraph();
      const files = nodes.filter((n) => n.kind === "file").map((n) => n.path);
      // both source files are mapped
      expect(files.some((p) => p.endsWith("app.py"))).toBe(true);
      expect(files.some((p) => p.endsWith("orderService.ts"))).toBe(true);
      // both languages detected
      const langs = new Set(nodes.filter((n) => n.kind === "file").map((n) => n.language));
      expect(langs.has("python")).toBe(true);
      expect(langs.has("typescript")).toBe(true);
      // symbols + edges exist (the graph isn't just files)
      expect(nodes.some((n) => n.kind === "function" || n.kind === "class" || n.kind === "method")).toBe(true);
      expect(edges.length).toBeGreaterThan(0);
    } finally { store.close(); }
  });

  it("writes the product-context cache the fast hook reads", () => {
    const ctx = readProductContextCache(join(repo, ".telos"));
    expect(ctx).not.toBeNull();
    expect(ctx!.languages).toEqual(expect.arrayContaining(["python", "typescript"]));
  });

  it("MEASURE: produces a coherent token-savings report over the real graph", () => {
    const r = runMeasure(repo, { limit: 5 });
    expect(r.files).toBeGreaterThan(0);
    expect(r.packTokens).toBeGreaterThan(0);
    expect(r.baselineTokens).toBeGreaterThanOrEqual(r.selectiveBaselineTokens);
  });

  it("ROUTE: the planner uses the product context to pick a language reviewer", () => {
    const ctx = readProductContextCache(join(repo, ".telos"))!;
    const plan = planWorkflow("add a new feature to the order flow", loadRoster({ telosDir: join(repo, ".telos") }), ["ecc", "superpowers", "headroom"], ctx);
    expect(plan.template).toBe("feature-build");
    const ids = plan.steps.flatMap((s) => s.agents.map((a) => a.id));
    // a product with TypeScript should pull the TS reviewer when ecc is installed
    if (ids.some((id) => id.startsWith("ecc:"))) {
      expect(ids.some((id) => id.includes("typescript") || id === "ecc:code-reviewer")).toBe(true);
    }
  });
});
