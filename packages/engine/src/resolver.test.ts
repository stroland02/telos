import { describe, it, expect } from "vitest";
import { resolveGraph, inferLayerFromPath } from "./resolver.js";
import { TelosGraph, createNodeId } from "./schema.js";

function fn(path: string, name: string) {
  const q = `${path}:${name}`;
  return { id: createNodeId(path, q), kind: "function" as const, name, qualifiedName: q,
    language: "typescript", path, lineStart: 1, lineEnd: 2, layer: "unknown" as const,
    fanIn: 0, fanOut: 0, lines: 2, complexity: 0, summary: null };
}

describe("resolveGraph", () => {
  it("binds a call edge to a unique definition and counts fan-in/out", () => {
    const foo = fn("src/a.ts", "foo");
    const bar = fn("src/b.ts", "bar");
    const graph: TelosGraph = {
      nodes: [foo, bar],
      edges: [{ sourceId: foo.id, targetId: createNodeId("?", "bar"), kind: "calls", resolved: false }],
    };
    const out = resolveGraph(graph);
    const edge = out.edges.find((e) => e.kind === "calls")!;
    expect(edge.resolved).toBe(true);
    expect(edge.targetId).toBe(bar.id);
    expect(out.nodes.find((n) => n.id === bar.id)?.fanIn).toBe(1);
    expect(out.nodes.find((n) => n.id === foo.id)?.fanOut).toBe(1);
  });

  it("assigns layers from path hints", () => {
    const ctrl = fn("src/controllers/user.ts", "list");
    const out = resolveGraph({ nodes: [ctrl], edges: [] });
    expect(out.nodes[0].layer).toBe("api");
  });

  it("infers layers from directory/role when hints miss", () => {
    expect(inferLayerFromPath("packages/server/src/server.ts")).toBe("api");
    expect(inferLayerFromPath("apps/web/src/App.tsx")).toBe("ui");
    expect(inferLayerFromPath("packages/engine/src/core.ts")).toBe("service");
    expect(inferLayerFromPath("src/models/user.ts")).toBe("data");
    expect(inferLayerFromPath("src/utils/log.ts")).toBe("util");
    expect(inferLayerFromPath("infra/deploy/ci.yml")).toBe("infra");
    expect(inferLayerFromPath("packages/zzz/random.ts")).toBe("unknown");
  });

  it("drops a call edge when the name is ambiguous (2+ definitions)", () => {
    const bar1 = fn("src/a.ts", "bar");
    const bar2 = fn("src/b.ts", "bar");
    const foo = fn("src/c.ts", "foo");
    const out = resolveGraph({
      nodes: [bar1, bar2, foo],
      edges: [{ sourceId: foo.id, targetId: createNodeId("?", "bar"), kind: "calls", resolved: false }],
    });
    expect(out.edges.filter((e) => e.kind === "calls")).toHaveLength(0);
  });

  it("drops a call edge to an unknown name", () => {
    const foo = fn("src/c.ts", "foo");
    const out = resolveGraph({
      nodes: [foo],
      edges: [{ sourceId: foo.id, targetId: createNodeId("?", "doesNotExist"), kind: "calls", resolved: false }],
    });
    expect(out.edges.filter((e) => e.kind === "calls")).toHaveLength(0);
  });
});
