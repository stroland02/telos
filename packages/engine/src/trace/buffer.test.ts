import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "../schema.js";
import { buildNodeIndex } from "./match.js";
import { SpanRecord } from "./otlp.js";
import { TraceBuffer } from "./buffer.js";

function node(id: string, qn: string): TelosNode {
  return {
    id, kind: "function", name: qn, qualifiedName: qn, language: "ts", path: "a.ts",
    lineStart: 1, lineEnd: 5, layer: "service", fanIn: 0, fanOut: 0, lines: 5, complexity: 0, summary: null,
  };
}
const graph: TelosGraph = { nodes: [node("A", "A"), node("B", "B")], edges: [] };
const index = buildNodeIndex(graph);

function span(p: Partial<SpanRecord> & { spanId: string }): SpanRecord {
  return { traceId: "t1", name: "", startNs: 0, durationMs: 1, isError: false, attrs: {}, ...p };
}

describe("TraceBuffer", () => {
  it("summarizes recent traces newest-first", () => {
    const buf = new TraceBuffer();
    buf.record([span({ traceId: "t1", spanId: "r", name: "A", startNs: 100, durationMs: 20 })]);
    buf.record([span({ traceId: "t2", spanId: "r2", name: "B", startNs: 200, durationMs: 5, isError: true })]);
    const recent = buf.recent();
    expect(recent.map((r) => r.traceId)).toEqual(["t2", "t1"]);
    expect(recent[0]).toMatchObject({ rootName: "B", spanCount: 1, hasError: true });
  });

  it("merges spans of one trace arriving across batches and builds a chronological path", () => {
    const buf = new TraceBuffer();
    buf.record([span({ spanId: "a1", name: "A", startNs: 100, durationMs: 25 })]);
    buf.record([span({ spanId: "b1", name: "B", parentSpanId: "a1", startNs: 200, durationMs: 5, isError: true })]);
    const path = buf.path("t1", index)!;
    expect(path.map((s) => s.name)).toEqual(["A", "B"]);
    expect(path[0]).toMatchObject({ nodeId: "A", depth: 0 });
    expect(path[1]).toMatchObject({ nodeId: "B", depth: 1, isError: true });
  });

  it("maps unknown spans to null nodeId and returns null for unknown traces", () => {
    const buf = new TraceBuffer();
    buf.record([span({ spanId: "x", name: "GET /unknown", startNs: 1 })]);
    expect(buf.path("t1", index)![0].nodeId).toBeNull();
    expect(buf.path("nope", index)).toBeNull();
  });

  it("evicts oldest traces beyond capacity", () => {
    const buf = new TraceBuffer({ capacity: 2 });
    buf.record([span({ traceId: "t1", spanId: "a", startNs: 1 })]);
    buf.record([span({ traceId: "t2", spanId: "b", startNs: 2 })]);
    buf.record([span({ traceId: "t3", spanId: "c", startNs: 3 })]);
    expect(buf.recent().map((r) => r.traceId)).toEqual(["t3", "t2"]);
  });
});
