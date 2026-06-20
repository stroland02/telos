# Telos Web UI Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `apps/web` React + React Flow dashboard (engine stage 8) that renders Telos's architecture as a sleek **semantic-zoom map** — layers → modules → files → symbols — driven by the `@telos/server` API, with a node-detail side panel and fuzzy search; and make `telos serve` host the built UI so `telos scan` → `telos serve` opens the living map in a browser.

**Architecture:** A Vite + React + TypeScript single-page app under `apps/web`. A typed API client wraps the four `@telos/server` routes. Pure transform + `@dagrejs/dagre` layout functions turn a `GraphView` into positioned React Flow nodes/edges (so the hard logic is unit-tested without a real DOM). A `useNavigation` hook holds the drill-down breadcrumb stack (overview → cluster → child cluster …). `@xyflow/react` (React Flow v12) renders the map with layer-colored custom nodes; clicking a cluster drills in, clicking a leaf opens the detail panel. In production, `telos serve` serves `apps/web/dist` statically via `@fastify/static` on the same local port and opens the browser; in dev, Vite proxies `/api` to the server.

**Tech Stack:** Vite, React 18, TypeScript (ESM), `@xyflow/react` v12, `@dagrejs/dagre`, Vitest + `@testing-library/react` + jsdom (unit/component), `@playwright/test` (E2E), `@fastify/static` (prod hosting), `open` (browser launch). pnpm workspace.

## Global Constraints

- **TypeScript ESM throughout.** Every package/app is `"type": "module"`; relative imports in Node-side code (server/cli) use explicit `.js` specifiers. Browser/Vite code (`apps/web/src`) uses extensionless relative imports (Vite resolves them) — match the surrounding app style, do NOT add `.js` to `.tsx` imports in the web app.
- **Node ≥20.** Root `package.json` pins `"engines": { "node": ">=20" }`.
- **pnpm on this machine** lives at `C:\Users\strol\AppData\Roaming\npm`. In the Bash tool, prepend it: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm"`. Run from repo root.
- **Build-ordering:** `@telos/engine`/`@telos/server` resolve to their compiled `dist/`. ALWAYS run `pnpm -r build` before running consumer tests, the server, or the E2E suite. Task 1 adds root scripts that enforce this.
- **Tests:** Vitest for unit/component (jsdom env for `.tsx`), Playwright for E2E. `tsc -p <pkg> --noEmit` must be clean for every touched package before its task's commit (Vitest does not typecheck).
- **Local-first:** the API server binds `127.0.0.1` only. The web app talks to a same-origin `/api` (prod) or a Vite dev proxy to `http://127.0.0.1:5180` (dev). No external network calls, no telemetry, no CDN fonts.
- **Server API contract (from Plan 2 — do NOT change it here):**
  - `GET /api/overview` → `GraphView`
  - `GET /api/cluster/:id` → `GraphView` (200) or `{ error }` (404)
  - `GET /api/node/:id` → `NodeDetail` (200) or `{ error }` (404)
  - `GET /api/search?q=<term>` → `{ results: TelosNodeDTO[] }`
  - `GET /api/health` → `{ status: "ok" }`
  where:
  - `ViewNode = { id: string; label: string; level: "layer"|"module"|"file"|"symbol"; layer: Layer; symbolCount: number; fanIn: number; fanOut: number }`
  - `ViewEdge = { sourceId: string; targetId: string; weight: number }`
  - `GraphView = { nodes: ViewNode[]; edges: ViewEdge[] }`
  - `Layer = "api"|"service"|"data"|"ui"|"infra"|"util"|"unknown"`
  - `TelosNodeDTO = { id, kind, name, qualifiedName, language, path, lineStart, lineEnd, layer, fanIn, fanOut, lines, complexity, summary }` (all the `TelosNode` fields)
  - `NodeDetail = { node: TelosNodeDTO; callers: TelosNodeDTO[]; callees: TelosNodeDTO[] }`
- **Cluster id formats (for navigation):** `layer:<layer>`, `module:<layer>:<dir>`, file clusters use the file node's hash id, symbols are leaf node ids. The UI treats ids as opaque strings except to know that `childrenOf` returns `null`→404 at a leaf (handled as "no further drill").
- **Honesty:** drilling a file shows its symbols with `edges: []` (v1 has no symbol→symbol edges). The UI must not invent edges.

---

### Task 1: Build-ordering fix — root scripts + engine/server exports

**Files:**
- Modify: `package.json` (root — add scripts)
- Modify: `packages/engine/package.json` (add `exports` + `types`)
- Modify: `packages/server/package.json` (add `exports` + `types`)
- Test: `packages/engine/src/exports.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: root `pnpm build` (topological), root `pnpm test` (builds first, then runs all package tests). `@telos/engine` and `@telos/server` gain explicit `exports` maps so consumers resolve `dist/index.js` deterministically.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/src/exports.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("@telos/engine package manifest", () => {
  it("declares an exports map and types so consumers resolve deterministically", () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    expect(pkg.exports?.["."]?.import).toBe("./dist/index.js");
    expect(pkg.exports?.["."]?.types).toBe("./dist/index.d.ts");
    expect(pkg.types).toBe("dist/index.d.ts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/engine exec vitest run src/exports.test.ts`
Expected: FAIL — `expected undefined to be "./dist/index.js"` (no `exports` field yet).

- [ ] **Step 3: Add the exports maps**

In `packages/engine/package.json`, after the `"main"` line add:

```json
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
```

