# Telos Aggregator + API Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Aggregator (engine stage 6) that turns the resolved universal graph into a navigable layer→module→file→symbol hierarchy with rolled-up metrics, and a local Fastify API server (stage 7) that serves semantic-zoom views, node detail, and search to the future web UI.

**Architecture:** The Aggregator is a set of **pure functions in `@telos/engine`** — `aggregate(graph)` builds the cluster hierarchy + membership index; `overview`/`childrenOf`/`nodeDetail` are view selectors that compute level-specific aggregated edges on demand. A new `@telos/server` package wraps a `GraphService` (loads `graph.db`, aggregates once, holds it in memory) behind a Fastify app exposing `/api/overview`, `/api/cluster/:id`, `/api/node/:id`, `/api/search`. The CLI gains a `serve` command. No SQLite schema change — aggregation is in-memory, preserving the Phase 3 enrichment path.

**Tech Stack:** TypeScript ESM (Node ≥20), `@telos/engine` (existing), Fastify, `commander` (existing CLI), Vitest. pnpm workspace monorepo.

## Global Constraints

- **TypeScript ESM throughout.** Every package is `"type": "module"`; all relative imports use explicit `.js` specifiers (e.g. `import { aggregate } from "./aggregator.js"`).
- **Node ≥20.** Root `package.json` pins `"engines": { "node": ">=20" }`.
- **pnpm on this machine** lives at `C:\Users\strol\AppData\Roaming\npm`. In the Bash tool, prepend it first: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm"`. Run package tests with `pnpm -C packages/<pkg> test` or the whole suite with `pnpm -r exec vitest run`.
- **Tests:** Vitest, TDD (RED → GREEN). `tsc -p <pkg>/tsconfig.json --noEmit` must be clean for every touched package before its task's commit. Vitest does NOT typecheck — run `tsc` explicitly.
- **Node `path` fields use forward slashes.** The pipeline normalizes `\\`→`/`, so split on `"/"` manually; do NOT use `node:path` `dirname`/`basename` (they use `\` on Windows).
- **Local-first:** the API server binds `127.0.0.1` only. Default port `5180`.
- **Engine invariant (unchanged):** no stage branches on `language`. The aggregator must not either — it only reads schema fields.
- **Existing schema (do not modify):** `TelosNode { id, kind, name, qualifiedName, language, path, lineStart, lineEnd, layer, fanIn, fanOut, lines, complexity, summary }`; `TelosEdge { sourceId, targetId, kind, resolved }`; `Layer = "api"|"service"|"data"|"ui"|"infra"|"util"|"unknown"`; `NodeKind` includes `"file"`. Calls are **file-rooted in v1**: a `calls` edge's `sourceId` is the caller's **file node id**, its `targetId` is a resolved symbol id (or an unresolved synthetic id). `contains` edges go file → symbol.

---

### Task 1: Aggregator — cluster hierarchy + membership

**Files:**
- Create: `packages/engine/src/aggregator.ts`
- Modify: `packages/engine/src/index.ts` (add export)
- Test: `packages/engine/src/aggregator.test.ts`

**Interfaces:**
- Consumes: `TelosGraph`, `TelosNode`, `Layer` from `./schema.js`.
- Produces:
  ```ts
  export type ClusterLevel = "layer" | "module" | "file";
  export interface ClusterNode {
    id: string;            // "layer:service" | "module:service:src/services" | <fileNode.id>
    level: ClusterLevel;
    label: string;
    layer: Layer;
    parentId: string | null;
    childIds: string[];    // child cluster ids, or (for file clusters) leaf symbol node ids
    symbolCount: number;   // total leaf symbols beneath
    fanIn: number;
    fanOut: number;
  }
  export interface ClusterPath { layerId: string; moduleId: string; fileId: string; }
  export interface AggregatedGraph {
    clusters: ClusterNode[];
    membership: Record<string, ClusterPath>; // every file node id AND every symbol node id
  }
  export function aggregate(graph: TelosGraph): AggregatedGraph;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/src/aggregator.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/engine exec vitest run src/aggregator.test.ts`
Expected: FAIL — `Failed to resolve import "./aggregator.js"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/engine/src/aggregator.ts
import { TelosGraph, TelosNode, Layer } from "./schema.js";

export type ClusterLevel = "layer" | "module" | "file";

export interface ClusterNode {
  id: string;
  level: ClusterLevel;
  label: string;
  layer: Layer;
  parentId: string | null;
  childIds: string[];
  symbolCount: number;
  fanIn: number;
  fanOut: number;
}

export interface ClusterPath { layerId: string; moduleId: string; fileId: string; }

export interface AggregatedGraph {
  clusters: ClusterNode[];
  membership: Record<string, ClusterPath>;
}

function parentDir(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "." : p.slice(0, i);
}
function baseName(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

export function aggregate(graph: TelosGraph): AggregatedGraph {
  const clusters = new Map<string, ClusterNode>();
  const membership: Record<string, ClusterPath> = {};

  const ensureLayer = (layer: Layer): string => {
    const id = `layer:${layer}`;
    if (!clusters.has(id)) {
      clusters.set(id, { id, level: "layer", label: layer, layer, parentId: null, childIds: [], symbolCount: 0, fanIn: 0, fanOut: 0 });
    }
    return id;
  };
  const ensureModule = (layer: Layer, dir: string): string => {
    const layerId = ensureLayer(layer);
    const id = `module:${layer}:${dir}`;
    if (!clusters.has(id)) {
      clusters.set(id, { id, level: "module", label: dir, layer, parentId: layerId, childIds: [], symbolCount: 0, fanIn: 0, fanOut: 0 });
      clusters.get(layerId)!.childIds.push(id);
    }
    return id;
  };
  const ensureFile = (file: TelosNode): string => {
    const moduleId = ensureModule(file.layer, parentDir(file.path));
    if (!clusters.has(file.id)) {
      clusters.set(file.id, { id: file.id, level: "file", label: baseName(file.path), layer: file.layer, parentId: moduleId, childIds: [], symbolCount: 0, fanIn: 0, fanOut: 0 });
      clusters.get(moduleId)!.childIds.push(file.id);
    }
    return file.id;
  };

  const fileNodes = graph.nodes.filter((n) => n.kind === "file");
  const fileByPath = new Map<string, TelosNode>();

  // 1. Materialize all file clusters first, so every symbol has a parent.
  for (const f of fileNodes) {
    fileByPath.set(f.path, f);
    const fileId = ensureFile(f);
    const moduleId = clusters.get(fileId)!.parentId!;
    const layerId = clusters.get(moduleId)!.parentId!;
    membership[f.id] = { layerId, moduleId, fileId };
  }

  // 2. Attach symbols to their file and roll metrics up the chain.
  for (const sym of graph.nodes) {
    if (sym.kind === "file") continue;
    const file = fileByPath.get(sym.path);
    if (!file) continue; // orphan symbol with no file node — skip
    const fileId = file.id;
    const fileCluster = clusters.get(fileId)!;
    fileCluster.childIds.push(sym.id);
    const moduleId = fileCluster.parentId!;
    const layerId = clusters.get(moduleId)!.parentId!;
    membership[sym.id] = { layerId, moduleId, fileId };
    for (const id of [fileId, moduleId, layerId]) {
      const c = clusters.get(id)!;
      c.symbolCount += 1;
      c.fanIn += sym.fanIn;
      c.fanOut += sym.fanOut;
    }
  }

  return { clusters: [...clusters.values()], membership };
}
```

- [ ] **Step 4: Add the export**

In `packages/engine/src/index.ts`, after the existing exports, add:

```ts
export * from "./aggregator.js";
```

- [ ] **Step 5: Run test + typecheck to verify they pass**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/engine exec vitest run src/aggregator.test.ts && pnpm -C packages/engine exec tsc -p tsconfig.json --noEmit`
Expected: 3 tests PASS; tsc prints nothing (clean).

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/aggregator.ts packages/engine/src/aggregator.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): aggregator builds layer/module/file cluster hierarchy"
```

---

### Task 2: Aggregator — view selectors (overview, drill-down, node detail)

**Files:**
- Modify: `packages/engine/src/aggregator.ts` (append selectors)
- Test: `packages/engine/src/aggregator-views.test.ts`

**Interfaces:**
- Consumes: `aggregate`, `AggregatedGraph`, `ClusterNode`, `ClusterLevel` (Task 1); `TelosGraph`, `TelosNode`, `Layer` from `./schema.js`.
- Produces:
  ```ts
  export type ViewLevel = ClusterLevel | "symbol";
  export interface ViewNode { id: string; label: string; level: ViewLevel; layer: Layer; symbolCount: number; fanIn: number; fanOut: number; }
  export interface ViewEdge { sourceId: string; targetId: string; weight: number; }
  export interface GraphView { nodes: ViewNode[]; edges: ViewEdge[]; }
  export interface NodeDetail { node: TelosNode; callers: TelosNode[]; callees: TelosNode[]; }
  export function overview(graph: TelosGraph, agg: AggregatedGraph): GraphView;
  export function childrenOf(graph: TelosGraph, agg: AggregatedGraph, clusterId: string): GraphView | null;
  export function nodeDetail(graph: TelosGraph, nodeId: string): NodeDetail | null;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/src/aggregator-views.test.ts
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

  it("drills a file into its leaf symbols", () => {
    const agg = aggregate(sampleGraph);
    const view = childrenOf(sampleGraph, agg, "f1")!;
    expect(view.nodes).toEqual([
      { id: "s1", label: "getUser", level: "symbol", layer: "api", symbolCount: 0, fanIn: 0, fanOut: 1 },
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
```

> Note: the test imports `sampleGraph` from `./aggregator.test.js`. It is already `export`ed there (Task 1). This keeps one canonical fixture.

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/engine exec vitest run src/aggregator-views.test.ts`
Expected: FAIL — `overview is not a function` / no export `overview`.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/engine/src/aggregator.ts` (after `aggregate`). The existing import from `./schema.js` already includes `TelosNode` and `Layer`, so no import change is needed.

```ts
export type ViewLevel = ClusterLevel | "symbol";
export interface ViewNode { id: string; label: string; level: ViewLevel; layer: Layer; symbolCount: number; fanIn: number; fanOut: number; }
export interface ViewEdge { sourceId: string; targetId: string; weight: number; }
export interface GraphView { nodes: ViewNode[]; edges: ViewEdge[]; }
export interface NodeDetail { node: TelosNode; callers: TelosNode[]; callees: TelosNode[]; }

function clusterToView(c: ClusterNode): ViewNode {
  return { id: c.id, label: c.label, level: c.level, layer: c.layer, symbolCount: c.symbolCount, fanIn: c.fanIn, fanOut: c.fanOut };
}

function memberAt(agg: AggregatedGraph, nodeId: string, level: ClusterLevel): string | undefined {
  const m = agg.membership[nodeId];
  if (!m) return undefined;
  return level === "layer" ? m.layerId : level === "module" ? m.moduleId : m.fileId;
}

function aggregateEdges(graph: TelosGraph, agg: AggregatedGraph, level: ClusterLevel, allowed: Set<string>): ViewEdge[] {
  const weights = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.kind === "contains") continue;
    const s = memberAt(agg, e.sourceId, level);
    const t = memberAt(agg, e.targetId, level);
    if (!s || !t || s === t) continue;
    if (!allowed.has(s) || !allowed.has(t)) continue;
    const key = `${s} ${t}`;
    weights.set(key, (weights.get(key) ?? 0) + 1);
  }
  return [...weights.entries()].map(([k, weight]) => {
    const [sourceId, targetId] = k.split(" ");
    return { sourceId, targetId, weight };
  });
}

export function overview(graph: TelosGraph, agg: AggregatedGraph): GraphView {
  const layers = agg.clusters.filter((c) => c.level === "layer");
  const allowed = new Set(layers.map((c) => c.id));
  return { nodes: layers.map(clusterToView), edges: aggregateEdges(graph, agg, "layer", allowed) };
}

export function childrenOf(graph: TelosGraph, agg: AggregatedGraph, clusterId: string): GraphView | null {
  const parent = agg.clusters.find((c) => c.id === clusterId);
  if (!parent) return null;

  if (parent.level === "file") {
    const childSet = new Set(parent.childIds);
    const nodes: ViewNode[] = graph.nodes
      .filter((n) => childSet.has(n.id))
      .map((n) => ({ id: n.id, label: n.name, level: "symbol" as ViewLevel, layer: n.layer, symbolCount: 0, fanIn: n.fanIn, fanOut: n.fanOut }));
    return { nodes, edges: [] }; // v1 calls are file-rooted: no symbol→symbol edges yet
  }

  const childLevel: ClusterLevel = parent.level === "layer" ? "module" : "file";
  const children = agg.clusters.filter((c) => c.parentId === clusterId);
  const allowed = new Set(children.map((c) => c.id));
  return { nodes: children.map(clusterToView), edges: aggregateEdges(graph, agg, childLevel, allowed) };
}

export function nodeDetail(graph: TelosGraph, nodeId: string): NodeDetail | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const node = byId.get(nodeId);
  if (!node) return null;
  const callers: TelosNode[] = [];
  const callees: TelosNode[] = [];
  for (const e of graph.edges) {
    if (e.kind !== "calls") continue;
    if (e.targetId === nodeId) { const c = byId.get(e.sourceId); if (c) callers.push(c); }
    if (e.sourceId === nodeId) { const c = byId.get(e.targetId); if (c) callees.push(c); }
  }
  return { node, callers, callees };
}
```

- [ ] **Step 4: Run test + typecheck to verify they pass**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/engine exec vitest run src/aggregator-views.test.ts && pnpm -C packages/engine exec tsc -p tsconfig.json --noEmit`
Expected: 6 tests PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/aggregator.ts packages/engine/src/aggregator-views.test.ts
git commit -m "feat(engine): aggregator view selectors for overview, drill-down, node detail"
```

---

### Task 3: Server package scaffold + health route

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/vitest.config.ts`
- Create: `packages/server/src/server.ts`
- Create: `packages/server/src/index.ts`
- Test: `packages/server/src/server.test.ts`

**Interfaces:**
- Consumes: nothing from sibling packages yet (health route only).
- Produces:
  ```ts
  export interface GraphProvider {
    getOverview(): unknown;
    getChildren(id: string): unknown | null;
    getNode(id: string): unknown | null;
    search(q: string): unknown[];
  }
  export function buildServer(provider: GraphProvider): import("fastify").FastifyInstance;
  ```
  `GraphProvider` is the seam the real `GraphService` (Task 4) implements; Task 3 only wires `/api/health`, so a stub provider suffices for its test.

- [ ] **Step 1: Create the package manifest and configs**

```json
// packages/server/package.json
{
  "name": "@telos/server",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run" },
  "dependencies": { "@telos/engine": "workspace:*", "fastify": "^4.28.0" },
  "devDependencies": { "@types/node": "^20.0.0", "typescript": "^5.4.0", "vitest": "^1.6.0" }
}
```

```json
// packages/server/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

```ts
// packages/server/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

> Confirm `packages/cli/tsconfig.json` uses the same `extends`/`outDir`/`rootDir` shape; mirror it if it differs (the base config lives at repo-root `tsconfig.base.json`).

- [ ] **Step 2: Install dependencies**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm install`
Expected: pnpm resolves `fastify` and links `@telos/engine` into the new package; lockfile updates.

- [ ] **Step 3: Write the failing test**

```ts
// packages/server/src/server.test.ts
import { describe, it, expect } from "vitest";
import { buildServer, GraphProvider } from "./server.js";

const stub: GraphProvider = {
  getOverview: () => ({ nodes: [], edges: [] }),
  getChildren: () => null,
  getNode: () => null,
  search: () => [],
};

describe("buildServer health", () => {
  it("GET /api/health returns ok", async () => {
    const app = buildServer(stub);
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/server exec vitest run src/server.test.ts`
Expected: FAIL — `Failed to resolve import "./server.js"`.

- [ ] **Step 5: Write minimal implementation**

```ts
// packages/server/src/server.ts
import Fastify, { FastifyInstance } from "fastify";

export interface GraphProvider {
  getOverview(): unknown;
  getChildren(id: string): unknown | null;
  getNode(id: string): unknown | null;
  search(q: string): unknown[];
}

export function buildServer(_provider: GraphProvider): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/api/health", async () => ({ status: "ok" }));
  return app;
}
```

```ts
// packages/server/src/index.ts
export { buildServer } from "./server.js";
export type { GraphProvider } from "./server.js";
```

- [ ] **Step 6: Run test + typecheck to verify they pass**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/server exec vitest run src/server.test.ts && pnpm -C packages/server exec tsc -p tsconfig.json --noEmit`
Expected: 1 test PASS; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add packages/server/package.json packages/server/tsconfig.json packages/server/vitest.config.ts packages/server/src/server.ts packages/server/src/index.ts packages/server/src/server.test.ts pnpm-lock.yaml
git commit -m "feat(server): scaffold @telos/server with Fastify health route"
```

---

### Task 4: GraphService — load db, aggregate, search

**Files:**
- Create: `packages/server/src/graphService.ts`
- Modify: `packages/server/src/index.ts` (add export)
- Test: `packages/server/src/graphService.test.ts`

**Interfaces:**
- Consumes: `GraphStore`, `aggregate`, `overview`, `childrenOf`, `nodeDetail`, `TelosGraph`, `TelosNode`, `AggregatedGraph`, `GraphView`, `NodeDetail` from `@telos/engine`; `GraphProvider` from `./server.js`.
- Produces:
  ```ts
  export class GraphService implements GraphProvider {
    static fromDb(dbPath: string): GraphService;
    static fromGraph(graph: TelosGraph): GraphService; // in-memory; search falls back to substring
    getOverview(): GraphView;
    getChildren(id: string): GraphView | null;
    getNode(id: string): NodeDetail | null;
    search(q: string): TelosNode[];
    close(): void;
  }
  ```

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/server exec vitest run src/graphService.test.ts`
Expected: FAIL — `Failed to resolve import "./graphService.js"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/server/src/graphService.ts
import {
  GraphStore, aggregate, overview, childrenOf, nodeDetail,
  TelosGraph, TelosNode, AggregatedGraph, GraphView, NodeDetail,
} from "@telos/engine";
import { GraphProvider } from "./server.js";

export class GraphService implements GraphProvider {
  private constructor(
    private readonly graph: TelosGraph,
    private readonly agg: AggregatedGraph,
    private readonly store: GraphStore | null,
  ) {}

  static fromDb(dbPath: string): GraphService {
    const store = GraphStore.open(dbPath);
    const graph = store.loadGraph();
    return new GraphService(graph, aggregate(graph), store);
  }

  static fromGraph(graph: TelosGraph): GraphService {
    return new GraphService(graph, aggregate(graph), null);
  }

  getOverview(): GraphView { return overview(this.graph, this.agg); }
  getChildren(id: string): GraphView | null { return childrenOf(this.graph, this.agg, id); }
  getNode(id: string): NodeDetail | null { return nodeDetail(this.graph, id); }

  search(q: string): TelosNode[] {
    if (this.store) return this.store.search(q);
    const needle = q.toLowerCase();
    return this.graph.nodes.filter(
      (n) => n.name.toLowerCase().includes(needle) || n.qualifiedName.toLowerCase().includes(needle),
    );
  }

  close(): void { this.store?.close(); }
}
```

- [ ] **Step 4: Add the export**

In `packages/server/src/index.ts`, add:

```ts
export { GraphService } from "./graphService.js";
```

- [ ] **Step 5: Run test + typecheck to verify they pass**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/server exec vitest run src/graphService.test.ts && pnpm -C packages/server exec tsc -p tsconfig.json --noEmit`
Expected: 4 tests PASS; tsc clean.

> If tsc reports that `AggregatedGraph`/`GraphView`/`NodeDetail` are not exported from `@telos/engine`, confirm Task 1's `export * from "./aggregator.js"` landed — all aggregator types are re-exported there.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/graphService.ts packages/server/src/index.ts packages/server/src/graphService.test.ts
git commit -m "feat(server): GraphService loads graph.db and serves aggregated views"
```

---

### Task 5: Server graph routes

**Files:**
- Modify: `packages/server/src/server.ts` (add four routes)
- Test: `packages/server/src/server-routes.test.ts`

**Interfaces:**
- Consumes: `GraphService` (Task 4), `buildServer`/`GraphProvider` (Task 3), `GraphStore`, `TelosGraph` from `@telos/engine`.
- Produces: HTTP routes
  - `GET /api/overview` → `GraphView`
  - `GET /api/cluster/:id` → `GraphView`, or `404 { error }`
  - `GET /api/node/:id` → `NodeDetail`, or `404 { error }`
  - `GET /api/search?q=<term>` → `{ results: TelosNode[] }` (empty `results` when `q` missing/blank)

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/src/server-routes.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GraphStore, TelosGraph } from "@telos/engine";
import { buildServer } from "./server.js";
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
function service(): GraphService {
  const dir = mkdtempSync(join(tmpdir(), "telos-routes-"));
  dirs.push(dir);
  const dbPath = join(dir, "graph.db");
  const store = GraphStore.open(dbPath);
  store.save(graph);
  store.close();
  return GraphService.fromDb(dbPath);
}
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = []; });

describe("graph routes", () => {
  it("GET /api/overview returns layer view", async () => {
    const svc = service();
    const app = buildServer(svc);
    const res = await app.inject({ method: "GET", url: "/api/overview" });
    expect(res.statusCode).toBe(200);
    expect(res.json().nodes.map((n: any) => n.id).sort()).toEqual(["layer:api", "layer:service"]);
    await app.close(); svc.close();
  });

  it("GET /api/cluster/:id drills down, 404 on unknown", async () => {
    const svc = service();
    const app = buildServer(svc);
    const ok = await app.inject({ method: "GET", url: "/api/cluster/layer:api" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().nodes[0].id).toBe("module:api:src/api");
    const missing = await app.inject({ method: "GET", url: "/api/cluster/nope" });
    expect(missing.statusCode).toBe(404);
    await app.close(); svc.close();
  });

  it("GET /api/node/:id returns detail, 404 on unknown", async () => {
    const svc = service();
    const app = buildServer(svc);
    const ok = await app.inject({ method: "GET", url: "/api/node/s2" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().node.name).toBe("findUser");
    const missing = await app.inject({ method: "GET", url: "/api/node/nope" });
    expect(missing.statusCode).toBe(404);
    await app.close(); svc.close();
  });

  it("GET /api/search returns results, empty when q blank", async () => {
    const svc = service();
    const app = buildServer(svc);
    const hit = await app.inject({ method: "GET", url: "/api/search?q=findUser" });
    expect(hit.json().results.map((n: any) => n.id)).toContain("s2");
    const blank = await app.inject({ method: "GET", url: "/api/search" });
    expect(blank.json()).toEqual({ results: [] });
    await app.close(); svc.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/server exec vitest run src/server-routes.test.ts`
Expected: FAIL — `/api/overview` returns 404 (route not registered) so the assertion on `statusCode === 200` fails.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `buildServer` in `packages/server/src/server.ts` so it registers all routes (keep the `GraphProvider` interface and the health route). Note `provider` is now used, so drop the underscore.

```ts
export function buildServer(provider: GraphProvider): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/api/health", async () => ({ status: "ok" }));

  app.get("/api/overview", async () => provider.getOverview());

  app.get<{ Params: { id: string } }>("/api/cluster/:id", async (req, reply) => {
    const view = provider.getChildren(req.params.id);
    if (view === null) return reply.code(404).send({ error: "cluster not found" });
    return view;
  });

  app.get<{ Params: { id: string } }>("/api/node/:id", async (req, reply) => {
    const detail = provider.getNode(req.params.id);
    if (detail === null) return reply.code(404).send({ error: "node not found" });
    return detail;
  });

  app.get<{ Querystring: { q?: string } }>("/api/search", async (req) => {
    const q = (req.query.q ?? "").trim();
    return { results: q.length === 0 ? [] : provider.search(q) };
  });

  return app;
}
```

- [ ] **Step 4: Run test + typecheck to verify they pass**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/server exec vitest run && pnpm -C packages/server exec tsc -p tsconfig.json --noEmit`
Expected: all server tests PASS (health + routes); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/server.ts packages/server/src/server-routes.test.ts
git commit -m "feat(server): overview, cluster, node, and search routes"
```

---

### Task 6: CLI `serve` command

**Files:**
- Modify: `packages/cli/package.json` (add `@telos/server` dependency)
- Modify: `packages/cli/src/main.ts` (add `runServe` + `serve` command)
- Test: `packages/cli/src/serve.test.ts`

**Interfaces:**
- Consumes: `GraphService`, `buildServer` from `@telos/server`.
- Produces:
  ```ts
  export async function runServe(opts: { path: string; port: number }): Promise<{ address: string; close: () => Promise<void> }>;
  ```
  Throws `Error` with a `Run 'telos scan'` message when `<repo>/.telos/graph.db` is absent. The `serve` command wires `[path]` (default `.`) and `--port` (default `5180`).

- [ ] **Step 1: Add the dependency**

In `packages/cli/package.json`, add `"@telos/server": "workspace:*"` to `dependencies` (alongside `@telos/engine` and `commander`). Then run:

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm install`
Expected: pnpm links `@telos/server` into the CLI package.

- [ ] **Step 2: Write the failing test**

```ts
// packages/cli/src/serve.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runServe } from "./main.js";

describe("runServe", () => {
  it("rejects with a scan hint when no graph.db exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-serve-"));
    try {
      await expect(runServe({ path: dir, port: 0 })).rejects.toThrow(/telos scan/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/cli exec vitest run src/serve.test.ts`
Expected: FAIL — `runServe is not a function` / no export `runServe`.

- [ ] **Step 4: Write minimal implementation**

In `packages/cli/src/main.ts`: add imports and the `runServe` function, and register the `serve` command inside `buildProgram`. The file already imports `resolve` from `node:path`; extend that import to also pull `join`.

Add/extend imports at the top:

```ts
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { GraphService, buildServer } from "@telos/server";
```

Add `runServe` (next to `runScan`):

```ts
export async function runServe(opts: { path: string; port: number }): Promise<{ address: string; close: () => Promise<void> }> {
  const repo = resolve(opts.path);
  const dbPath = join(repo, ".telos", "graph.db");
  if (!existsSync(dbPath)) {
    throw new Error(`No graph found at ${dbPath}. Run 'telos scan ${opts.path}' first.`);
  }
  const service = GraphService.fromDb(dbPath);
  const app = buildServer(service);
  const address = await app.listen({ port: opts.port, host: "127.0.0.1" });
  return { address, close: async () => { await app.close(); service.close(); } };
}
```

Register the command inside `buildProgram`, after the `scan` command:

```ts
  program.command("serve [path]").description("Serve the architecture API for a scanned repo")
    .option("-p, --port <port>", "port to listen on", "5180")
    .action(async (path: string | undefined, opts: { port: string }) => {
      const { address } = await runServe({ path: path ?? ".", port: Number(opts.port) });
      console.log(`Telos serving the architecture API at ${address}`);
    });
```

- [ ] **Step 5: Run test + typecheck to verify they pass**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/cli exec vitest run && pnpm -C packages/cli exec tsc -p tsconfig.json --noEmit`
Expected: serve test + existing scan test PASS; tsc clean.

- [ ] **Step 6: Smoke-test the live server end-to-end (manual verification only)**

Run (from repo root):
```bash
export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm"
pnpm -r build
node packages/cli/dist/main.js scan packages/engine/fixtures/scan-sample
node packages/cli/dist/main.js serve packages/engine/fixtures/scan-sample --port 5180 &
sleep 1 && curl -s http://127.0.0.1:5180/api/overview && echo && kill %1
```
Expected: JSON with `nodes`/`edges` for the sample repo's layers. Nothing to commit from this step.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/package.json packages/cli/src/main.ts packages/cli/src/serve.test.ts pnpm-lock.yaml
git commit -m "feat(cli): telos serve command starts the architecture API"
```

---

## Self-Review

**1. Spec coverage (stages 6–7):**
- Stage 6 Aggregator — "navigable hierarchy (layer → module/folder → file → symbol), compute metrics for each zoom level": hierarchy ✅ (Task 1), metrics (symbolCount/fanIn/fanOut rolled up) ✅, per-zoom views ✅ (Task 2). **Layout positions (x/y) are intentionally deferred to the web UI (Plan 3)**, where React Flow + a layout library (dagre/elk) computes positions client-side — this avoids duplicating layout math the renderer already owns. Recorded as a deferral, not a gap.
- Stage 7 API server — "local HTTP (Fastify) exposing subgraph by zoom level, node detail, search": `/api/overview` + `/api/cluster/:id` (zoom levels) ✅, `/api/node/:id` ✅, `/api/search` ✅ (Tasks 3–5). Fastify ✅. Local-only bind ✅ (Task 6).
- `telos serve` (spec §2 CLI) ✅ (Task 6).
- Incremental watcher (chokidar, spec §3) — belongs to the engine/scan path, not the API; **out of scope for Plan 2**, tracked below. Noted so it isn't silently dropped.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N" — every step carries full code, exact run commands, and expected output. ✅

**3. Type consistency:** `aggregate`/`overview`/`childrenOf`/`nodeDetail` signatures are identical across the engine tasks and their consumers in `GraphService`. `GraphProvider` (Task 3) is structurally implemented by `GraphService` (Task 4): `getOverview`/`getChildren`/`getNode`/`search` names and arities match. `ClusterNode.id` formats (`layer:<l>`, `module:<l>:<dir>`, `<fileNode.id>`) are used consistently in selectors and tests. Routes return the exact shapes (`GraphView`, `NodeDetail`, `{ results }`) the engine produces. `runServe` returns `{ address, close }` and is the only listen path. ✅

## Carried-forward deferrals (from Plan 1, revisit during/after Plan 2)
- `package.json` `exports` field for `@telos/engine` (currently `main` only).
- Golden auto-write hardening.
- **File-granular → symbol-granular call edges** — once caller granularity exists, `childrenOf(file)` can show real symbol→symbol call edges (currently `[]` by design).
- Language registry auto-discovery (spec §6 "engine auto-discovers these folders").
- `telos scan <nonexistent>` path-existence check.
- Incremental file watcher (chokidar) for near-instant re-scans (spec §3).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-20-telos-aggregator-api.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.
