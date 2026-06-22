import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "./schema.js";
import { resolveNode, calleesOf, callersOf, impactOf, affectedBy, explore } from "./query.js";

function node(id: string): TelosNode {
  return {
    id, kind: "function", name: id, qualifiedName: `m/${id}`, language: "ts",
    path: `m/${id}.ts`, lineStart: 1, lineEnd: 9, layer: "service",
    fanIn: 0, fanOut: 0, lines: 9, complexity: 1, summary: null,
  };
}
function g(): TelosGraph {
  return {
    nodes: [node("a"), node("b"), node("c")],
    edges: [
      { sourceId: "a", targetId: "b", kind: "calls", resolved: true },
      { sourceId: "b", targetId: "c", kind: "calls", resolved: true },
    ],
  };
}

describe("resolveNode", () => {
  it("resolves by id, then qualifiedName, then name", () => {
    const graph = g();
    expect(resolveNode(graph, "a")?.id).toBe("a");
    expect(resolveNode(graph, "m/b")?.id).toBe("b");
    expect(resolveNode(graph, "c")?.id).toBe("c");
    expect(resolveNode(graph, "nope")).toBeNull();
  });
});

describe("callees/callers (direct)", () => {
  it("calleesOf returns direct call targets", () => {
    expect(calleesOf(g(), "a").map((n) => n.id)).toEqual(["b"]);
  });
  it("callersOf returns direct callers", () => {
    expect(callersOf(g(), "c").map((n) => n.id)).toEqual(["b"]);
  });
  it("returns [] for unknown ref", () => {
    expect(calleesOf(g(), "zzz")).toEqual([]);
  });
});

describe("impactOf", () => {
  it("returns the transitive reverse-dependency closure", () => {
    // a -> b -> c  (calls). Impact of c = {a, b}; impact of a = {}.
    expect(impactOf(g(), "c").map((n) => n.id)).toEqual(["a", "b"]);
    expect(impactOf(g(), "a")).toEqual([]);
  });
});

describe("affectedBy", () => {
  it("returns changed-file symbols plus their reverse-dependency closure", () => {
    // change c.ts -> affected symbols = {a, b, c}; files = their paths
    const r = affectedBy(g(), ["m/c.ts"]);
    expect(r.symbols.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(r.files).toEqual(["m/a.ts", "m/b.ts", "m/c.ts"]);
  });
  it("empty paths -> empty result", () => {
    expect(affectedBy(g(), [])).toEqual({ symbols: [], files: [] });
  });
});

describe("explore", () => {
  it("annotates each match with callers, callees, impactCount", () => {
    const graph = g();
    const matches = graph.nodes.filter((n) => n.id === "b");
    const { hits } = explore(graph, matches);
    expect(hits).toHaveLength(1);
    expect(hits[0].callers).toEqual(["m/a"]);
    expect(hits[0].callees).toEqual(["m/c"]);
    expect(hits[0].impactCount).toBe(1); // a depends on b
  });
  it("honors limit", () => {
    const graph = g();
    expect(explore(graph, graph.nodes, { limit: 2 }).hits).toHaveLength(2);
  });
});
