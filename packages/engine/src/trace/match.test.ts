import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "../schema.js";
import { buildNodeIndex, matchSpanToNode } from "./match.js";
import { SpanRecord } from "./otlp.js";

function node(id: string, qn: string): TelosNode {
  return {
    id, kind: "function", name: qn.split(".").pop()!, qualifiedName: qn,
    language: "ts", path: "a.ts", lineStart: 1, lineEnd: 5, layer: "service",
    fanIn: 0, fanOut: 0, lines: 5, complexity: 0, summary: null,
  };
}
const graph: TelosGraph = {
  nodes: [node("id-auth", "auth.authenticate"), node("id-hash", "hashPassword")],
  edges: [{ sourceId: "id-auth", targetId: "id-hash", kind: "calls", resolved: true }],
};
const index = buildNodeIndex(graph);

function span(p: Partial<SpanRecord>): SpanRecord {
  return { traceId: "t", spanId: "s", name: "", durationMs: 1, isError: false, attrs: {}, ...p };
}

describe("matchSpanToNode", () => {
  it("matches code.namespace + code.function", () => {
    expect(matchSpanToNode(span({ attrs: { "code.namespace": "auth", "code.function": "authenticate" } }), index)).toBe("id-auth");
  });
  it("falls back to code.function alone", () => {
    expect(matchSpanToNode(span({ attrs: { "code.function": "hashPassword" } }), index)).toBe("id-hash");
  });
  it("falls back to span name", () => {
    expect(matchSpanToNode(span({ name: "auth.authenticate" }), index)).toBe("id-auth");
  });
  it("returns null when nothing matches", () => {
    expect(matchSpanToNode(span({ name: "GET /unknown" }), index)).toBeNull();
  });
  it("records static edge pairs", () => {
    expect(index.edgePairs.has("id-auth id-hash")).toBe(true);
  });
});
