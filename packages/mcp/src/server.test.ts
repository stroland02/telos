import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "@telos/engine";
import { buildMcpServer } from "./server.js";

function node(id: string): TelosNode {
  return {
    id, kind: "function", name: id, qualifiedName: `m/${id}`, language: "ts",
    path: `m/${id}.ts`, lineStart: 1, lineEnd: 9, layer: "service",
    fanIn: 0, fanOut: 0, lines: 9, complexity: 1, summary: null,
  };
}
function graph(): TelosGraph {
  return {
    nodes: [node("alpha"), node("beta")],
    edges: [{ sourceId: "alpha", targetId: "beta", kind: "calls", resolved: true }],
  };
}

describe("buildMcpServer", () => {
  it("constructs without throwing", () => {
    const server = buildMcpServer({ graph: graph(), store: null });
    expect(server).toBeTruthy();
  });
});
