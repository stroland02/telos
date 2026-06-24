import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "./schema.js";
import { diffGraphs } from "./diff.js";

function n(over: Partial<TelosNode> & { id: string }): TelosNode {
  return {
    kind: "function", name: "f", qualifiedName: "app/f", language: "typescript",
    path: "a.ts", lineStart: 1, lineEnd: 5, layer: "service",
    fanIn: 0, fanOut: 0, lines: 5, complexity: 1, summary: null, ...over,
  };
}

describe("diffGraphs", () => {
  it("reports added, removed, and changed nodes", () => {
    const base: TelosGraph = { nodes: [n({ id: "a" }), n({ id: "b", lineEnd: 5 })], edges: [] };
    const next: TelosGraph = { nodes: [n({ id: "a" }), n({ id: "b", lineEnd: 9 }), n({ id: "c" })], edges: [] };
    const d = diffGraphs(base, next);
    expect(d.added.nodes).toEqual(["c"]);
    expect(d.removed.nodes).toEqual([]);
    expect(d.changed).toEqual(["b"]); // lineEnd 5 -> 9
  });

  it("diffs edges by source>target>kind and ignores unchanged graphs", () => {
    const base: TelosGraph = {
      nodes: [n({ id: "a" })],
      edges: [{ sourceId: "a", targetId: "b", kind: "calls", resolved: true }],
    };
    const next: TelosGraph = {
      nodes: [n({ id: "a" })],
      edges: [{ sourceId: "a", targetId: "c", kind: "calls", resolved: true }],
    };
    const d = diffGraphs(base, next);
    expect(d.added.edges).toEqual(["a>c>calls"]);
    expect(d.removed.edges).toEqual(["a>b>calls"]);

    const same = diffGraphs(base, base);
    expect(same).toEqual({ added: { nodes: [], edges: [] }, removed: { nodes: [], edges: [] }, changed: [] });
  });
});
