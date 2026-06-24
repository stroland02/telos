import { describe, it, expect } from "vitest";
import { TelosGraph } from "@telos/engine";
import { buildServer } from "./server.js";
import { GraphService } from "./graphService.js";

const graph: TelosGraph = {
  nodes: [
    { id: "A", kind: "function", name: "a", qualifiedName: "a", language: "ts", path: "a.ts", lineStart: 1, lineEnd: 5, layer: "service", fanIn: 0, fanOut: 0, lines: 5, complexity: 1, summary: null },
  ],
  edges: [],
};

describe("forge channel", () => {
  it("ingests a diff and reflects it in /api/forge/state", async () => {
    const app = buildServer(GraphService.fromGraph(graph));
    const diff = { added: { nodes: ["x"], edges: [] }, removed: { nodes: [], edges: [] }, changed: [] };
    const post = await app.inject({
      method: "POST", url: "/v1/forge/diff",
      payload: { run: "r1", checkpoint: { turn: 1, costUsd: 0.01 }, diff, stop: null },
    });
    expect(post.statusCode).toBe(200);
    expect(post.json()).toEqual({ ok: true });

    const get = await app.inject({ method: "GET", url: "/api/forge/state" });
    expect(get.statusCode).toBe(200);
    const body = get.json();
    expect(body.state.run).toBe("r1");
    expect(body.state.turn).toBe(1);
    expect(body.state.diff.added.nodes).toEqual(["x"]);
    await app.close();
  });
});
