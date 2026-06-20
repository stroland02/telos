// packages/server/src/graphService.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GraphStore, TelosGraph } from "@telos/engine";
import { GraphService } from "./graphService.js";

const graph: TelosGraph = {
  nodes: [
    { id: "f1", kind: "file", name: "userController.ts", qualifiedName: "src/api/userController.ts", language: "typescript", path: "src/api/userController.ts", lineStart: 1, lineEnd: 1, layer: "api", fanIn: 0, fanOut: 0, lines: 1, complexity: 0, summary: null },
    { id: "s2", kind: "function", name: "findUser", qualifiedName: "src/services/userService.ts::findUser", language: "typescript", path: "src/services/userService.ts", lineStart: 1, lineEnd: 5, layer: "service", fanIn: 1, fanOut: 0, lines: 5, complexity: 1, summary: null },
    { id: "f2", kind: "file", name: "userService.ts", qualifiedName: "src/services/userService.ts", language: "typescript", path: "src/services/userService.ts", lineStart: 1, lineEnd: 1, layer: "service", fanIn: 0, fanOut: 0, lines: 1, complexity: 0, summary: null },
  ],
  edges: [
    { sourceId: "f2", targetId: "s2", kind: "contains", resolved: true },
    { sourceId: "f1", targetId: "s2", kind: "calls", resolved: true },
  ],
};

let dirs: string[] = [];
function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "telos-svc-"));
  dirs.push(dir);
  const dbPath = join(dir, "graph.db");
  const store = GraphStore.open(dbPath);
  store.save(graph);
  store.close();
  return dbPath;
}
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = []; });

describe("GraphService.fromDb", () => {
  it("serves overview built from the persisted graph", () => {
    const svc = GraphService.fromDb(tempDb());
    const overview = svc.getOverview();
    expect(overview.nodes.map((n) => n.id).sort()).toEqual(["layer:api", "layer:service"]);
    svc.close();
  });

  it("returns node detail with callers", () => {
    const svc = GraphService.fromDb(tempDb());
    const detail = svc.getNode("s2")!;
    expect(detail.node.name).toBe("findUser");
    expect(detail.callers.map((c) => c.id)).toEqual(["f1"]);
    svc.close();
  });

  it("searches symbols by name via the store FTS", () => {
    const svc = GraphService.fromDb(tempDb());
    const hits = svc.search("findUser");
    expect(hits.map((n) => n.id)).toContain("s2");
    svc.close();
  });

  it("returns null for unknown cluster and node ids", () => {
    const svc = GraphService.fromDb(tempDb());
    expect(svc.getChildren("nope")).toBeNull();
    expect(svc.getNode("nope")).toBeNull();
    svc.close();
  });
});
