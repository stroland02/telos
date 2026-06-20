import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { GraphStore } from "./store.js";
import { TelosGraph, createNodeId } from "./schema.js";

function sampleGraph(): TelosGraph {
  const a = createNodeId("a.ts", "a.ts:foo");
  const b = createNodeId("b.ts", "b.ts:bar");
  return {
    nodes: [
      {
        id: a,
        kind: "function",
        name: "foo",
        qualifiedName: "a.ts:foo",
        language: "typescript",
        path: "a.ts",
        lineStart: 1,
        lineEnd: 10,
        layer: "service",
        fanIn: 2,
        fanOut: 3,
        lines: 10,
        complexity: 4,
        summary: null,
      },
      {
        id: b,
        kind: "class",
        name: "bar",
        qualifiedName: "b.ts:bar",
        language: "typescript",
        path: "b.ts",
        lineStart: 5,
        lineEnd: 20,
        layer: "domain",
        fanIn: 0,
        fanOut: 1,
        lines: 15,
        complexity: 2,
        summary: "A bar class",
      },
    ],
    edges: [
      { sourceId: a, targetId: b, kind: "calls", resolved: true },
      { sourceId: b, targetId: a, kind: "imports", resolved: false },
    ],
  };
}

describe("GraphStore", () => {
  let store: GraphStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `telos-${randomUUID()}.db`);
    store = GraphStore.open(dbPath);
    store.save(sampleGraph());
  });

  afterEach(() => {
    store.close();
  });

  it("round-trips nodes with full deep equality", () => {
    const graph = sampleGraph();
    expect(store.loadGraph().nodes).toEqual(graph.nodes);
  });

  it("round-trips edges with full deep equality including resolved boolean", () => {
    const graph = sampleGraph();
    expect(store.loadGraph().edges).toEqual(graph.edges);
  });

  it("returns node via FTS prefix search on 'foo'", () => {
    const results = store.search("foo");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("foo");
  });

  it("does not throw on multi-word FTS search (foo bar)", () => {
    expect(() => store.search("foo bar")).not.toThrow();
  });

  it("does not throw on quote-containing FTS search", () => {
    expect(() => store.search('"')).not.toThrow();
  });

  it("returns empty array for whitespace-only search term", () => {
    expect(store.search("   ")).toEqual([]);
  });
});
