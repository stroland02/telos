import { describe, it, expect } from "vitest";
import { toFlowGraph } from "./layout";
import { GraphView } from "../api/types";

const view: GraphView = {
  nodes: [
    { id: "layer:api", label: "api", level: "layer", layer: "api", symbolCount: 3, fanIn: 0, fanOut: 2, complexity: 0 },
    { id: "layer:service", label: "service", level: "layer", layer: "service", symbolCount: 5, fanIn: 2, fanOut: 0, complexity: 4 },
  ],
  edges: [{ sourceId: "layer:api", targetId: "layer:service", weight: 4 }],
};

describe("toFlowGraph", () => {
  it("maps view nodes to positioned flow nodes with data preserved", () => {
    const g = toFlowGraph(view);
    expect(g.nodes).toHaveLength(2);
    const api = g.nodes.find((n) => n.id === "layer:api")!;
    expect(api.type).toBe("telos");
    expect(api.data.label).toBe("api");
    expect(api.data.symbolCount).toBe(3);
    expect(typeof api.position.x).toBe("number");
    expect(typeof api.position.y).toBe("number");
  });

  it("assigns distinct positions to distinct nodes", () => {
    const g = toFlowGraph(view);
    const [a, b] = g.nodes;
    expect(a.position.x !== b.position.x || a.position.y !== b.position.y).toBe(true);
  });

  it("maps edges with a stable id and weight", () => {
    const g = toFlowGraph(view);
    expect(g.edges).toEqual([
      { id: "layer:api->layer:service", source: "layer:api", target: "layer:service", data: { weight: 4 } },
    ]);
  });

  it("is deterministic across runs", () => {
    expect(toFlowGraph(view)).toEqual(toFlowGraph(view));
  });
});
