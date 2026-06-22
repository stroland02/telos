import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "./schema.js";
import { enrichGraph, Enricher } from "./enrich.js";
import { heuristicEnricher } from "./enrichers/heuristic.js";

function node(p: Partial<TelosNode> & { id: string; name: string }): TelosNode {
  return {
    kind: "function", qualifiedName: p.name, language: "typescript", path: "a.ts",
    lineStart: 1, lineEnd: 10, layer: "service", fanIn: 0, fanOut: 0, lines: 10,
    complexity: 0, summary: null, ...p,
  } as TelosNode;
}

const graph: TelosGraph = {
  nodes: [
    node({ id: "a", name: "authenticate", layer: "api", lines: 18, fanIn: 3, fanOut: 2 }),
    node({ id: "b", name: "hashPassword", layer: "util", lines: 5 }),
  ],
  edges: [{ sourceId: "a", targetId: "b", kind: "calls", resolved: true }],
};

describe("enrichGraph + heuristicEnricher", () => {
  it("fills a deterministic structural summary for every node", async () => {
    const out = await enrichGraph(graph, heuristicEnricher);
    const a = out.nodes.find((n) => n.id === "a")!;
    expect(a.summary).toBe("function authenticate (typescript, api layer) — called by 3, calls 2, spans 18 lines.");
    const b = out.nodes.find((n) => n.id === "b")!;
    expect(b.summary).toContain("hashPassword");
    expect(out.nodes.every((n) => typeof n.summary === "string" && n.summary.length > 0)).toBe(true);
  });

  it("does not mutate the input graph", async () => {
    await enrichGraph(graph, heuristicEnricher);
    expect(graph.nodes.find((n) => n.id === "a")!.summary).toBeNull();
  });

  it("accepts any object implementing Enricher (LlmEnricher drop-in point)", async () => {
    const stub: Enricher = { name: "stub", enrich: () => ({ summary: "x" }) };
    const out = await enrichGraph(graph, stub);
    expect(out.nodes.every((n) => n.summary === "x")).toBe(true);
  });

  it("supports async enrichers and preserves node order", async () => {
    const asyncEnricher: Enricher = { name: "async", enrich: async (n) => ({ summary: `s:${n.id}` }) };
    const out = await enrichGraph(graph, asyncEnricher, { concurrency: 1 });
    expect(out.nodes.map((n) => n.summary)).toEqual(["s:a", "s:b"]);
  });
});
