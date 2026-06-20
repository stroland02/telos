import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { GraphStore } from "./store.js";
import { TelosGraph, createNodeId } from "./schema.js";

function sampleGraph(): TelosGraph {
  const a = createNodeId("a.ts", "a.ts:foo");
  return {
    nodes: [{ id: a, kind: "function", name: "foo", qualifiedName: "a.ts:foo",
      language: "typescript", path: "a.ts", lineStart: 1, lineEnd: 2, layer: "service",
      fanIn: 0, fanOut: 0, lines: 2, complexity: 0, summary: null }],
    edges: [],
  };
}

describe("GraphStore", () => {
  it("round-trips a graph and supports FTS search", () => {
    const db = join(tmpdir(), `telos-${randomUUID()}.db`);
    const store = GraphStore.open(db);
    store.save(sampleGraph());
    expect(store.loadGraph().nodes).toHaveLength(1);
    expect(store.search("foo")[0].name).toBe("foo");
    store.close();
  });
});
