import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "../schema.js";
import { buildNodeIndex } from "./match.js";
import { SpanRecord } from "./otlp.js";
import { TraceAggregator } from "./aggregator.js";

function node(id: string, qn: string): TelosNode {
  return {
    id, kind: "function", name: qn, qualifiedName: qn, language: "ts", path: "a.ts",
    lineStart: 1, lineEnd: 5, layer: "service", fanIn: 0, fanOut: 0, lines: 5, complexity: 0, summary: null,
  };
}
const graph: TelosGraph = {
  nodes: [node("A", "A"), node("B", "B")],
  edges: [{ sourceId: "A", targetId: "B", kind: "calls", resolved: true }],
};
const index = buildNodeIndex(graph);

function span(p: Partial<SpanRecord>): SpanRecord {
  return { traceId: "t", spanId: "s", name: "", startNs: 0, durationMs: 1, isError: false, attrs: {}, ...p };
}

describe("TraceAggregator", () => {
  it("aggregates node counts, p95, errors and derives static edges", () => {
    let t = 1000;
    const agg = new TraceAggregator({ windowMs: 30_000, now: () => t });
    agg.ingest([
      span({ spanId: "a1", name: "A", durationMs: 10 }),
      span({ spanId: "a2", name: "A", durationMs: 20 }),
      span({ spanId: "a3", name: "A", durationMs: 30, isError: true }),
      span({ spanId: "b1", name: "B", durationMs: 5, parentSpanId: "a1" }),
    ], index);

    const snap = agg.snapshot();
    const a = snap.nodes.find((n) => n.id === "A")!;
    expect(a.calls).toBe(3);
    expect(a.errors).toBe(1);
    expect(a.p95Ms).toBe(30);
    expect(snap.edges).toEqual([{ sourceId: "A", targetId: "B", calls: 1, errors: 0 }]);
    expect(snap.unmapped).toBe(0);
  });

  it("evicts events older than the window", () => {
    let t = 1000;
    const agg = new TraceAggregator({ windowMs: 100, now: () => t });
    agg.ingest([span({ spanId: "a1", name: "A" })], index);
    t = 2000; // far past the window
    expect(agg.snapshot().nodes).toEqual([]);
  });

  it("tallies unmapped spans without fabricating nodes", () => {
    const agg = new TraceAggregator({ now: () => 1 });
    agg.ingest([span({ spanId: "x", name: "GET /unknown" })], index);
    const snap = agg.snapshot();
    expect(snap.nodes).toEqual([]);
    expect(snap.unmapped).toBe(1);
  });
});
