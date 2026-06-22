import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "@telos/engine";
import { runExplore, runCallers, runImpact, runRecommend, ToolContext } from "./tools.js";

function node(id: string): TelosNode {
  return {
    id, kind: "function", name: id, qualifiedName: `m/${id}`, language: "ts",
    path: `m/${id}.ts`, lineStart: 1, lineEnd: 9, layer: "service",
    fanIn: 0, fanOut: 0, lines: 9, complexity: 1, summary: null,
  };
}
function ctx(): ToolContext {
  const graph: TelosGraph = {
    nodes: [node("alpha"), node("beta")],
    edges: [{ sourceId: "alpha", targetId: "beta", kind: "calls", resolved: true }],
  };
  return { graph, store: null }; // null store -> name-filter fallback
}

describe("tool handlers", () => {
  it("runExplore finds by name and annotates", () => {
    const { hits } = runExplore(ctx(), { query: "beta" });
    expect(hits.map((h) => h.node.id)).toEqual(["beta"]);
    expect(hits[0].callers).toEqual(["m/alpha"]);
  });
  it("runCallers returns direct callers", () => {
    expect(runCallers(ctx(), { symbol: "beta" }).map((n) => n.id)).toEqual(["alpha"]);
  });
  it("runImpact returns reverse closure", () => {
    expect(runImpact(ctx(), { symbol: "beta" }).map((n) => n.id)).toEqual(["alpha"]);
  });
  it("runRecommend suggests capabilities for the resolved node", () => {
    const c = ctx();
    c.graph.nodes[0].path = "src/components/Button.tsx"; // make alpha a React component
    const out = runRecommend(c, { symbol: "alpha" });
    expect(out.node).toBe("m/alpha");
    expect(out.capabilities.map((x) => x.id)).toContain("ecc:react-reviewer");
  });
  it("runRecommend returns empty for an unknown symbol", () => {
    expect(runRecommend(ctx(), { symbol: "nope" })).toEqual({ node: null, capabilities: [] });
  });
});
