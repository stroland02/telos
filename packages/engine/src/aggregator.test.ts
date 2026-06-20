import { describe, it, expect } from "vitest";
import { aggregate } from "./aggregator.js";
import { TelosGraph, TelosNode } from "./schema.js";

function fileNode(id: string, path: string, layer: TelosNode["layer"]): TelosNode {
  return { id, kind: "file", name: path.split("/").pop()!, qualifiedName: path, language: "typescript",
    path, lineStart: 1, lineEnd: 1, layer, fanIn: 0, fanOut: 0, lines: 1, complexity: 0, summary: null };
}
function symNode(id: string, name: string, path: string, layer: TelosNode["layer"], fanIn: number, fanOut: number): TelosNode {
  return { id, kind: "function", name, qualifiedName: `${path}::${name}`, language: "typescript",
    path, lineStart: 1, lineEnd: 5, layer, fanIn, fanOut, lines: 5, complexity: 1, summary: null };
}

export const sampleGraph: TelosGraph = {
  nodes: [
    fileNode("f1", "src/api/userController.ts", "api"),
    symNode("s1", "getUser", "src/api/userController.ts", "api", 0, 1),
    fileNode("f2", "src/services/userService.ts", "service"),
    symNode("s2", "findUser", "src/services/userService.ts", "service", 1, 0),
  ],
  edges: [
    { sourceId: "f1", targetId: "s1", kind: "contains", resolved: true },
    { sourceId: "f2", targetId: "s2", kind: "contains", resolved: true },
    { sourceId: "f1", targetId: "s2", kind: "calls", resolved: true }, // file-rooted call
  ],
};

describe("aggregate", () => {
  it("builds one cluster per layer with rolled-up symbol counts", () => {
    const agg = aggregate(sampleGraph);
    const layers = agg.clusters.filter((c) => c.level === "layer");
    expect(layers.map((c) => c.id).sort()).toEqual(["layer:api", "layer:service"]);
    expect(layers.find((c) => c.id === "layer:api")!.symbolCount).toBe(1);
    expect(layers.find((c) => c.id === "layer:service")!.symbolCount).toBe(1);
  });

  it("nests module under layer and file under module", () => {
    const agg = aggregate(sampleGraph);
    const mod = agg.clusters.find((c) => c.id === "module:api:src/api")!;
    expect(mod.level).toBe("module");
    expect(mod.parentId).toBe("layer:api");
    const file = agg.clusters.find((c) => c.id === "f1")!;
    expect(file.level).toBe("file");
    expect(file.parentId).toBe("module:api:src/api");
    expect(file.childIds).toContain("s1");
  });

  it("maps every symbol and file node to its ancestor clusters", () => {
    const agg = aggregate(sampleGraph);
    expect(agg.membership["s2"]).toEqual({ layerId: "layer:service", moduleId: "module:service:src/services", fileId: "f2" });
    expect(agg.membership["f1"]).toEqual({ layerId: "layer:api", moduleId: "module:api:src/api", fileId: "f1" });
  });
});

describe("aggregate – file-node fanIn/fanOut rollup", () => {
  it("rolls a file node's own fanOut up to file, module, and layer clusters", () => {
    const graph: TelosGraph = {
      nodes: [
        // file node with nonzero fanOut (outgoing calls are file-rooted)
        { id: "fx", kind: "file", name: "router.ts", qualifiedName: "src/api/router.ts",
          language: "typescript", path: "src/api/router.ts", lineStart: 1, lineEnd: 20,
          layer: "api", fanIn: 1, fanOut: 2, lines: 20, complexity: 0, summary: null },
        // one symbol inside the file with its own metrics
        { id: "sx", kind: "function", name: "route", qualifiedName: "src/api/router.ts::route",
          language: "typescript", path: "src/api/router.ts", lineStart: 2, lineEnd: 5,
          layer: "api", fanIn: 3, fanOut: 0, lines: 4, complexity: 1, summary: null },
      ],
      edges: [],
    };
    const agg = aggregate(graph);
    const fileCluster = agg.clusters.find((c) => c.id === "fx")!;
    const modCluster = agg.clusters.find((c) => c.id === "module:api:src/api")!;
    const layerCluster = agg.clusters.find((c) => c.id === "layer:api")!;

    // file node contributes fanIn=1, fanOut=2; symbol adds fanIn=3, fanOut=0
    expect(fileCluster.fanOut).toBe(2);   // from file node
    expect(fileCluster.fanIn).toBe(4);    // 1 (file) + 3 (symbol)
    expect(modCluster.fanOut).toBe(2);
    expect(modCluster.fanIn).toBe(4);
    expect(layerCluster.fanOut).toBe(2);
    expect(layerCluster.fanIn).toBe(4);

    // symbolCount must NOT include the file node itself
    expect(fileCluster.symbolCount).toBe(1);
    expect(modCluster.symbolCount).toBe(1);
    expect(layerCluster.symbolCount).toBe(1);
  });
});

describe("aggregate – root-level files", () => {
  it("places a path-less file under module:<layer>:. nested under its layer", () => {
    const graph: TelosGraph = {
      nodes: [
        { id: "fr", kind: "file", name: "index.ts", qualifiedName: "index.ts",
          language: "typescript", path: "index.ts", lineStart: 1, lineEnd: 5,
          layer: "api", fanIn: 0, fanOut: 0, lines: 5, complexity: 0, summary: null },
      ],
      edges: [],
    };
    const agg = aggregate(graph);
    const modCluster = agg.clusters.find((c) => c.id === "module:api:.")!;
    const layerCluster = agg.clusters.find((c) => c.id === "layer:api")!;

    expect(modCluster).toBeDefined();
    expect(modCluster.level).toBe("module");
    expect(modCluster.parentId).toBe("layer:api");
    expect(layerCluster.childIds).toContain("module:api:.");

    const fileCluster = agg.clusters.find((c) => c.id === "fr")!;
    expect(fileCluster.parentId).toBe("module:api:.");
    expect(agg.membership["fr"]).toEqual({ layerId: "layer:api", moduleId: "module:api:.", fileId: "fr" });
  });
});
