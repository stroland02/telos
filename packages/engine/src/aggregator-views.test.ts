import { describe, it, expect } from "vitest";
import { aggregate, overview, childrenOf, nodeDetail } from "./aggregator.js";
import { sampleGraph } from "./aggregator.test.js";

describe("overview", () => {
  it("returns layer clusters and inter-layer edges with weights", () => {
    const view = overview(sampleGraph, aggregate(sampleGraph));
    expect(view.nodes.map((n) => n.id).sort()).toEqual(["layer:api", "layer:service"]);
    expect(view.edges).toEqual([{ sourceId: "layer:api", targetId: "layer:service", weight: 1 }]);
  });
});

describe("childrenOf", () => {
  it("drills a layer into its modules", () => {
    const agg = aggregate(sampleGraph);
    const view = childrenOf(sampleGraph, agg, "layer:api")!;
    expect(view.nodes.map((n) => n.id)).toEqual(["module:api:src/api"]);
    expect(view.edges).toEqual([]); // the cross-layer call is not internal to this layer
  });

  it("drills a module into its files", () => {
    const agg = aggregate(sampleGraph);
    const view = childrenOf(sampleGraph, agg, "module:api:src/api")!;
    expect(view.nodes.map((n) => n.id)).toEqual(["f1"]);
    expect(view.edges).toEqual([]); // the only call leaves this module, so nothing internal
  });

  it("drills a file into its leaf symbols", () => {
    const agg = aggregate(sampleGraph);
    const view = childrenOf(sampleGraph, agg, "f1")!;
    expect(view.nodes).toEqual([
      { id: "s1", label: "getUser", level: "symbol", layer: "api", symbolCount: 0, fanIn: 0, fanOut: 1, complexity: 1 },
    ]);
    expect(view.edges).toEqual([]);
  });

  it("returns null for an unknown cluster id", () => {
    expect(childrenOf(sampleGraph, aggregate(sampleGraph), "nope")).toBeNull();
  });
});

describe("nodeDetail", () => {
  it("returns the node with its callers and callees", () => {
    const detail = nodeDetail(sampleGraph, "s2")!;
    expect(detail.node.name).toBe("findUser");
    expect(detail.callers.map((c) => c.id)).toEqual(["f1"]);
    expect(detail.callees).toEqual([]);
  });

  it("returns null for an unknown node id", () => {
    expect(nodeDetail(sampleGraph, "nope")).toBeNull();
  });
});
