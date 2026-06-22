# Telos MCP Agent Layer (Phase 1.5a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the existing Telos graph as a local MCP server so AI coding agents answer structural questions (`explore`/`callers`/`callees`/`impact`/`affected`) from the pre-built index instead of grepping — the measurable cost-saving pillar.

**Architecture:** A new pure-functional query module in `packages/engine` (shared with the existing Fastify server so HTTP and MCP return identical results), wrapped by a new `packages/mcp` package that serves the five tools over MCP stdio. Read-only over `.telos/graph.db`; **no engine/schema changes**. A `telos mcp` CLI command launches it.

**Tech Stack:** TypeScript (ESM, Node ≥20), `@modelcontextprotocol/sdk` (stdio transport), `better-sqlite3`+FTS5 (existing), Vitest, pnpm workspace.

## Global Constraints

- **Node ≥ 20**, TypeScript **ESM**; intra-package imports use **`.js`** specifiers (e.g. `import { x } from "./query.js"`).
- **pnpm workspace**; new package name **`@telos/mcp`**, version `0.0.0`, `"type": "module"`.
- **No changes to `packages/engine/src/schema.ts`, `store.ts`, or the SQLite schema.** This phase is read-only over the existing graph.
- Query functions are **pure** (input: `TelosGraph` [+ optional `GraphStore` for FTS]; output: plain data). No I/O inside traversal.
- Tests: **Vitest**, colocated `*.test.ts`. Run from repo root with `pnpm -C packages/<pkg> test`.
- Reuse existing types from `@telos/engine` (`TelosNode`, `TelosEdge`, `TelosGraph`, `GraphStore`). Do **not** redefine them.
- Edge semantics: `calls` source→target means "source calls target". Dependency edges (for impact) are `calls | imports | references | inherits | implements`.

---

### Task 1: Node resolution helper + `calleesOf`/`callersOf` (direct)

**Files:**
- Create: `packages/engine/src/query.ts`
- Test: `packages/engine/src/query.test.ts`
- Modify: `packages/engine/src/index.ts` (add export)

**Interfaces:**
- Consumes: `TelosGraph`, `TelosNode`, `TelosEdge` from `./schema.js`.
- Produces:
  - `resolveNode(graph: TelosGraph, ref: string): TelosNode | null` — matches by exact `id`, else exact `qualifiedName`, else exact `name` (first match by `path` sort).
  - `calleesOf(graph: TelosGraph, ref: string): TelosNode[]` — direct `calls` targets of the resolved node.
  - `callersOf(graph: TelosGraph, ref: string): TelosNode[]` — direct `calls` sources pointing at the resolved node.
  - Both return `[]` for an unknown ref. Results sorted by `qualifiedName`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/engine/src/query.test.ts
import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "./schema.js";
import { resolveNode, calleesOf, callersOf } from "./query.js";

function node(id: string): TelosNode {
  return {
    id, kind: "function", name: id, qualifiedName: `m/${id}`, language: "ts",
    path: `m/${id}.ts`, lineStart: 1, lineEnd: 9, layer: "service",
    fanIn: 0, fanOut: 0, lines: 9, complexity: 1, summary: null,
  };
}
function g(): TelosGraph {
  return {
    nodes: [node("a"), node("b"), node("c")],
    edges: [
      { sourceId: "a", targetId: "b", kind: "calls", resolved: true },
      { sourceId: "b", targetId: "c", kind: "calls", resolved: true },
    ],
  };
}

describe("resolveNode", () => {
  it("resolves by id, then qualifiedName, then name", () => {
    const graph = g();
    expect(resolveNode(graph, "a")?.id).toBe("a");
    expect(resolveNode(graph, "m/b")?.id).toBe("b");
    expect(resolveNode(graph, "c")?.id).toBe("c");
    expect(resolveNode(graph, "nope")).toBeNull();
  });
});

