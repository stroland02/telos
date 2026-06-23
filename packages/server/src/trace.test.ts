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
