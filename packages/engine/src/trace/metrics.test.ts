import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "../schema.js";
import { buildNodeIndex } from "./match.js";
import { parseOtlpMetrics, MetricBuffer } from "./metrics.js";

function node(id: string, qn: string): TelosNode {
  return {
    id, kind: "function", name: qn, qualifiedName: qn, language: "ts", path: "a.ts",
    lineStart: 1, lineEnd: 5, layer: "service", fanIn: 0, fanOut: 0, lines: 5, complexity: 0, summary: null,
  };
}
const graph: TelosGraph = { nodes: [node("A", "svc.handle")], edges: [] };
const index = buildNodeIndex(graph);

const attrs = [
  { key: "code.namespace", value: { stringValue: "svc" } },
  { key: "code.function", value: { stringValue: "handle" } },
];
const body = {
  resourceMetrics: [{
    scopeMetrics: [{
      metrics: [
        { name: "latency_ms", unit: "ms", gauge: { dataPoints: [
          { timeUnixNano: "1", asDouble: 12, attributes: attrs },
          { timeUnixNano: "2", asDouble: 20, attributes: attrs },
        ] } },
        { name: "requests", unit: "1", sum: { dataPoints: [
          { timeUnixNano: "1", asInt: "5", attributes: attrs },
        ] } },
        { name: "unmapped_metric", gauge: { dataPoints: [ { timeUnixNano: "1", asDouble: 3, attributes: [] } ] } },
      ],
    }],
  }],
};

describe("parseOtlpMetrics", () => {
  it("parses gauge and sum number points", () => {
    const pts = parseOtlpMetrics(body);
    expect(pts).toHaveLength(4); // 2 latency + 1 requests + 1 unmapped
    expect(pts.find((p) => p.name === "requests")!.value).toBe(5);
    expect(pts.filter((p) => p.name === "latency_ms").map((p) => p.value)).toEqual([12, 20]);
  });
  it("returns [] for non-OTLP input", () => {
    expect(parseOtlpMetrics({})).toEqual([]);
    expect(parseOtlpMetrics(null)).toEqual([]);
  });
});

describe("MetricBuffer", () => {
  it("groups per-node series with latest + recent points", () => {
    const buf = new MetricBuffer();
    buf.record(parseOtlpMetrics(body), index);
    const series = buf.series("A");
    expect(series.map((s) => s.name)).toEqual(["latency_ms", "requests"]); // sorted, unmapped excluded
    const lat = series.find((s) => s.name === "latency_ms")!;
    expect(lat.unit).toBe("ms");
    expect(lat.points).toEqual([12, 20]);
    expect(lat.latest).toBe(20);
    expect(buf.unmappedCount()).toBe(1);
    expect(buf.series("nope")).toEqual([]);
  });

  it("caps each series to perSeries points", () => {
    const buf = new MetricBuffer({ perSeries: 2 });
    buf.record([
      { name: "m", unit: "", ts: 1, value: 1, attrs: { "code.function": "svc.handle" } },
      { name: "m", unit: "", ts: 2, value: 2, attrs: { "code.function": "svc.handle" } },
      { name: "m", unit: "", ts: 3, value: 3, attrs: { "code.function": "svc.handle" } },
    ], index);
    expect(buf.series("A")[0].points).toEqual([2, 3]);
  });
});