describe("callees/callers (direct)", () => {
  it("calleesOf returns direct call targets", () => {
    expect(calleesOf(g(), "a").map((n) => n.id)).toEqual(["b"]);
  });
  it("callersOf returns direct callers", () => {
    expect(callersOf(g(), "c").map((n) => n.id)).toEqual(["b"]);
  });
  it("returns [] for unknown ref", () => {
    expect(calleesOf(g(), "zzz")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/engine test -- query`
Expected: FAIL — `Cannot find module './query.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/engine/src/query.ts
import { TelosGraph, TelosNode } from "./schema.js";

const byQName = (a: TelosNode, b: TelosNode) => a.qualifiedName.localeCompare(b.qualifiedName);

export function resolveNode(graph: TelosGraph, ref: string): TelosNode | null {
  return (
    graph.nodes.find((n) => n.id === ref) ??
    graph.nodes.find((n) => n.qualifiedName === ref) ??
    [...graph.nodes].sort((a, b) => a.path.localeCompare(b.path)).find((n) => n.name === ref) ??
    null
  );
}

export function calleesOf(graph: TelosGraph, ref: string): TelosNode[] {
  const node = resolveNode(graph, ref);
  if (!node) return [];
  const ids = new Set(graph.edges.filter((e) => e.kind === "calls" && e.sourceId === node.id).map((e) => e.targetId));
  return graph.nodes.filter((n) => ids.has(n.id)).sort(byQName);
}

export function callersOf(graph: TelosGraph, ref: string): TelosNode[] {
  const node = resolveNode(graph, ref);
  if (!node) return [];
  const ids = new Set(graph.edges.filter((e) => e.kind === "calls" && e.targetId === node.id).map((e) => e.sourceId));
  return graph.nodes.filter((n) => ids.has(n.id)).sort(byQName);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/engine test -- query`
Expected: PASS (5 assertions).

- [ ] **Step 5: Export + commit**

Add to `packages/engine/src/index.ts`:
```typescript
export * from "./query.js";
```
Then:
```bash
git add packages/engine/src/query.ts packages/engine/src/query.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): add graph query module — resolveNode, callers/callees"
```

---

### Task 2: `impactOf` — transitive blast radius

**Files:**
- Modify: `packages/engine/src/query.ts`
- Test: `packages/engine/src/query.test.ts` (append)

**Interfaces:**
- Produces: `impactOf(graph: TelosGraph, ref: string): TelosNode[]` — every node that **transitively depends on** the resolved node (reverse closure over dependency edges `calls|imports|references|inherits|implements`). Excludes the node itself. Sorted by `qualifiedName`.

- [ ] **Step 1: Write the failing test**

```typescript
// append to packages/engine/src/query.test.ts
import { impactOf } from "./query.js";

describe("impactOf", () => {
  it("returns the transitive reverse-dependency closure", () => {
    // a -> b -> c  (calls). Impact of c = {a, b}; impact of a = {}.
    expect(impactOf(g(), "c").map((n) => n.id)).toEqual(["a", "b"]);
    expect(impactOf(g(), "a")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/engine test -- query`
Expected: FAIL — `impactOf is not a function`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// add to packages/engine/src/query.ts
const DEP_KINDS = new Set(["calls", "imports", "references", "inherits", "implements"]);

export function impactOf(graph: TelosGraph, ref: string): TelosNode[] {
  const node = resolveNode(graph, ref);
  if (!node) return [];
  // reverse adjacency: target -> [sources that depend on it]
  const rev = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!DEP_KINDS.has(e.kind)) continue;
    const list = rev.get(e.targetId) ?? [];
    list.push(e.sourceId);
    rev.set(e.targetId, list);
  }
  const seen = new Set<string>();
  const stack = [node.id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const dep of rev.get(cur) ?? []) {
      if (dep === node.id || seen.has(dep)) continue;
      seen.add(dep);
      stack.push(dep);
    }
  }
  return graph.nodes.filter((n) => seen.has(n.id)).sort(byQName);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/engine test -- query`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/query.ts packages/engine/src/query.test.ts
git commit -m "feat(engine): add impactOf transitive blast-radius query"
```

---

### Task 3: `affectedBy` — symbols + files impacted by changed paths

**Files:**
- Modify: `packages/engine/src/query.ts`
- Test: `packages/engine/src/query.test.ts` (append)

**Interfaces:**
- Produces: `affectedBy(graph: TelosGraph, paths: string[]): { symbols: TelosNode[]; files: string[] }` — start from every node whose `path` is in `paths`; union those nodes with their `impactOf` closure; `symbols` = that union sorted by `qualifiedName`; `files` = distinct `path`s of `symbols`, sorted. Path matching is exact on the graph's forward-slash `path` values.

- [ ] **Step 1: Write the failing test**

```typescript
// append to packages/engine/src/query.test.ts
import { affectedBy } from "./query.js";

describe("affectedBy", () => {
  it("returns changed-file symbols plus their reverse-dependency closure", () => {
    // change c.ts -> affected symbols = {a, b, c}; files = their paths
    const r = affectedBy(g(), ["m/c.ts"]);
    expect(r.symbols.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(r.files).toEqual(["m/a.ts", "m/b.ts", "m/c.ts"]);
  });
  it("empty paths -> empty result", () => {
    expect(affectedBy(g(), [])).toEqual({ symbols: [], files: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/engine test -- query`
Expected: FAIL — `affectedBy is not a function`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// add to packages/engine/src/query.ts
export function affectedBy(graph: TelosGraph, paths: string[]): { symbols: TelosNode[]; files: string[] } {
  if (paths.length === 0) return { symbols: [], files: [] };
  const pathSet = new Set(paths);
  const seeds = graph.nodes.filter((n) => pathSet.has(n.path));
  const acc = new Map<string, TelosNode>();
  for (const seed of seeds) {
    acc.set(seed.id, seed);
    for (const dep of impactOf(graph, seed.id)) acc.set(dep.id, dep);
  }
  const symbols = [...acc.values()].sort(byQName);
  const files = [...new Set(symbols.map((n) => n.path))].sort();
  return { symbols, files };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/engine test -- query`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/query.ts packages/engine/src/query.test.ts
git commit -m "feat(engine): add affectedBy query for changed-path impact"
```

---

### Task 4: `explore` — one-call structural answer

**Files:**
- Modify: `packages/engine/src/query.ts`
- Test: `packages/engine/src/query.test.ts` (append)

**Interfaces:**
- Produces:
  - `interface ExploreHit { node: TelosNode; callers: string[]; callees: string[]; impactCount: number }`
  - `explore(graph: TelosGraph, matches: TelosNode[], opts?: { limit?: number }): { hits: ExploreHit[] }` — for each matched node (capped at `opts.limit ?? 8`), attach `callers`/`callees` (qualifiedNames, direct) and `impactCount` (size of `impactOf`). The caller supplies `matches` (from FTS or name filter) so this stays pure and store-free.

- [ ] **Step 1: Write the failing test**

```typescript
// append to packages/engine/src/query.test.ts
import { explore } from "./query.js";

describe("explore", () => {
  it("annotates each match with callers, callees, impactCount", () => {
    const graph = g();
    const matches = graph.nodes.filter((n) => n.id === "b");
    const { hits } = explore(graph, matches);
    expect(hits).toHaveLength(1);
    expect(hits[0].callers).toEqual(["m/a"]);
    expect(hits[0].callees).toEqual(["m/c"]);
    expect(hits[0].impactCount).toBe(1); // a depends on b
  });
  it("honors limit", () => {
    const graph = g();
    expect(explore(graph, graph.nodes, { limit: 2 }).hits).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/engine test -- query`
Expected: FAIL — `explore is not a function`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// add to packages/engine/src/query.ts
export interface ExploreHit { node: TelosNode; callers: string[]; callees: string[]; impactCount: number }

export function explore(
  graph: TelosGraph,
  matches: TelosNode[],
  opts: { limit?: number } = {},
): { hits: ExploreHit[] } {
  const limit = opts.limit ?? 8;
  const hits = matches.slice(0, limit).map((node) => ({
    node,
    callers: callersOf(graph, node.id).map((n) => n.qualifiedName),
    callees: calleesOf(graph, node.id).map((n) => n.qualifiedName),
    impactCount: impactOf(graph, node.id).length,
  }));
  return { hits };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/engine test -- query`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/query.ts packages/engine/src/query.test.ts
git commit -m "feat(engine): add explore one-call structural query"
```

---

### Task 5: Scaffold `@telos/mcp` package

**Files:**
- Create: `packages/mcp/package.json`
- Create: `packages/mcp/tsconfig.json`
- Create: `packages/mcp/vitest.config.ts`
- Create: `packages/mcp/src/index.ts` (placeholder entry)

**Interfaces:**
- Produces: a buildable/testable package `@telos/mcp` depending on `@telos/engine` and `@modelcontextprotocol/sdk`.

- [ ] **Step 1: Create `packages/mcp/package.json`**

```json
{
  "name": "@telos/mcp",
  "version": "0.0.0",
  "type": "module",
  "bin": { "telos-mcp": "dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@telos/engine": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/mcp/tsconfig.json`**

First Read `packages/server/tsconfig.json` and copy its compiler settings exactly (same `target`/`module`/`moduleResolution`/`outDir`/`rootDir`, and the same `extends` if it extends a root config), pointing `include` at `src`. This guarantees the new package matches the workspace's existing ESM build settings.

- [ ] **Step 3: Create `packages/mcp/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
```

- [ ] **Step 4: Create placeholder `packages/mcp/src/index.ts`**

```typescript
export const TELOS_MCP_READY = true;
```

- [ ] **Step 5: Install + verify the workspace links**

Run: `pnpm install`
Expected: completes; `@telos/mcp` resolves `@telos/engine` via `workspace:*` and adds `@modelcontextprotocol/sdk` + `zod`.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/package.json packages/mcp/tsconfig.json packages/mcp/vitest.config.ts packages/mcp/src/index.ts pnpm-lock.yaml
git commit -m "chore(mcp): scaffold @telos/mcp package"
```

---

### Task 6: Tool handlers (pure, store-backed `explore`)

**Files:**
- Create: `packages/mcp/src/tools.ts`
- Test: `packages/mcp/src/tools.test.ts`

**Interfaces:**
- Consumes: `@telos/engine` (`GraphStore`, query fns, `TelosGraph`, `TelosNode`, `ExploreHit`).
- Produces:
  - `interface ToolContext { graph: TelosGraph; store: GraphStore | null }`
  - `runExplore(ctx, args: { query: string; limit?: number }): { hits: ExploreHit[] }` — uses `ctx.store.search(query)` when a store is present, else a case-insensitive name/qualifiedName filter over `ctx.graph.nodes`, then calls engine `explore`.
  - `runCallers(ctx, args: { symbol: string }): TelosNode[]`
  - `runCallees(ctx, args: { symbol: string }): TelosNode[]`
  - `runImpact(ctx, args: { symbol: string }): TelosNode[]`
  - `runAffected(ctx, args: { paths: string[] }): { symbols: TelosNode[]; files: string[] }`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp/src/tools.test.ts
import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "@telos/engine";
import { runExplore, runCallers, runImpact, ToolContext } from "./tools.js";

function node(id: string): TelosNode {
  return {
    id, kind: "function", name: id, qualifiedName: `m/${id}`, language: "ts",
    path: `m/${id}.ts`, lineStart: 1, lineEnd: 9, layer: "service",
    fanIn: 0, fanOut: 0, lines: 9, complexity: 1, summary: null,
  };
}
function ctx(): ToolContext {
  const graph: TelosGraph = {
    nodes: [node("alpha"), node("beta")],
    edges: [{ sourceId: "alpha", targetId: "beta", kind: "calls", resolved: true }],
  };
  return { graph, store: null }; // null store -> name-filter fallback
}

describe("tool handlers", () => {
  it("runExplore finds by name and annotates", () => {
    const { hits } = runExplore(ctx(), { query: "beta" });
    expect(hits.map((h) => h.node.id)).toEqual(["beta"]);
    expect(hits[0].callers).toEqual(["m/alpha"]);
  });
  it("runCallers returns direct callers", () => {
    expect(runCallers(ctx(), { symbol: "beta" }).map((n) => n.id)).toEqual(["alpha"]);
  });
  it("runImpact returns reverse closure", () => {
    expect(runImpact(ctx(), { symbol: "beta" }).map((n) => n.id)).toEqual(["alpha"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/mcp test`
Expected: FAIL — `Cannot find module './tools.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/mcp/src/tools.ts
import {
  GraphStore, TelosGraph, TelosNode,
  callersOf, calleesOf, impactOf, affectedBy, explore, ExploreHit,
} from "@telos/engine";

export interface ToolContext { graph: TelosGraph; store: GraphStore | null }

function matchNodes(ctx: ToolContext, query: string): TelosNode[] {
  if (ctx.store) return ctx.store.search(query);
  const needle = query.toLowerCase();
  return ctx.graph.nodes.filter(
    (n) => n.name.toLowerCase().includes(needle) || n.qualifiedName.toLowerCase().includes(needle),
  );
}

export function runExplore(ctx: ToolContext, args: { query: string; limit?: number }): { hits: ExploreHit[] } {
  return explore(ctx.graph, matchNodes(ctx, args.query), { limit: args.limit });
}
export function runCallers(ctx: ToolContext, args: { symbol: string }): TelosNode[] {
  return callersOf(ctx.graph, args.symbol);
}
export function runCallees(ctx: ToolContext, args: { symbol: string }): TelosNode[] {
  return calleesOf(ctx.graph, args.symbol);
}
export function runImpact(ctx: ToolContext, args: { symbol: string }): TelosNode[] {
  return impactOf(ctx.graph, args.symbol);
}
export function runAffected(ctx: ToolContext, args: { paths: string[] }): { symbols: TelosNode[]; files: string[] } {
  return affectedBy(ctx.graph, args.paths);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/mcp test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/tools.ts packages/mcp/src/tools.test.ts
git commit -m "feat(mcp): tool handlers over engine query layer"
```

---

### Task 7: MCP server — register the five tools over stdio

**Files:**
- Modify: `packages/mcp/src/index.ts` (replace placeholder)
- Create: `packages/mcp/src/server.ts`
- Test: `packages/mcp/src/server.test.ts`

**Interfaces:**
- Consumes: `@modelcontextprotocol/sdk` (`McpServer` from `.../server/mcp.js`, `StdioServerTransport` from `.../server/stdio.js`), `zod`, tool handlers from `./tools.js`.
- Produces:
  - `buildMcpServer(ctx: ToolContext): McpServer` — registers tools `telos_explore`, `telos_callers`, `telos_callees`, `telos_impact`, `telos_affected`, each returning `{ content: [{ type: "text", text: JSON.stringify(result) }] }`.
  - `startStdio(ctx: ToolContext): Promise<void>` — connects the server to a `StdioServerTransport`.

- [ ] **Step 1: Write the failing test** (server constructs without throwing)

```typescript
// packages/mcp/src/server.test.ts
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
  return { nodes: [node("alpha"), node("beta")], edges: [
    { sourceId: "alpha", targetId: "beta", kind: "calls", resolved: true },
  ] };
}

describe("buildMcpServer", () => {
  it("constructs without throwing", () => {
    const server = buildMcpServer({ graph: graph(), store: null });
    expect(server).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/mcp test -- server`
Expected: FAIL — `Cannot find module './server.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/mcp/src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ToolContext, runExplore, runCallers, runCallees, runImpact, runAffected } from "./tools.js";

const asText = (result: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] });

export function buildMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "telos", version: "0.1.0" });

  server.tool("telos_explore", "Structural answer for a query: matching symbols with callers, callees, impact.",
    { query: z.string(), limit: z.number().optional() },
    async (args) => asText(runExplore(ctx, args)));

  server.tool("telos_callers", "Direct callers of a symbol (by id, qualified name, or name).",
    { symbol: z.string() }, async (args) => asText(runCallers(ctx, args)));

  server.tool("telos_callees", "Direct callees of a symbol.",
    { symbol: z.string() }, async (args) => asText(runCallees(ctx, args)));

  server.tool("telos_impact", "Transitive blast radius: everything that depends on a symbol.",
    { symbol: z.string() }, async (args) => asText(runImpact(ctx, args)));

  server.tool("telos_affected", "Symbols and files impacted by a set of changed paths.",
    { paths: z.array(z.string()) }, async (args) => asText(runAffected(ctx, args)));

  return server;
}

export async function startStdio(ctx: ToolContext): Promise<void> {
  const server = buildMcpServer(ctx);
  await server.connect(new StdioServerTransport());
}
```

Then set `packages/mcp/src/index.ts`:
```typescript
export { buildMcpServer, startStdio } from "./server.js";
export * from "./tools.js";
```

> Note: if the installed SDK version exposes `registerTool(name, { description, inputSchema }, handler)` instead of the `tool(name, description, shape, handler)` signature above, adjust the five calls to the SDK's current signature — check `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` for the exact shape. The tool names, descriptions, zod shapes, and `asText` handlers stay the same.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/mcp test -- server`
Expected: PASS.

- [ ] **Step 5: Build to confirm types**

Run: `pnpm -C packages/mcp build`
Expected: tsc exits 0, emits `dist/index.js`.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/server.ts packages/mcp/src/server.test.ts packages/mcp/src/index.ts
git commit -m "feat(mcp): MCP server registering the five Telos tools over stdio"
```

---

### Task 8: Loader — open `.telos/graph.db` into a `ToolContext`

**Files:**
- Create: `packages/mcp/src/load.ts`
- Test: `packages/mcp/src/load.test.ts`

**Interfaces:**
- Consumes: `@telos/engine` (`GraphStore`), `./tools.js` (`ToolContext`).
- Produces: `loadContext(dbPath: string): ToolContext` — opens the store, loads the graph, returns `{ graph, store }`. Throws a clear `Error` (message contains `graph.db`) if `dbPath` does not exist.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/mcp/src/load.test.ts
import { describe, it, expect } from "vitest";
import { loadContext } from "./load.js";

describe("loadContext", () => {
  it("throws a clear error when the db is missing", () => {
    expect(() => loadContext("does/not/exist.db")).toThrow(/graph\.db/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/mcp test -- load`
Expected: FAIL — `Cannot find module './load.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/mcp/src/load.ts
import { existsSync } from "node:fs";
import { GraphStore } from "@telos/engine";
import { ToolContext } from "./tools.js";

export function loadContext(dbPath: string): ToolContext {
  if (!existsSync(dbPath)) {
    throw new Error(`Telos graph.db not found at "${dbPath}". Run \`telos scan\` first.`);
  }
  const store = GraphStore.open(dbPath);
  return { graph: store.loadGraph(), store };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/mcp test -- load`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/load.ts packages/mcp/src/load.test.ts
git commit -m "feat(mcp): loadContext opens graph.db into a ToolContext"
```

---

### Task 9: CLI command `telos mcp`

**Files:**
- Modify: `packages/cli/src/main.ts` (add `mcp` subcommand)
- Modify: `packages/cli/package.json` (add `@telos/mcp` dep)
- Test: `packages/cli/src/main.test.ts` (append)

**Interfaces:**
- Consumes: `@telos/mcp` (`loadContext`, `startStdio`).
- Produces: `telos mcp [--db <path>]` — defaults `--db` to `.telos/graph.db` under `process.cwd()`; loads the context and calls `startStdio`. On a missing db, prints the loader error to stderr and exits 1.

- [ ] **Step 1: Read `packages/cli/src/main.ts`** to match the existing command-registration pattern (commander). Note how `scan` and `serve` are registered and how `@telos/server` is imported, then mirror it. Identify whether the file exposes a testable factory (e.g. `buildProgram()`); if not, the next step extracts one.

- [ ] **Step 2: Write the failing test**

```typescript
// append to packages/cli/src/main.test.ts
import { buildProgram } from "./main.js"; // adapt to the file's actual export
import { describe, it, expect } from "vitest";

describe("telos mcp command", () => {
  it("is registered", () => {
    const program = buildProgram();
    const names = program.commands.map((c: { name(): string }) => c.name());
    expect(names).toContain("mcp");
  });
});
```

> If `main.ts` has no `buildProgram()` factory, first extract one: move the existing `scan`/`serve` registration into an exported `export function buildProgram(): Command { ... return program; }`, and have the executable entry call `buildProgram().parse()`. Keep all existing behavior identical. Then this test compiles.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm -C packages/cli test -- main`
Expected: FAIL — `mcp` not in command names.

- [ ] **Step 4: Add the command + dependency**

In `packages/cli/src/main.ts`, alongside the existing `serve` registration:
```typescript
import { loadContext, startStdio } from "@telos/mcp";
import { resolve } from "node:path";

program
  .command("mcp")
  .description("Serve the Telos graph to AI agents over MCP (stdio)")
  .option("--db <path>", "path to graph.db", ".telos/graph.db")
  .action(async (opts: { db: string }) => {
    try {
      const ctx = loadContext(resolve(process.cwd(), opts.db));
      await startStdio(ctx);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });
```
Add to `packages/cli/package.json` dependencies: `"@telos/mcp": "workspace:*"`, then run `pnpm install`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -C packages/cli test -- main`
Expected: PASS.

- [ ] **Step 6: Manual smoke test**

Build, then run in a repo that has a `.telos/graph.db` (created by `telos scan`):
```bash
pnpm -C packages/cli build
node packages/cli/dist/main.js mcp --db .telos/graph.db
```
Expected: process starts and waits on stdio without crashing. Ctrl-C to exit. With no db present, it prints the "graph.db not found … Run `telos scan` first." message and exits 1.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/main.ts packages/cli/src/main.test.ts packages/cli/package.json pnpm-lock.yaml
git commit -m "feat(cli): add 'telos mcp' command to serve the graph over MCP"
```

---

## Out of scope (own later plans)

- **Harness Fusion (Phase 1.5b)** — orchestrating ECC/Superpowers/Headroom, the curation layer, the capability router, and drift-resilience (`telos doctor`, `harness.lock`). Spec already written: `docs/superpowers/specs/2026-06-21-telos-agent-layer-and-harness-fusion-design.md`.
- **Generating the agent-side MCP config** (Claude Code / Cursor registration) and the **token-savings benchmark** harness — follow-up to this plan.
- **Headroom compression** of `telos_explore` payloads — depends on the harness fusion plan.

## Self-Review notes

- **Spec coverage:** §3.2 tools (explore/callers/callees/impact/affected) → Tasks 1–4 (engine) + 6–7 (MCP); §3.3 shared query layer → engine `query.ts` reused by `tools.ts`; §3.5 "starts from a CLI command" → Task 9. The "Telos skill" artifact (§3.4) and the token-savings benchmark (§3.5 first bullet) are explicitly deferred in "Out of scope".
- **Placeholder scan:** every code step contains complete code; no TBD/TODO; the two SDK/CLI variance notes give exact fallback instructions rather than vague hand-waving.
- **Type consistency:** `ToolContext`, `ExploreHit`, and all query signatures are defined once (Tasks 1/4/6) and referenced verbatim downstream (`runExplore`→`explore`, `loadContext`→`ToolContext`, server handlers→`run*`).
- **Global Constraints honored:** no schema/engine-data changes; all new code is read-only over `TelosGraph`/`GraphStore`; ESM `.js` specifiers used throughout.
