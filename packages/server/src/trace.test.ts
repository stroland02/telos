// packages/server/src/trace.test.ts
import { describe, it, expect } from "vitest";
import { TelosGraph } from "@telos/engine";
import { buildServer, GraphProvider } from "./server.js";
import { GraphService } from "./graphService.js";

const graph: TelosGraph = {
  nodes: [
    { id: "A", kind: "function", name: "authenticate", qualifiedName: "auth.authenticate", language: "ts", path: "auth.ts", lineStart: 1, lineEnd: 9, layer: "api", fanIn: 0, fanOut: 1, lines: 9, complexity: 1, summary: null },
    { id: "B", kind: "function", name: "hashPassword", qualifiedName: "hashPassword", language: "ts", path: "auth.ts", lineStart: 10, lineEnd: 14, layer: "util", fanIn: 1, fanOut: 0, lines: 5, complexity: 1, summary: null },
  ],
  edges: [{ sourceId: "A", targetId: "B", kind: "calls", resolved: true }],
};

const otlpBody = {
  resourceSpans: [{
    scopeSpans: [{
      spans: [
        { traceId: "t", spanId: "a1", name: "x", startTimeUnixNano: "0", endTimeUnixNano: "12000000",
          attributes: [{ key: "code.namespace", value: { stringValue: "auth" } }, { key: "code.function", value: { stringValue: "authenticate" } }] },
        { traceId: "t", spanId: "b1", parentSpanId: "a1", name: "hashPassword", startTimeUnixNano: "0", endTimeUnixNano: "3000000" },
      ],
    }],
  }],
};

describe("trace overlay routes", () => {
  it("POST /v1/traces ingests and GET /api/trace/state reflects it", async () => {
    const svc = GraphService.fromGraph(graph);
    const app = buildServer(svc);

    const post = await app.inject({ method: "POST", url: "/v1/traces", payload: otlpBody });
    expect(post.statusCode).toBe(200);
    expect(post.json()).toEqual({ partialSuccess: {} });

    const state = await app.inject({ method: "GET", url: "/api/trace/state" });
    expect(state.statusCode).toBe(200);
    const body = state.json();
    const a = body.nodes.find((n: any) => n.id === "A");
    expect(a.calls).toBe(1);
    expect(a.p95Ms).toBe(12);
    expect(body.edges).toEqual([{ sourceId: "A", targetId: "B", calls: 1, errors: 0 }]);
    await app.close();
  });

  it("lists recent traces and replays one by id", async () => {
    const svc = GraphService.fromGraph(graph);
    const app = buildServer(svc);
    await app.inject({ method: "POST", url: "/v1/traces", payload: otlpBody });

    const recent = await app.inject({ method: "GET", url: "/api/trace/recent" });
    expect(recent.statusCode).toBe(200);
    const traces = recent.json().traces;
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ traceId: "t", spanCount: 2 });

    const replay = await app.inject({ method: "GET", url: "/api/trace/replay/t" });
    expect(replay.statusCode).toBe(200);
    const steps = replay.json().steps;
    expect(steps.map((s: any) => s.nodeId)).toEqual(["A", "B"]);

    const missing = await app.inject({ method: "GET", url: "/api/trace/replay/nope" });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it("ingests logs and serves them scoped to a node", async () => {
    const svc = GraphService.fromGraph(graph);
    const app = buildServer(svc);
    const logsBody = {
      resourceLogs: [{ scopeLogs: [{ logRecords: [
        { timeUnixNano: "5", severityText: "ERROR", body: { stringValue: "boom" },
          attributes: [{ key: "code.namespace", value: { stringValue: "auth" } }, { key: "code.function", value: { stringValue: "authenticate" } }] },
        { timeUnixNano: "6", severityText: "INFO", body: { stringValue: "noise" }, attributes: [] },
      ] }] }],
    };
    const post = await app.inject({ method: "POST", url: "/v1/logs", payload: logsBody });
    expect(post.statusCode).toBe(200);

    const scoped = await app.inject({ method: "GET", url: "/api/logs?node=A" });
    expect(scoped.statusCode).toBe(200);
    expect(scoped.json().logs.map((l: any) => l.body)).toEqual(["boom"]);

    const all = await app.inject({ method: "GET", url: "/api/logs" });
    expect(all.json().logs).toHaveLength(2);
    await app.close();
  });

  it("returns 404 when the provider has no trace hub", async () => {
    const minimal: GraphProvider = {
      getOverview: () => ({}), getChildren: () => null, getNode: () => null,
      search: () => [], getFiles: () => [], getFilePaths: () => new Set(), repoRoot: null,
    };
    const app = buildServer(minimal);
    const res = await app.inject({ method: "GET", url: "/api/trace/state" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
