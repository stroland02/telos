import { describe, it, expect } from "vitest";
import { buildContextPack, renderContextPack } from "./context.js";
import { TelosGraph, TelosNode } from "./schema.js";

function node(p: Partial<TelosNode> & { id: string }): TelosNode {
  return {
    id: p.id,
    kind: p.kind ?? "function",
    name: p.name ?? p.id,
    qualifiedName: p.qualifiedName ?? p.id,
    language: p.language ?? "typescript",
    path: p.path ?? `src/${p.id}.ts`,
    lineStart: 1,
    lineEnd: 10,
    layer: p.layer ?? "util",
    fanIn: p.fanIn ?? 0,
    fanOut: p.fanOut ?? 0,
    lines: p.lines ?? 10,
    complexity: p.complexity ?? 1,
    summary: p.summary ?? null,
  };
}

const graph: TelosGraph = {
  nodes: [
    node({ id: "f1", kind: "file", path: "src/a.ts", layer: "api" }),
    node({ id: "f2", kind: "file", path: "src/b.py", language: "python", layer: "data" }),
    node({ id: "hub", kind: "function", qualifiedName: "a.hub", layer: "api", fanIn: 9, complexity: 3 }),
    node({ id: "calc", kind: "function", qualifiedName: "a.calc", layer: "service", fanIn: 2, complexity: 12, fanOut: 4 }),
    node({ id: "helper", kind: "function", qualifiedName: "u.helper", layer: "util", fanIn: 1, complexity: 1, summary: "  small helper  " }),
  ],
  edges: [
    { sourceId: "calc", targetId: "hub", kind: "calls", resolved: true },
    { sourceId: "helper", targetId: "hub", kind: "calls", resolved: true },
  ],
};

describe("buildContextPack", () => {
  it("computes totals incl. files and distinct languages", () => {
    const p = buildContextPack(graph);
    expect(p.totals.nodes).toBe(5);
    expect(p.totals.edges).toBe(2);
    expect(p.totals.files).toBe(2);
    expect(p.totals.languages).toEqual(["python", "typescript"]);
  });

  it("ranks entry points by fanIn and hotspots by complexity (symbols only)", () => {
    const p = buildContextPack(graph);
    expect(p.entryPoints[0].qualifiedName).toBe("a.hub"); // fanIn 9
    expect(p.entryPoints.every((n) => n.kind !== "file")).toBe(true);
    expect(p.hotspots[0].qualifiedName).toBe("a.calc"); // complexity 12
  });

  it("includes only enriched summaries, trimmed", () => {
    const p = buildContextPack(graph);
    expect(p.summaries).toEqual([{ qualifiedName: "u.helper", summary: "small helper" }]);
  });

  it("respects the limit", () => {
    const p = buildContextPack(graph, { limit: 1 });
    expect(p.entryPoints).toHaveLength(1);
    expect(p.hotspots).toHaveLength(1);
  });

  it("renders compact markdown with the headline totals", () => {
    const md = renderContextPack(buildContextPack(graph));
    expect(md).toContain("# Architecture context");
    expect(md).toContain("5 nodes, 2 edges, 2 files");
    expect(md).toContain("a.hub");
  });
});
