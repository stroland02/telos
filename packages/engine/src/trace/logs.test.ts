import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "../schema.js";
import { buildNodeIndex } from "./match.js";
import { parseOtlpLogs, LogBuffer } from "./logs.js";

function node(id: string, qn: string): TelosNode {
  return {
    id, kind: "function", name: qn, qualifiedName: qn, language: "ts", path: "a.ts",
    lineStart: 1, lineEnd: 5, layer: "service", fanIn: 0, fanOut: 0, lines: 5, complexity: 0, summary: null,
  };
}
const graph: TelosGraph = { nodes: [node("A", "auth.login")], edges: [] };
const index = buildNodeIndex(graph);

const body = {
  resourceLogs: [{
    scopeLogs: [{
      logRecords: [
        { timeUnixNano: "100", severityText: "ERROR", body: { stringValue: "login failed" },
          attributes: [{ key: "code.namespace", value: { stringValue: "auth" } }, { key: "code.function", value: { stringValue: "login" } }] },
        { timeUnixNano: "200", severityText: "INFO", body: { stringValue: "unrelated" }, attributes: [] },
        { body: 123 }, // tolerated
      ],
    }],
  }],
};

describe("parseOtlpLogs", () => {
  it("normalizes log records", () => {
    const logs = parseOtlpLogs(body);
    expect(logs).toHaveLength(3);
    expect(logs[0]).toMatchObject({ ts: 100, severity: "ERROR", body: "login failed" });
    expect(logs[0].attrs["code.function"]).toBe("login");
  });
  it("returns [] for non-OTLP input", () => {
    expect(parseOtlpLogs({})).toEqual([]);
    expect(parseOtlpLogs(null)).toEqual([]);
  });
});

describe("LogBuffer", () => {
  it("tags logs with their node, filters by node, newest-first", () => {
    const buf = new LogBuffer();
    buf.record(parseOtlpLogs(body), index);
    expect(buf.recent({ nodeId: "A" }).map((l) => l.body)).toEqual(["login failed"]);
    expect(buf.unmappedCount()).toBe(2); // INFO + malformed-bodied record both unmapped
    const all = buf.recent();
    expect(all).toHaveLength(3);
    expect(all[2].severity).toBe("ERROR"); // first-inserted is last in newest-first order
  });

  it("evicts oldest beyond capacity", () => {
    const buf = new LogBuffer({ capacity: 2 });
    buf.record([
      { ts: 1, severity: "I", body: "a", attrs: {} },
      { ts: 2, severity: "I", body: "b", attrs: {} },
      { ts: 3, severity: "I", body: "c", attrs: {} },
    ], index);
    expect(buf.recent().map((l) => l.body)).toEqual(["c", "b"]);
  });
});
