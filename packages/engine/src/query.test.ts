import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "./schema.js";
import { resolveNode, calleesOf, callersOf } from "./query.js";

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
