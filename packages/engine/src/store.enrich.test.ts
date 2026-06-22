import { describe, it, expect } from "vitest";
import { GraphStore } from "./store.js";
import { TelosGraph } from "./schema.js";

const graph: TelosGraph = {
  nodes: [{
    id: "a", kind: "function", name: "f", qualifiedName: "f", language: "ts",
    path: "a.ts", lineStart: 1, lineEnd: 2, layer: "util", fanIn: 0, fanOut: 0,
    lines: 2, complexity: 0, summary: null,
  }],
  edges: [],
};

describe("GraphStore.applyEnrichment", () => {
  it("persists summary and refined layer, idempotently", () => {
    const store = GraphStore.open(":memory:");
    store.save(graph);
    store.applyEnrichment([{ id: "a", summary: "hello", layer: "service" }]);
    store.applyEnrichment([{ id: "a", summary: "hello", layer: "service" }]);
    const reloaded = store.loadGraph();
    expect(reloaded.nodes[0].summary).toBe("hello");
    expect(reloaded.nodes[0].layer).toBe("service");
    store.close();
  });

  it("updates only summary when layer is omitted", () => {
    const store = GraphStore.open(":memory:");
    store.save(graph);
    store.applyEnrichment([{ id: "a", summary: "only summary" }]);
    const reloaded = store.loadGraph();
    expect(reloaded.nodes[0].summary).toBe("only summary");
    expect(reloaded.nodes[0].layer).toBe("util");
    store.close();
  });
});