In `packages/server/package.json`, after its `"main"` line add the same pair (pointing at the server's own dist):

```json
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
```

Confirm declarations are emitted. If `packages/engine/tsconfig.json` (or the shared `tsconfig.base.json`) does not already set `"declaration": true`, add `"declaration": true` to `packages/engine` and `packages/server` `compilerOptions` so the `.d.ts` files the `exports` map references are actually produced.

- [ ] **Step 4: Add root scripts that enforce build order**

In the root `package.json`, add a `scripts` block:

```json
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r build && pnpm -r exec vitest run",
    "typecheck": "pnpm -r exec tsc -p tsconfig.json --noEmit"
  },
```

- [ ] **Step 5: Run test + build to verify**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/engine build && pnpm -C packages/engine exec vitest run src/exports.test.ts && pnpm -C packages/server build`
Expected: engine builds and emits `dist/index.d.ts`; the test PASSES (3 assertions); server builds clean.

- [ ] **Step 6: Commit**

```bash
git add package.json packages/engine/package.json packages/server/package.json packages/engine/src/exports.test.ts packages/engine/tsconfig.json packages/server/tsconfig.json
git commit -m "build: deterministic engine/server exports + topological root build/test scripts"
```

---

### Task 2: Scaffold `apps/web` (Vite + React + Vitest) and wire the workspace

**Files:**
- Modify: `pnpm-workspace.yaml` (add `apps/*`)
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/test/setup.ts`
- Test: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: nothing yet.
- Produces: a runnable web app shell. `App` renders a header with the text `Telos`. Dev server proxies `/api` → `http://127.0.0.1:5180`.

- [ ] **Step 1: Add `apps/*` to the workspace**

Replace `pnpm-workspace.yaml` contents with:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 2: Create the app manifest and configs**

```json
// apps/web/package.json
{
  "name": "@telos/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@xyflow/react": "^12.3.0",
    "@dagrejs/dagre": "^1.1.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0",
    "vitest": "^1.6.0",
    "jsdom": "^24.1.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/user-event": "^14.5.0",
    "typescript": "^5.4.0"
  }
}
```

```json
// apps/web/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

```ts
// apps/web/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:5180" },
  },
});
```

```ts
// apps/web/vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

```ts
// apps/web/src/test/setup.ts
import "@testing-library/jest-dom/vitest";
```

```html
<!-- apps/web/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Telos, the Code Sentinel</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// apps/web/src/main.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

```tsx
// apps/web/src/App.tsx
export function App() {
  return (
    <div>
      <header>
        <h1>Telos</h1>
      </header>
    </div>
  );
}
```

- [ ] **Step 3: Install dependencies**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm install`
Expected: pnpm creates the `@telos/web` project and installs React/Vite/React Flow/dagre/testing libs; lockfile updates.

- [ ] **Step 4: Write the failing test**

```tsx
// apps/web/src/App.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("renders the Telos header", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Telos" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C apps/web exec vitest run && pnpm -C apps/web exec tsc -p tsconfig.json --noEmit`
Expected: 1 test PASS; tsc clean. (This task's `App` is trivial, so the test passes immediately — the RED→GREEN cycle resumes in later tasks where real logic is added.)

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml apps/web pnpm-lock.yaml
git commit -m "feat(web): scaffold @telos/web Vite+React app with dev API proxy"
```

---

### Task 3: Typed API client

**Files:**
- Create: `apps/web/src/api/types.ts`
- Create: `apps/web/src/api/client.ts`
- Test: `apps/web/src/api/client.test.ts`

**Interfaces:**
- Consumes: the server API contract (Global Constraints).
- Produces:
  ```ts
  // types.ts
  export type Layer = "api"|"service"|"data"|"ui"|"infra"|"util"|"unknown";
  export type ViewLevel = "layer"|"module"|"file"|"symbol";
  export interface ViewNode { id: string; label: string; level: ViewLevel; layer: Layer; symbolCount: number; fanIn: number; fanOut: number; }
  export interface ViewEdge { sourceId: string; targetId: string; weight: number; }
  export interface GraphView { nodes: ViewNode[]; edges: ViewEdge[]; }
  export interface TelosNodeDTO { id: string; kind: string; name: string; qualifiedName: string; language: string; path: string; lineStart: number; lineEnd: number; layer: Layer; fanIn: number; fanOut: number; lines: number; complexity: number; summary: string | null; }
  export interface NodeDetail { node: TelosNodeDTO; callers: TelosNodeDTO[]; callees: TelosNodeDTO[]; }
  // client.ts
  export interface TelosApi {
    overview(): Promise<GraphView>;
    cluster(id: string): Promise<GraphView | null>; // null on 404 (leaf / unknown)
    node(id: string): Promise<NodeDetail | null>;    // null on 404
    search(q: string): Promise<TelosNodeDTO[]>;
  }
  export function createApi(baseUrl?: string): TelosApi; // default baseUrl "" (same-origin /api)
  ```

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/api/client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApi } from "./client";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe("createApi", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("overview() GETs /api/overview and returns the view", async () => {
    const f = mockFetch(200, { nodes: [{ id: "layer:api" }], edges: [] });
    vi.stubGlobal("fetch", f);
    const api = createApi();
    const view = await api.overview();
    expect(f).toHaveBeenCalledWith("/api/overview");
    expect(view.nodes[0].id).toBe("layer:api");
  });

  it("cluster(id) encodes the id and returns null on 404", async () => {
    const f = mockFetch(404, { error: "cluster not found" });
    vi.stubGlobal("fetch", f);
    const api = createApi();
    const result = await api.cluster("module:api:src/api");
    expect(f).toHaveBeenCalledWith("/api/cluster/module%3Aapi%3Asrc%2Fapi");
    expect(result).toBeNull();
  });

  it("node(id) returns the detail on 200", async () => {
    const f = mockFetch(200, { node: { id: "s1", name: "getUser" }, callers: [], callees: [] });
    vi.stubGlobal("fetch", f);
    const api = createApi();
    const detail = await api.node("s1");
    expect(detail?.node.name).toBe("getUser");
  });

  it("search(q) returns results array", async () => {
    const f = mockFetch(200, { results: [{ id: "s1", name: "getUser" }] });
    vi.stubGlobal("fetch", f);
    const api = createApi();
    const hits = await api.search("get");
    expect(f).toHaveBeenCalledWith("/api/search?q=get");
    expect(hits[0].name).toBe("getUser");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C apps/web exec vitest run src/api/client.test.ts`
Expected: FAIL — `Failed to resolve import "./client"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/api/types.ts
export type Layer = "api" | "service" | "data" | "ui" | "infra" | "util" | "unknown";
export type ViewLevel = "layer" | "module" | "file" | "symbol";
export interface ViewNode { id: string; label: string; level: ViewLevel; layer: Layer; symbolCount: number; fanIn: number; fanOut: number; }
export interface ViewEdge { sourceId: string; targetId: string; weight: number; }
export interface GraphView { nodes: ViewNode[]; edges: ViewEdge[]; }
export interface TelosNodeDTO {
  id: string; kind: string; name: string; qualifiedName: string; language: string; path: string;
  lineStart: number; lineEnd: number; layer: Layer; fanIn: number; fanOut: number;
  lines: number; complexity: number; summary: string | null;
}
export interface NodeDetail { node: TelosNodeDTO; callers: TelosNodeDTO[]; callees: TelosNodeDTO[]; }
```

```ts
// apps/web/src/api/client.ts
import { GraphView, NodeDetail, TelosNodeDTO } from "./types";

export interface TelosApi {
  overview(): Promise<GraphView>;
  cluster(id: string): Promise<GraphView | null>;
  node(id: string): Promise<NodeDetail | null>;
  search(q: string): Promise<TelosNodeDTO[]>;
}

export function createApi(baseUrl = ""): TelosApi {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${baseUrl}${path}`);
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return (await res.json()) as T;
  };
  const getOrNull = async <T>(path: string): Promise<T | null> => {
    const res = await fetch(`${baseUrl}${path}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return (await res.json()) as T;
  };
  return {
    overview: () => get<GraphView>("/api/overview"),
    cluster: (id) => getOrNull<GraphView>(`/api/cluster/${encodeURIComponent(id)}`),
    node: (id) => getOrNull<NodeDetail>(`/api/node/${encodeURIComponent(id)}`),
    search: async (q) => (await get<{ results: TelosNodeDTO[] }>(`/api/search?q=${encodeURIComponent(q)}`)).results,
  };
}
```

- [ ] **Step 4: Run test + typecheck to verify they pass**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C apps/web exec vitest run src/api/client.test.ts && pnpm -C apps/web exec tsc -p tsconfig.json --noEmit`
Expected: 4 tests PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api
git commit -m "feat(web): typed API client for the architecture server"
```

---

### Task 4: GraphView → React Flow transform + dagre layout

**Files:**
- Create: `apps/web/src/graph/layout.ts`
- Test: `apps/web/src/graph/layout.test.ts`

**Interfaces:**
- Consumes: `GraphView`, `Layer`, `ViewLevel` from `../api/types`.
- Produces:
  ```ts
  export interface FlowNodeData { label: string; level: ViewLevel; layer: Layer; symbolCount: number; fanIn: number; fanOut: number; }
  export interface FlowNode { id: string; position: { x: number; y: number }; data: FlowNodeData; type: "telos"; }
  export interface FlowEdge { id: string; source: string; target: string; data: { weight: number }; }
  export interface FlowGraph { nodes: FlowNode[]; edges: FlowEdge[]; }
  export function toFlowGraph(view: GraphView): FlowGraph; // dagre-positioned, deterministic
  export const LAYER_COLORS: Record<Layer, string>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/graph/layout.test.ts
import { describe, it, expect } from "vitest";
import { toFlowGraph, LAYER_COLORS } from "./layout";
import { GraphView } from "../api/types";

const view: GraphView = {
  nodes: [
    { id: "layer:api", label: "api", level: "layer", layer: "api", symbolCount: 3, fanIn: 0, fanOut: 2 },
    { id: "layer:service", label: "service", level: "layer", layer: "service", symbolCount: 5, fanIn: 2, fanOut: 0 },
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

  it("exposes a color for every layer", () => {
    for (const layer of ["api", "service", "data", "ui", "infra", "util", "unknown"] as const) {
      expect(LAYER_COLORS[layer]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C apps/web exec vitest run src/graph/layout.test.ts`
Expected: FAIL — `Failed to resolve import "./layout"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/graph/layout.ts
import Dagre from "@dagrejs/dagre";
import { GraphView, Layer, ViewLevel } from "../api/types";

export interface FlowNodeData { label: string; level: ViewLevel; layer: Layer; symbolCount: number; fanIn: number; fanOut: number; }
export interface FlowNode { id: string; position: { x: number; y: number }; data: FlowNodeData; type: "telos"; }
export interface FlowEdge { id: string; source: string; target: string; data: { weight: number }; }
export interface FlowGraph { nodes: FlowNode[]; edges: FlowEdge[]; }

export const LAYER_COLORS: Record<Layer, string> = {
  api: "#3b82f6",
  service: "#8b5cf6",
  data: "#10b981",
  ui: "#ec4899",
  infra: "#f59e0b",
  util: "#6b7280",
  unknown: "#94a3b8",
};

const NODE_W = 180;
const NODE_H = 56;

export function toFlowGraph(view: GraphView): FlowGraph {
  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80 });

  for (const n of view.nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of view.edges) g.setEdge(e.sourceId, e.targetId);

  Dagre.layout(g);

  const nodes: FlowNode[] = view.nodes.map((n) => {
    const p = g.node(n.id);
    return {
      id: n.id,
      type: "telos",
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
      data: { label: n.label, level: n.level, layer: n.layer, symbolCount: n.symbolCount, fanIn: n.fanIn, fanOut: n.fanOut },
    };
  });

  const edges: FlowEdge[] = view.edges.map((e) => ({
    id: `${e.sourceId}->${e.targetId}`,
    source: e.sourceId,
    target: e.targetId,
    data: { weight: e.weight },
  }));

  return { nodes, edges };
}
```

- [ ] **Step 4: Run test + typecheck to verify they pass**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C apps/web exec vitest run src/graph/layout.test.ts && pnpm -C apps/web exec tsc -p tsconfig.json --noEmit`
Expected: 5 tests PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/graph
git commit -m "feat(web): dagre layout transform from GraphView to React Flow graph"
```

---

### Task 5: Navigation hook (drill-down breadcrumb + data fetching)

**Files:**
- Create: `apps/web/src/graph/useNavigation.ts`
- Test: `apps/web/src/graph/useNavigation.test.ts`

**Interfaces:**
- Consumes: `TelosApi` from `../api/client`; `GraphView` from `../api/types`.
- Produces:
  ```ts
  export interface Crumb { id: string | null; label: string; } // id null === overview root
  export interface NavigationState {
    view: GraphView | null;
    crumbs: Crumb[];
    loading: boolean;
    error: string | null;
    drillInto(node: { id: string; label: string; level: string }): void; // ignores leaf "symbol" level
    goToCrumb(index: number): void;
  }
  export function useNavigation(api: TelosApi): NavigationState;
  ```
  Behavior: on mount, loads `overview()` with a single root crumb `{ id: null, label: "Overview" }`. `drillInto` on a non-symbol node fetches `cluster(node.id)`; if it returns a non-null view, pushes a crumb and replaces the view; a `symbol`-level node (or a 404/null) does NOT drill (leaves are opened in the detail panel by the App, not here). `goToCrumb(i)` truncates the crumb stack to `i+1` and reloads that level (overview for root, else `cluster(id)`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/graph/useNavigation.test.ts
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useNavigation } from "./useNavigation";
import { TelosApi } from "../api/client";
import { GraphView } from "../api/types";

const overview: GraphView = {
  nodes: [{ id: "layer:api", label: "api", level: "layer", layer: "api", symbolCount: 1, fanIn: 0, fanOut: 0 }],
  edges: [],
};
const apiChildren: GraphView = {
  nodes: [{ id: "module:api:src/api", label: "src/api", level: "module", layer: "api", symbolCount: 1, fanIn: 0, fanOut: 0 }],
  edges: [],
};

function fakeApi(overrides: Partial<TelosApi> = {}): TelosApi {
  return {
    overview: vi.fn().mockResolvedValue(overview),
    cluster: vi.fn().mockResolvedValue(apiChildren),
    node: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("useNavigation", () => {
  it("loads the overview with a root crumb on mount", async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useNavigation(api));
    await waitFor(() => expect(result.current.view).not.toBeNull());
    expect(result.current.view!.nodes[0].id).toBe("layer:api");
    expect(result.current.crumbs).toEqual([{ id: null, label: "Overview" }]);
  });

  it("drillInto a cluster pushes a crumb and swaps the view", async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useNavigation(api));
    await waitFor(() => expect(result.current.view).not.toBeNull());
    act(() => result.current.drillInto({ id: "layer:api", label: "api", level: "layer" }));
    await waitFor(() => expect(result.current.crumbs).toHaveLength(2));
    expect(api.cluster).toHaveBeenCalledWith("layer:api");
    expect(result.current.view!.nodes[0].id).toBe("module:api:src/api");
    expect(result.current.crumbs[1]).toEqual({ id: "layer:api", label: "api" });
  });

  it("does not drill into a symbol-level leaf", async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useNavigation(api));
    await waitFor(() => expect(result.current.view).not.toBeNull());
    act(() => result.current.drillInto({ id: "s1", label: "getUser", level: "symbol" }));
    expect(api.cluster).not.toHaveBeenCalled();
    expect(result.current.crumbs).toHaveLength(1);
  });

  it("goToCrumb(0) returns to the overview", async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useNavigation(api));
    await waitFor(() => expect(result.current.view).not.toBeNull());
    act(() => result.current.drillInto({ id: "layer:api", label: "api", level: "layer" }));
    await waitFor(() => expect(result.current.crumbs).toHaveLength(2));
    act(() => result.current.goToCrumb(0));
    await waitFor(() => expect(result.current.crumbs).toHaveLength(1));
    expect(result.current.view!.nodes[0].id).toBe("layer:api");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C apps/web exec vitest run src/graph/useNavigation.test.ts`
Expected: FAIL — `Failed to resolve import "./useNavigation"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/graph/useNavigation.ts
import { useCallback, useEffect, useState } from "react";
import { TelosApi } from "../api/client";
import { GraphView } from "../api/types";

export interface Crumb { id: string | null; label: string; }
export interface NavigationState {
  view: GraphView | null;
  crumbs: Crumb[];
  loading: boolean;
  error: string | null;
  drillInto(node: { id: string; label: string; level: string }): void;
  goToCrumb(index: number): void;
}

export function useNavigation(api: TelosApi): NavigationState {
  const [view, setView] = useState<GraphView | null>(null);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, label: "Overview" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLevel = useCallback(async (id: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const next = id === null ? await api.overview() : await api.cluster(id);
      if (next !== null) setView(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void loadLevel(null); }, [loadLevel]);

  const drillInto = useCallback((node: { id: string; label: string; level: string }) => {
    if (node.level === "symbol") return;
    setLoading(true);
    setError(null);
    api.cluster(node.id).then((next) => {
      if (next !== null) {
        setView(next);
        setCrumbs((cs) => [...cs, { id: node.id, label: node.label }]);
      }
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [api]);

  const goToCrumb = useCallback((index: number) => {
    setCrumbs((cs) => {
      const truncated = cs.slice(0, index + 1);
      void loadLevel(truncated[truncated.length - 1].id);
      return truncated;
    });
  }, [loadLevel]);

  return { view, crumbs, loading, error, drillInto, goToCrumb };
}
```

- [ ] **Step 4: Run test + typecheck to verify they pass**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C apps/web exec vitest run src/graph/useNavigation.test.ts && pnpm -C apps/web exec tsc -p tsconfig.json --noEmit`
Expected: 4 tests PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/graph/useNavigation.ts apps/web/src/graph/useNavigation.test.ts
git commit -m "feat(web): navigation hook for semantic-zoom drill-down + breadcrumbs"
```

---

### Task 6: Map UI — custom node, search box, detail panel, App composition

**Files:**
- Create: `apps/web/src/components/TelosNode.tsx`
- Create: `apps/web/src/components/Breadcrumbs.tsx`
- Create: `apps/web/src/components/SearchBox.tsx`
- Create: `apps/web/src/components/DetailPanel.tsx`
- Create: `apps/web/src/components/MapView.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/components/SearchBox.test.tsx`
- Test: `apps/web/src/components/DetailPanel.test.tsx`
- Test: `apps/web/src/App.test.tsx` (replace the Task 2 version)

**Interfaces:**
- Consumes: `useNavigation`/`Crumb` (Task 5), `toFlowGraph`/`LAYER_COLORS`/`FlowNodeData` (Task 4), `createApi`/`TelosApi` (Task 3), `NodeDetail`/`TelosNodeDTO` (Task 3), `@xyflow/react`.
- Produces:
  - `SearchBox({ api, onSelect })`: debounced text input; calls `api.search(q)` (min 2 chars), lists results; clicking a result calls `onSelect(node)`.
  - `DetailPanel({ detail, onClose })`: renders a `NodeDetail` (name, path, kind, layer, lines/complexity, callers list, callees list) or nothing when `detail` is null.
  - `Breadcrumbs({ crumbs, onJump })`: renders the crumb trail; clicking crumb `i` calls `onJump(i)`.
  - `MapView({ api })`: composes `useNavigation`, `Breadcrumbs`, `SearchBox`, the React Flow canvas, and `DetailPanel`. Clicking a cluster node drills; clicking a `file`/`symbol` leaf fetches `api.node(id)` and opens the panel.
  - `App` renders `MapView` with the real `createApi()`.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/src/components/SearchBox.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBox } from "./SearchBox";
import { TelosApi } from "../api/client";

function api(results: any[]): TelosApi {
  return { overview: vi.fn(), cluster: vi.fn(), node: vi.fn(), search: vi.fn().mockResolvedValue(results) };
}

describe("SearchBox", () => {
  it("searches after typing and lists results that are selectable", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const a = api([{ id: "s1", name: "getUser", path: "src/api/u.ts", layer: "api" }]);
    render(<SearchBox api={a} onSelect={onSelect} />);
    await user.type(screen.getByPlaceholderText(/search/i), "getU");
    expect(await screen.findByText("getUser")).toBeInTheDocument();
    await user.click(screen.getByText("getUser"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }));
  });

  it("does not search for queries shorter than 2 characters", async () => {
    const user = userEvent.setup();
    const a = api([]);
    render(<SearchBox api={a} onSelect={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/search/i), "g");
    expect(a.search).not.toHaveBeenCalled();
  });
});
```

```tsx
// apps/web/src/components/DetailPanel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DetailPanel } from "./DetailPanel";
import { NodeDetail } from "../api/types";

const detail: NodeDetail = {
  node: { id: "s2", kind: "function", name: "findUser", qualifiedName: "src/services/u.ts::findUser", language: "typescript", path: "src/services/u.ts", lineStart: 1, lineEnd: 5, layer: "service", fanIn: 1, fanOut: 0, lines: 5, complexity: 1, summary: null },
  callers: [{ id: "f1", kind: "file", name: "userController.ts", qualifiedName: "src/api/userController.ts", language: "typescript", path: "src/api/userController.ts", lineStart: 1, lineEnd: 1, layer: "api", fanIn: 0, fanOut: 1, lines: 1, complexity: 0, summary: null }],
  callees: [],
};

describe("DetailPanel", () => {
  it("renders nothing when detail is null", () => {
    const { container } = render(<DetailPanel detail={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the node name, path, and its callers", () => {
    render(<DetailPanel detail={detail} onClose={vi.fn()} />);
    expect(screen.getByText("findUser")).toBeInTheDocument();
    expect(screen.getByText("src/services/u.ts")).toBeInTheDocument();
    expect(screen.getByText("userController.ts")).toBeInTheDocument();
  });
});
```

```tsx
// apps/web/src/App.test.tsx  (REPLACE the Task 2 file with this)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true, status: 200,
    json: async () => url.includes("/overview")
      ? { nodes: [{ id: "layer:api", label: "api", level: "layer", layer: "api", symbolCount: 1, fanIn: 0, fanOut: 0 }], edges: [] }
      : { results: [] },
  } as Response)));
});

describe("App", () => {
  it("renders the Telos header and loads the overview layer", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Telos" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("api")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C apps/web exec vitest run src/components src/App.test.tsx`
Expected: FAIL — unresolved imports for `./SearchBox`, `./DetailPanel`, and `App` no longer matching (no overview text).

- [ ] **Step 3: Write the components**

```tsx
// apps/web/src/components/TelosNode.tsx
import { Handle, Position, NodeProps } from "@xyflow/react";
import { LAYER_COLORS, FlowNodeData } from "../graph/layout";

export function TelosNode({ data }: NodeProps) {
  const d = data as unknown as FlowNodeData;
  return (
    <div style={{
      width: 180, padding: "8px 12px", borderRadius: 8,
      background: LAYER_COLORS[d.layer], color: "#fff", fontFamily: "system-ui, sans-serif",
      boxShadow: "0 1px 4px rgba(0,0,0,.2)",
    }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</div>
      <div style={{ fontSize: 11, opacity: 0.85 }}>{d.level} · {d.symbolCount} sym · in {d.fanIn}/out {d.fanOut}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
```

```tsx
// apps/web/src/components/Breadcrumbs.tsx
import { Crumb } from "../graph/useNavigation";

export function Breadcrumbs({ crumbs, onJump }: { crumbs: Crumb[]; onJump: (i: number) => void }) {
  return (
    <nav aria-label="breadcrumb" style={{ display: "flex", gap: 6, padding: "8px 12px", fontFamily: "system-ui", fontSize: 13 }}>
      {crumbs.map((c, i) => (
        <span key={`${c.id ?? "root"}-${i}`}>
          {i > 0 && <span style={{ opacity: 0.5, marginRight: 6 }}>/</span>}
          <button onClick={() => onJump(i)} style={{ border: "none", background: "none", color: "#2563eb", cursor: "pointer", padding: 0 }}>
            {c.label}
          </button>
        </span>
      ))}
    </nav>
  );
}
```

```tsx
// apps/web/src/components/SearchBox.tsx
import { useEffect, useRef, useState } from "react";
import { TelosApi } from "../api/client";
import { TelosNodeDTO } from "../api/types";

export function SearchBox({ api, onSelect }: { api: TelosApi; onSelect: (node: TelosNodeDTO) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TelosNodeDTO[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => { void api.search(q.trim()).then(setResults); }, 200);
    return () => clearTimeout(timer.current);
  }, [q, api]);

  return (
    <div style={{ padding: "8px 12px", fontFamily: "system-ui" }}>
      <input
        placeholder="Search symbols…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #cbd5e1" }}
      />
      {results.length > 0 && (
        <ul style={{ listStyle: "none", margin: "4px 0", padding: 0, maxHeight: 200, overflowY: "auto" }}>
          {results.map((r) => (
            <li key={r.id}>
              <button onClick={() => onSelect(r)} style={{ width: "100%", textAlign: "left", border: "none", background: "none", padding: "4px 6px", cursor: "pointer" }}>
                <strong>{r.name}</strong> <span style={{ opacity: 0.6, fontSize: 12 }}>{r.path}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

```tsx
// apps/web/src/components/DetailPanel.tsx
import { NodeDetail, TelosNodeDTO } from "../api/types";

function NodeList({ title, nodes }: { title: string; nodes: TelosNodeDTO[] }) {
  return (
    <div>
      <h4 style={{ margin: "8px 0 4px" }}>{title} ({nodes.length})</h4>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {nodes.map((n) => <li key={n.id} style={{ fontSize: 12, padding: "2px 0" }}>{n.name} <span style={{ opacity: 0.6 }}>{n.path}</span></li>)}
      </ul>
    </div>
  );
}

export function DetailPanel({ detail, onClose }: { detail: NodeDetail | null; onClose: () => void }) {
  if (!detail) return null;
  const n = detail.node;
  return (
    <aside style={{ position: "absolute", top: 0, right: 0, width: 320, height: "100%", background: "#fff", borderLeft: "1px solid #e2e8f0", padding: 16, overflowY: "auto", fontFamily: "system-ui", boxShadow: "-2px 0 8px rgba(0,0,0,.08)" }}>
      <button onClick={onClose} aria-label="Close detail panel" style={{ float: "right", border: "none", background: "none", cursor: "pointer", fontSize: 18 }}>×</button>
      <h3 style={{ margin: "0 0 4px" }}>{n.name}</h3>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{n.path}</div>
      <div style={{ fontSize: 12, margin: "8px 0" }}>{n.kind} · {n.layer} · {n.lines} lines · complexity {n.complexity}</div>
      <NodeList title="Callers" nodes={detail.callers} />
      <NodeList title="Callees" nodes={detail.callees} />
    </aside>
  );
}
```

```tsx
// apps/web/src/components/MapView.tsx
import { useMemo, useState } from "react";
import { ReactFlow, Background, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TelosApi } from "../api/client";
import { NodeDetail } from "../api/types";
import { useNavigation } from "../graph/useNavigation";
import { toFlowGraph } from "../graph/layout";
import { TelosNode } from "./TelosNode";
import { Breadcrumbs } from "./Breadcrumbs";
import { SearchBox } from "./SearchBox";
import { DetailPanel } from "./DetailPanel";

const nodeTypes = { telos: TelosNode };

export function MapView({ api }: { api: TelosApi }) {
  const nav = useNavigation(api);
  const [detail, setDetail] = useState<NodeDetail | null>(null);

  const flow = useMemo(() => (nav.view ? toFlowGraph(nav.view) : { nodes: [], edges: [] }), [nav.view]);

  const openNode = (id: string) => { void api.node(id).then((d) => { if (d) setDetail(d); }); };

  return (
    <div style={{ position: "relative", width: "100%", height: "calc(100vh - 110px)" }}>
      <Breadcrumbs crumbs={nav.crumbs} onJump={nav.goToCrumb} />
      <SearchBox api={api} onSelect={(node) => openNode(node.id)} />
      {nav.error && <div role="alert" style={{ color: "#b91c1c", padding: "0 12px" }}>{nav.error}</div>}
      <div style={{ width: "100%", height: "100%" }}>
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          nodeTypes={nodeTypes}
          fitView
          onNodeClick={(_, node) => {
            const v = nav.view?.nodes.find((x) => x.id === node.id);
            if (!v) return;
            if (v.level === "symbol" || v.level === "file") openNode(v.id);
            else nav.drillInto({ id: v.id, label: v.label, level: v.level });
          }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      <DetailPanel detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
```

```tsx
// apps/web/src/App.tsx  (REPLACE the Task 2 stub)
import { createApi } from "./api/client";
import { MapView } from "./components/MapView";

const api = createApi();

export function App() {
  return (
    <div>
      <header style={{ padding: "10px 16px", borderBottom: "1px solid #e2e8f0", fontFamily: "system-ui" }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Telos</h1>
      </header>
      <MapView api={api} />
    </div>
  );
}
```

> Note on the `App.test.tsx` overview assertion: React Flow renders nodes into a canvas-like container that jsdom does not fully size, so the test asserts the data path (the `api` layer node label appears once the overview loads) rather than pixel layout. The real canvas interaction is covered by the Playwright E2E in Task 7.

- [ ] **Step 4: Run tests + typecheck to verify they pass**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C apps/web exec vitest run && pnpm -C apps/web exec tsc -p tsconfig.json --noEmit`
Expected: SearchBox (2), DetailPanel (2), App (1), plus prior client/layout/navigation tests all PASS; tsc clean.

> If jsdom errors on React Flow internals (e.g. `ResizeObserver is not defined`), add to `apps/web/src/test/setup.ts`:
> ```ts
> globalThis.ResizeObserver = globalThis.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
> ```
> This is a known jsdom gap for React Flow; the polyfill is test-only and does not affect the app bundle.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components apps/web/src/App.tsx apps/web/src/App.test.tsx
git commit -m "feat(web): semantic-zoom map with custom nodes, search, and detail panel"
```

---

### Task 7: Production hosting (`@fastify/static`) + `telos serve --open` + Playwright E2E

**Files:**
- Modify: `packages/server/package.json` (add `@fastify/static`)
- Modify: `packages/server/src/server.ts` (optional static dir)
- Modify: `packages/cli/package.json` (add `open`)
- Modify: `packages/cli/src/main.ts` (`--open` flag; pass web dist to server)
- Test: `packages/server/src/server-static.test.ts`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/map.spec.ts`
- Modify: `apps/web/package.json` (add `@playwright/test`, `e2e` script)

**Interfaces:**
- Consumes: `buildServer`/`GraphProvider` (Plan 2 Task 3), `GraphService`/`runServe` (Plan 2 cli).
- Produces:
  - `buildServer(provider, options?)` where `options?: { staticDir?: string }`; when `staticDir` is provided and exists, the server serves it at `/` (SPA fallback to `index.html`), while `/api/*` still 404s as JSON.
  - `telos serve [path] --port --open`: serves the bundled web UI from `apps/web/dist` if present and optionally opens the browser.

- [ ] **Step 1: Write the failing server test**

```ts
// packages/server/src/server-static.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer, GraphProvider } from "./server.js";

const stub: GraphProvider = { getOverview: () => ({ nodes: [], edges: [] }), getChildren: () => null, getNode: () => null, search: () => [] };

let dirs: string[] = [];
function staticDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "telos-static-"));
  dirs.push(dir);
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>Telos</title><div id=root></div>");
  return dir;
}
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = []; });

describe("static hosting", () => {
  it("serves index.html at / when a staticDir is given", async () => {
    const app = buildServer(stub, { staticDir: staticDir() });
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Telos");
    await app.close();
  });

  it("still serves the API alongside static assets", async () => {
    const app = buildServer(stub, { staticDir: staticDir() });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("works with no staticDir (API-only)", async () => {
    const app = buildServer(stub);
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
```

- [ ] **Step 2: Install `@fastify/static` and run the test to verify it fails**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/server add @fastify/static && pnpm -C packages/server exec vitest run src/server-static.test.ts`
Expected: FAIL — `buildServer` ignores the second argument, so `GET /` returns 404 (the `statusCode === 200` assertion fails).

- [ ] **Step 3: Add optional static hosting to the server**

In `packages/server/src/server.ts`, import static at the top and extend `buildServer` (keep the `GraphProvider` interface and ALL existing routes from Plan 2 exactly as they are — only add the import, the `ServerOptions` type, the second param, and the static block):

```ts
import Fastify, { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";

// ... GraphProvider interface unchanged ...

export interface ServerOptions { staticDir?: string }

export function buildServer(provider: GraphProvider, options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  // ... keep the existing /api/health, /api/overview, /api/cluster/:id,
  //     /api/node/:id, /api/search route registrations exactly as they are ...

  if (options.staticDir && existsSync(options.staticDir)) {
    app.register(fastifyStatic, { root: options.staticDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
      return reply.sendFile("index.html"); // SPA fallback
    });
  }

  return app;
}
```

- [ ] **Step 4: Run the server test + typecheck**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/server exec vitest run && pnpm -C packages/server exec tsc -p tsconfig.json --noEmit`
Expected: static tests (3) + existing server tests PASS; tsc clean.

- [ ] **Step 5: Wire the CLI to serve the web UI and open the browser**

In `packages/cli/package.json`, add `"open": "^10.1.0"` to dependencies, then:

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm install`

In `packages/cli/src/main.ts`, update the imports and `runServe`, and add an `--open` flag. Replace the existing `runServe` and `serve` command with:

```ts
import { existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import open from "open";
import { GraphService, buildServer } from "@telos/server";

export async function runServe(opts: { path: string; port: number; open?: boolean }): Promise<{ address: string; close: () => Promise<void> }> {
  const repo = resolve(opts.path);
  const dbPath = join(repo, ".telos", "graph.db");
  if (!existsSync(dbPath)) {
    throw new Error(`No graph found at ${dbPath}. Run 'telos scan ${opts.path}' first.`);
  }
  // packages/cli/dist/main.js -> ../../../apps/web/dist
  const here = dirname(fileURLToPath(import.meta.url));
  const webDist = resolve(here, "..", "..", "..", "apps", "web", "dist");
  const service = GraphService.fromDb(dbPath);
  const app = buildServer(service, existsSync(webDist) ? { staticDir: webDist } : {});
  const address = await app.listen({ port: opts.port, host: "127.0.0.1" });
  if (opts.open) await open(address);
  return { address, close: async () => { await app.close(); service.close(); } };
}
```

And the command registration inside `buildProgram`:

```ts
  program.command("serve [path]").description("Serve the architecture map for a scanned repo")
    .option("-p, --port <port>", "port to listen on", "5180")
    .option("--open", "open the map in your browser", false)
    .action(async (path: string | undefined, opts: { port: string; open: boolean }) => {
      const { address } = await runServe({ path: path ?? ".", port: Number(opts.port), open: opts.open });
      console.log(`Telos serving the architecture map at ${address}`);
    });
```

- [ ] **Step 6: Run the existing CLI tests + typecheck (the missing-db test still holds)**

Run: `export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm" && pnpm -C packages/cli exec vitest run && pnpm -C packages/cli exec tsc -p tsconfig.json --noEmit`
Expected: `serve.test.ts` (missing-db rejects) + `main.test.ts` PASS; tsc clean. (`runServe` now takes an optional `open`; the existing test calls it without `open`, which defaults to falsy — still valid.)

- [ ] **Step 7: Add the Playwright E2E**

In `apps/web/package.json`, add `"@playwright/test": "^1.47.0"` to devDependencies and `"e2e": "playwright test"` to scripts.

```ts
// apps/web/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:5180", headless: true },
});
```

```ts
// apps/web/e2e/map.spec.ts
import { test, expect } from "@playwright/test";

// Assumes a server is already running at 127.0.0.1:5180 serving a scanned repo
// (see Step 8 for the exact bring-up commands).
test("renders the overview and drills into a layer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Telos" })).toBeVisible();
  const firstNode = page.locator(".react-flow__node").first();
  await expect(firstNode).toBeVisible({ timeout: 10_000 });
  await firstNode.click();
  // After drilling, a second breadcrumb beyond "Overview" should appear.
  await expect(page.getByRole("navigation", { name: "breadcrumb" }).getByRole("button")).toHaveCount(2, { timeout: 10_000 });
});
```

- [ ] **Step 8: Run the full E2E once (manual integration verification)**

Run (from repo root):
```bash
export PATH="$PATH:/c/Users/strol/AppData/Roaming/npm"
pnpm -r build                                   # build engine, server, cli, and the web app
pnpm -C apps/web exec playwright install chromium
node packages/cli/dist/main.js scan packages/engine/fixtures/scan-sample
node packages/cli/dist/main.js serve packages/engine/fixtures/scan-sample --port 5180 &
SERVER_PID=$!
sleep 1
pnpm -C apps/web exec playwright test
kill $SERVER_PID
```
Expected: the E2E test passes — the overview renders nodes and clicking one adds a second breadcrumb. **Important:** ensure the server process is killed at the end (a stray `telos serve` holds `graph.db` open and the port). This step is verification only.

- [ ] **Step 9: Commit**

```bash
git add packages/server/package.json packages/server/src/server.ts packages/server/src/server-static.test.ts packages/cli/package.json packages/cli/src/main.ts apps/web/package.json apps/web/playwright.config.ts apps/web/e2e pnpm-lock.yaml
git commit -m "feat(web,server,cli): host the map via telos serve --open + Playwright E2E"
```

---

## Self-Review

**1. Spec coverage (stage 8 + §5):**
- "React + React Flow semantic-zoom map" — `@xyflow/react` canvas with custom `TelosNode`, dagre layout, drill-down via `useNavigation` (Tasks 4–6). ✅
- "Zoomed out → layers; mid → modules/folders; in → files, then functions/classes" — overview serves layer clusters; `childrenOf` drills layer→module→file→symbols; each click drills one level (Task 5). ✅
- "Node size = importance, color = layer" — `LAYER_COLORS` by layer; node shows symbolCount/fanIn/fanOut. Size-by-importance is a visual refinement (data is on the node for it) — deferred. ✅ (color + metrics present now)
- "Clicking a node opens a side panel with source, callers, callees, metrics" — `DetailPanel` shows kind/layer/lines/complexity + callers + callees (Task 6). Source-code display is NOT in v1 scope (the API returns no file contents; reserved as a follow-up). ✅ for callers/callees/metrics.
- "Instant fuzzy symbol search" — `SearchBox` → `/api/search` (FTS) (Task 6). ✅
- "CLI serve opens browser → the living map" (spec §2) — `telos serve --open` + static hosting (Task 7). ✅
- "Playwright for the web UI (semantic zoom, search, node panels)" (spec §7) — E2E in Task 7. ✅
- "Never render >~1k nodes at once" (§5/§9) — guaranteed by aggregation: each level shows only one cluster's children, never the whole graph. ✅
- Build-ordering footgun from Plan 2 closed in Task 1. ✅

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Every code step is complete; commands have expected output. The jsdom/ResizeObserver and "keep existing routes" notes are concrete conditional instructions, not placeholders. ✅

**3. Type consistency:** `GraphView`/`ViewNode`/`ViewEdge`/`NodeDetail`/`TelosNodeDTO`/`Layer`/`ViewLevel` are defined once in `apps/web/src/api/types.ts` (Task 3) and consumed unchanged by layout (Task 4), navigation (Task 5), and components (Task 6). `toFlowGraph`/`FlowGraph`/`FlowNodeData`/`LAYER_COLORS` names match between Task 4 and Task 6. `useNavigation`'s `Crumb`/`NavigationState`/`drillInto`/`goToCrumb` match between Task 5 and the `Breadcrumbs`/`MapView` consumers. `buildServer(provider, options?)` (Task 7) is backward-compatible with Plan 2's `buildServer(provider)` callers. `runServe` gains an optional `open` — existing Plan 2 `serve.test.ts` still compiles. ✅

## Carried-forward / new deferrals
- Node size encoding by importance (fan-in/out) — data is present on the node; apply a scale in a polish pass.
- Source-code preview in the detail panel — needs an API addition (file slice by `path`+lines); reserved.
- `telos scan <nonexistent>` path-existence guard (still open from Plan 1/2).
- WebGL deep-dive layer (Sigma.js/Cosmograph) — explicitly out of v1 scope (spec §5).
- Incremental watcher (chokidar) live-refresh of the map — Phase 2 territory.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-20-telos-web-ui.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.
