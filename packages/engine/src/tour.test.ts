import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "./schema.js";
import { buildTour } from "./tour.js";

function node(id: string, fanIn = 0): TelosNode {
  return {
    id, kind: "function", name: id, qualifiedName: id, language: "ts", path: "a.ts",
    lineStart: 1, lineEnd: 2, layer: "util", fanIn, fanOut: 0, lines: 2, complexity: 0, summary: null,
  };
}

// a depends on b (a calls b); b depends on c. Expected dependency order: c, b, a.
const graph: TelosGraph = {
  nodes: [node("a"), node("b"), node("c")],
  edges: [
    { sourceId: "a", targetId: "b", kind: "calls", resolved: true },
    { sourceId: "b", targetId: "c", kind: "calls", resolved: true },
  ],
};

describe("buildTour", () => {
  it("orders nodes so dependencies come before their dependents", () => {
    const order = buildTour(graph).map((s) => s.node.id);
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("a"));
  });

  it("assigns sequential order numbers and respects limit", () => {
    const tour = buildTour(graph, { limit: 2 });
    expect(tour).toHaveLength(2);
    expect(tour.map((s) => s.order)).toEqual([0, 1]);
  });

  it("handles cycles without dropping nodes", () => {
    const cyclic: TelosGraph = {
      nodes: [node("x"), node("y")],
      edges: [
        { sourceId: "x", targetId: "y", kind: "calls", resolved: true },
        { sourceId: "y", targetId: "x", kind: "calls", resolved: true },
      ],
    };
    expect(buildTour(cyclic)).toHaveLength(2);
  });
});
