# Telos Phase 3 — Semantic Brain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the reserved `summary` field and add tour/Q&A understanding aids via a provider-agnostic enrichment pipeline, with a deterministic default enricher and the LLM left as a future drop-in adapter.

**Architecture:** A pure `enrichGraph(graph, enricher)` over the universal graph, a deterministic `HeuristicEnricher`, persistence via `GraphStore.applyEnrichment`, and two pure read-models (`buildTour`, `askGraph`). Surfaced through CLI (`telos enrich|tour|ask`), the Fastify server, and the web DetailPanel. No LLM SDK is imported anywhere in core.

**Tech Stack:** TypeScript ESM, Vitest, better-sqlite3, Fastify, React. pnpm workspace.

## Global Constraints

- Node ≥ 20, TypeScript ESM, `.js` import specifiers in all relative imports.
- After editing a package that another consumes, rebuild its `dist` (`pnpm -C packages/<pkg> build`) before the consumer's tests/build run.
- No new runtime dependency on any LLM/embedding vendor. The only Phase-3 contract is the `Enricher` interface.
- Enrichers must be deterministic (no `Date.now()`/`Math.random()`) so golden tests are stable.
- Engine source lives in `packages/engine/src`; export new public symbols from `packages/engine/src/index.ts`.
- Each task: feature branch → green tests → merge to `master` → delete branch (standing auto-merge preference).

---

### Task 1: Enrichment pipeline + HeuristicEnricher

**Files:**
- Create: `packages/engine/src/enrich.ts`
- Create: `packages/engine/src/enrichers/heuristic.ts`
- Create: `packages/engine/src/enrich.test.ts`
- Modify: `packages/engine/src/index.ts` (export new symbols)

**Interfaces:**
- Consumes: `TelosGraph`, `TelosNode`, `Layer` from `./schema.js`; `callersOf`, `calleesOf` from `./query.js`.
- Produces:
  - `interface NodeEnrichment { summary: string; layer?: Layer }`
  - `interface EnrichContext { graph: TelosGraph; callers: TelosNode[]; callees: TelosNode[] }`
  - `interface Enricher { readonly name: string; enrich(node: TelosNode, ctx: EnrichContext): NodeEnrichment }`
  - `function enrichGraph(graph: TelosGraph, enricher: Enricher): TelosGraph`
  - `const heuristicEnricher: Enricher` (name `"heuristic"`)

- [ ] **Step 1: Write the failing test** — `packages/engine/src/enrich.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "./schema.js";
import { enrichGraph, Enricher } from "./enrich.js";
import { heuristicEnricher } from "./enrichers/heuristic.js";

function node(p: Partial<TelosNode> & { id: string; name: string }): TelosNode {
  return {
    kind: "function", qualifiedName: p.name, language: "typescript", path: "a.ts",
    lineStart: 1, lineEnd: 10, layer: "service", fanIn: 0, fanOut: 0, lines: 10,
    complexity: 0, summary: null, ...p,
  } as TelosNode;
}

const graph: TelosGraph = {
  nodes: [
    node({ id: "a", name: "authenticate", layer: "api", lines: 18, fanIn: 3, fanOut: 2 }),
    node({ id: "b", name: "hashPassword", layer: "util", lines: 5 }),
  ],
  edges: [{ sourceId: "a", targetId: "b", kind: "calls", resolved: true }],
};

describe("enrichGraph + heuristicEnricher", () => {
  it("fills a deterministic structural summary for every node", () => {
    const out = enrichGraph(graph, heuristicEnricher);
    const a = out.nodes.find((n) => n.id === "a")!;
    expect(a.summary).toBe("function authenticate (typescript, api layer) — called by 3, calls 1, spans 18 lines.");
    const b = out.nodes.find((n) => n.id === "b")!;
    expect(b.summary).toContain("hashPassword");
    expect(out.nodes.every((n) => typeof n.summary === "string" && n.summary.length > 0)).toBe(true);
  });

  it("does not mutate the input graph", () => {
    enrichGraph(graph, heuristicEnricher);
    expect(graph.nodes.find((n) => n.id === "a")!.summary).toBeNull();
  });

  it("accepts any object implementing Enricher (LlmEnricher drop-in point)", () => {
    const stub: Enricher = { name: "stub", enrich: () => ({ summary: "x" }) };
    const out = enrichGraph(graph, stub);
    expect(out.nodes.every((n) => n.summary === "x")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/engine test -- enrich`
Expected: FAIL (cannot find module `./enrich.js`).

- [ ] **Step 3: Write `packages/engine/src/enrich.ts`**

```typescript
import { TelosGraph, TelosNode, Layer } from "./schema.js";
import { callersOf, calleesOf } from "./query.js";

export interface NodeEnrichment {
  summary: string;
  layer?: Layer;
}

export interface EnrichContext {
  graph: TelosGraph;
  callers: TelosNode[];
  callees: TelosNode[];
}

export interface Enricher {
  readonly name: string;
  enrich(node: TelosNode, ctx: EnrichContext): NodeEnrichment;
}

/** Pure: returns a new graph with summaries (and any refined layers) filled. */
export function enrichGraph(graph: TelosGraph, enricher: Enricher): TelosGraph {
  const nodes = graph.nodes.map((node) => {
    const ctx: EnrichContext = {
      graph,
      callers: callersOf(graph, node.id),
      callees: calleesOf(graph, node.id),
    };
    const e = enricher.enrich(node, ctx);
    return { ...node, summary: e.summary, layer: e.layer ?? node.layer };
  });
  return { nodes, edges: graph.edges };
}
```

- [ ] **Step 4: Write `packages/engine/src/enrichers/heuristic.ts`**

```typescript
import { Enricher } from "../enrich.js";

/**
 * Deterministic baseline enricher: composes a one-line structural summary from
 * facts already in the graph. No LLM, no randomness — golden-test stable.
 */
export const heuristicEnricher: Enricher = {
  name: "heuristic",
  enrich(node, ctx) {
    const calledBy = ctx.callers.length;
    const calls = ctx.callees.length;
    const summary =
      `${node.kind} ${node.name} (${node.language}, ${node.layer} layer) — ` +
      `called by ${calledBy}, calls ${calls}, spans ${node.lines} lines.`;
    return { summary };
  },
};
```

- [ ] **Step 5: Export from `packages/engine/src/index.ts`**

Add after the existing `export * from "./query.js";` line:

```typescript
export * from "./enrich.js";
export { heuristicEnricher } from "./enrichers/heuristic.js";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm -C packages/engine test -- enrich`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/enrich.ts packages/engine/src/enrichers/heuristic.ts packages/engine/src/enrich.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): provider-agnostic enrichment pipeline + heuristic enricher"
```

---

### Task 2: Persist enrichment + `telos enrich` CLI

**Files:**
- Modify: `packages/engine/src/store.ts` (add `applyEnrichment`)
- Create: `packages/engine/src/store.enrich.test.ts`
- Modify: `packages/cli/src/main.ts` (add `enrich` command + `runEnrich`)
- Modify: `packages/cli/src/main.test.ts` (assert command registered)

**Interfaces:**
- Consumes: `enrichGraph`, `heuristicEnricher`, `GraphStore` from `@telos/engine`.
- Produces:
  - `GraphStore.applyEnrichment(updates: { id: string; summary: string; layer?: Layer }[]): void`
  - `runEnrich(path: string): Promise<{ enriched: number; dbPath: string }>` exported from `packages/cli/src/main.ts`

- [ ] **Step 1: Write the failing store test** — `packages/engine/src/store.enrich.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { GraphStore } from "./store.js";
import { TelosGraph } from "./schema.js";

const graph: TelosGraph = {
  nodes: [{
    id: "a", kind: "function", name: "f", qualifiedName: "f", language: "ts",
    path: "a.ts", lineStart: 1, lineEnd: 2, layer: "util", fanIn: 0, fanOut: 0,
    lines: 2, complexity: 0, summary: null,
  }],
  edges: [],
};

describe("GraphStore.applyEnrichment", () => {
  it("persists summary and refined layer, idempotently", () => {
    const store = GraphStore.open(":memory:");
    store.save(graph);
    store.applyEnrichment([{ id: "a", summary: "hello", layer: "service" }]);
    store.applyEnrichment([{ id: "a", summary: "hello", layer: "service" }]);
    const reloaded = store.loadGraph();
    expect(reloaded.nodes[0].summary).toBe("hello");
    expect(reloaded.nodes[0].layer).toBe("service");
    store.close();
  });

  it("updates only summary when layer is omitted", () => {
    const store = GraphStore.open(":memory:");
    store.save(graph);
    store.applyEnrichment([{ id: "a", summary: "only summary" }]);
    const reloaded = store.loadGraph();
    expect(reloaded.nodes[0].summary).toBe("only summary");
    expect(reloaded.nodes[0].layer).toBe("util");
    store.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/engine test -- store.enrich`
Expected: FAIL (`applyEnrichment is not a function`).

- [ ] **Step 3: Add `applyEnrichment` to `packages/engine/src/store.ts`**

Add this method to the `GraphStore` class (after `loadGraph`), and add `Layer` to the existing `schema.js` import:

```typescript
  applyEnrichment(updates: { id: string; summary: string; layer?: Layer }[]): void {
    const withLayer = this.db.prepare("UPDATE nodes SET summary = ?, layer = ? WHERE id = ?");
    const summaryOnly = this.db.prepare("UPDATE nodes SET summary = ? WHERE id = ?");
    const tx = this.db.transaction((rows: typeof updates) => {
      for (const u of rows) {
        if (u.layer) withLayer.run(u.summary, u.layer, u.id);
        else summaryOnly.run(u.summary, u.id);
      }
    });
    tx(updates);
  }
```

- [ ] **Step 4: Run store test to verify it passes**

Run: `pnpm -C packages/engine test -- store.enrich`
Expected: PASS (2 tests). Then rebuild engine dist: `pnpm -C packages/engine build`.

- [ ] **Step 5: Write the failing CLI test** — add to `packages/cli/src/main.test.ts`

```typescript
describe("telos enrich command", () => {
  it("is registered", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toContain("enrich");
  });
});
```

- [ ] **Step 6: Run CLI test to verify it fails**

Run: `pnpm -C packages/cli test -- main`
Expected: FAIL (`enrich` not in command list).

- [ ] **Step 7: Add `runEnrich` + `enrich` command to `packages/cli/src/main.ts`**

Add `GraphStore, enrichGraph, heuristicEnricher` to the `@telos/engine` import. Add this exported function near `runScan`:

```typescript
export async function runEnrich(path: string): Promise<{ enriched: number; dbPath: string }> {
  const dbPath = join(resolve(path), ".telos", "graph.db");
  if (!existsSync(dbPath)) {
    throw new Error(`No graph found at ${dbPath}. Run 'telos scan ${path}' first.`);
  }
  const store = GraphStore.open(dbPath);
  try {
    const enriched = enrichGraph(store.loadGraph(), heuristicEnricher);
    store.applyEnrichment(enriched.nodes.map((n) => ({ id: n.id, summary: n.summary!, layer: n.layer })));
    return { enriched: enriched.nodes.length, dbPath };
  } finally {
    store.close();
  }
}
```

Register the command inside `buildProgram()` (after the `scan` command):

```typescript
  program.command("enrich [path]").description("Fill node summaries from the graph (deterministic; no LLM)")
    .action(async (path: string | undefined) => {
      const r = await runEnrich(path ?? ".");
      console.log(`Telos: enriched ${r.enriched} nodes -> ${r.dbPath}`);
    });
```

- [ ] **Step 8: Run CLI tests to verify they pass**

Run: `pnpm -C packages/cli test -- main`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/store.ts packages/engine/src/store.enrich.test.ts packages/cli/src/main.ts packages/cli/src/main.test.ts
git commit -m "feat(engine,cli): persist enrichment + telos enrich command"
```

---

### Task 3: Surface `summary` in the web DetailPanel

**Files:**
- Modify: `apps/web/src/components/DetailPanel.tsx` (render summary section)
- Create: `apps/web/src/components/DetailPanel.summary.test.tsx`

**Interfaces:**
- Consumes: `NodeDetail` (its `node.summary: string | null`) — already in `apps/web/src/api/types.ts`. No server change (summary already flows through `nodeDetail`).
- Produces: a "Summary" section rendered when `detail.node.summary` is non-empty.

- [ ] **Step 1: Write the failing test** — `apps/web/src/components/DetailPanel.summary.test.tsx`

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DetailPanel } from "./DetailPanel";
import { NodeDetail } from "../api/types";

function detail(summary: string | null): NodeDetail {
  return {
    node: {
      id: "a", kind: "function", name: "authenticate", qualifiedName: "authenticate",
      language: "ts", path: "a.ts", layer: "api", lines: 18, complexity: 0, summary,
    } as NodeDetail["node"],
    callers: [], callees: [],
  };
}

describe("DetailPanel summary", () => {
  it("renders the summary when present", () => {
    render(<DetailPanel detail={detail("Authenticates a user.")} onClose={() => {}} />);
    expect(screen.getByText("Authenticates a user.")).toBeTruthy();
  });

  it("omits the summary section when null", () => {
    render(<DetailPanel detail={detail(null)} onClose={() => {}} />);
    expect(screen.queryByText("Summary")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- DetailPanel.summary`
Expected: FAIL (summary text not rendered).

- [ ] **Step 3: Render the summary section in `DetailPanel.tsx`**

Insert immediately after the metric chips row's closing `</div>` and before the first `<Divider />` (around line 239–241):

```tsx
      {n.summary && (
        <>
          <Divider />
          <div>
            <div
              style={{
                fontSize: "var(--t-label-size)",
                lineHeight: "var(--t-label-lh)",
                fontWeight: "var(--t-label-weight)" as React.CSSProperties["fontWeight"],
                color: "var(--text-muted)",
                marginBottom: "var(--s-1)",
              }}
            >
              Summary
            </div>
            <p style={{ margin: 0, fontSize: "var(--t-meta-size)", lineHeight: "var(--t-meta-lh)", color: "var(--text)" }}>
              {n.summary}
            </p>
          </div>
        </>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- DetailPanel.summary`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/DetailPanel.tsx apps/web/src/components/DetailPanel.summary.test.tsx
git commit -m "feat(web): render node summary in the detail panel"
```

---

### Task 4: Dependency-ordered guided tour

**Files:**
- Create: `packages/engine/src/tour.ts`
- Create: `packages/engine/src/tour.test.ts`
- Modify: `packages/engine/src/index.ts` (export)
- Modify: `packages/cli/src/main.ts` (add `tour` command)
- Modify: `packages/cli/src/main.test.ts` (assert registered)
- Modify: `packages/server/src/server.ts` (add `GET /api/tour` + optional provider method)
- Modify: `packages/server/src/graphService.ts` (implement `getTour`)

**Interfaces:**
- Consumes: `TelosGraph`, `TelosNode` from `./schema.js`.
- Produces:
  - `interface TourStop { node: TelosNode; order: number }`
  - `function buildTour(graph: TelosGraph, opts?: { limit?: number }): TourStop[]` — dependency order (a node appears after nodes it depends on), ties broken by fan-in desc then id. Uses `imports`/`calls`/`inherits`/`implements`/`references` edges (source depends on target).
  - `GraphProvider.getTour?(): TourStop[]`

- [ ] **Step 1: Write the failing test** — `packages/engine/src/tour.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "./schema.js";
import { buildTour } from "./tour.js";

function node(id: string, fanIn = 0): TelosNode {
  return {
    id, kind: "function", name: id, qualifiedName: id, language: "ts", path: "a.ts",
    lineStart: 1, lineEnd: 2, layer: "util", fanIn, fanOut: 0, lines: 2, complexity: 0, summary: null,
  };
}

// a depends on b (a calls b); b depends on c. Expected dependency order: c, b, a.
const graph: TelosGraph = {
  nodes: [node("a"), node("b"), node("c")],
  edges: [
    { sourceId: "a", targetId: "b", kind: "calls", resolved: true },
    { sourceId: "b", targetId: "c", kind: "calls", resolved: true },
  ],
};

describe("buildTour", () => {
  it("orders nodes so dependencies come before their dependents", () => {
    const order = buildTour(graph).map((s) => s.node.id);
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("a"));
  });

  it("assigns sequential order numbers and respects limit", () => {
    const tour = buildTour(graph, { limit: 2 });
    expect(tour).toHaveLength(2);
    expect(tour.map((s) => s.order)).toEqual([0, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/engine test -- tour`
Expected: FAIL (cannot find `./tour.js`).

- [ ] **Step 3: Write `packages/engine/src/tour.ts`**

```typescript
import { TelosGraph, TelosNode, EdgeKind } from "./schema.js";

export interface TourStop {
  node: TelosNode;
  order: number;
}

const DEP_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  "calls", "imports", "inherits", "implements", "references",
]);

/**
 * Order nodes in dependency order (a node appears after the nodes it depends
 * on) via Kahn topological sort. Cycles are broken deterministically by
 * fan-in desc then id. Pure; no LLM.
 */
export function buildTour(graph: TelosGraph, opts: { limit?: number } = {}): TourStop[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  // depends.get(X) = set of nodes X depends on (must come before X)
  const depCount = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // target -> sources that depend on it
  for (const n of graph.nodes) depCount.set(n.id, 0);
  for (const e of graph.edges) {
    if (!DEP_KINDS.has(e.kind)) continue;
    if (!byId.has(e.sourceId) || !byId.has(e.targetId) || e.sourceId === e.targetId) continue;
    depCount.set(e.sourceId, (depCount.get(e.sourceId) ?? 0) + 1);
    (dependents.get(e.targetId) ?? dependents.set(e.targetId, []).get(e.targetId)!).push(e.sourceId);
  }

  const cmp = (a: string, b: string) => {
    const na = byId.get(a)!, nb = byId.get(b)!;
    return nb.fanIn - na.fanIn || (a < b ? -1 : a > b ? 1 : 0);
  };

  const ready = graph.nodes.filter((n) => (depCount.get(n.id) ?? 0) === 0).map((n) => n.id);
  const out: TourStop[] = [];
  const visited = new Set<string>();
  while (out.length < graph.nodes.length) {
    if (ready.length === 0) {
      // cycle: pick the unvisited node with the fewest remaining deps, tie by cmp
      const rest = graph.nodes.filter((n) => !visited.has(n.id))
        .sort((a, b) => (depCount.get(a.id)! - depCount.get(b.id)!) || cmp(a.id, b.id));
      if (rest.length === 0) break;
      ready.push(rest[0].id);
    }
    ready.sort(cmp);
    const id = ready.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    out.push({ node: byId.get(id)!, order: out.length });
    for (const dep of dependents.get(id) ?? []) {
      depCount.set(dep, (depCount.get(dep) ?? 1) - 1);
      if ((depCount.get(dep) ?? 0) <= 0 && !visited.has(dep)) ready.push(dep);
    }
  }
  return typeof opts.limit === "number" ? out.slice(0, opts.limit) : out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/engine test -- tour`
Expected: PASS (2 tests). Add `export * from "./tour.js";` to `packages/engine/src/index.ts`, then `pnpm -C packages/engine build`.

- [ ] **Step 5: Add CLI test + command**

Add to `packages/cli/src/main.test.ts`:

```typescript
describe("telos tour command", () => {
  it("is registered", () => {
    expect(buildProgram().commands.map((c) => c.name())).toContain("tour");
  });
});
```

Add `buildTour` to the `@telos/engine` import in `main.ts`, and register inside `buildProgram()`:

```typescript
  program.command("tour [path]").description("Print a dependency-ordered walkthrough of the codebase")
    .option("-n, --limit <n>", "max stops", "20")
    .action(async (path: string | undefined, opts: { limit: string }) => {
      const dbPath = join(resolve(path ?? "."), ".telos", "graph.db");
      if (!existsSync(dbPath)) throw new Error(`No graph at ${dbPath}. Run 'telos scan' first.`);
      const store = GraphStore.open(dbPath);
      try {
        const tour = buildTour(store.loadGraph(), { limit: Number(opts.limit) });
        for (const s of tour) console.log(`${s.order + 1}. ${s.node.qualifiedName}  ${s.node.summary ?? ""}`.trimEnd());
      } finally { store.close(); }
    });
```

- [ ] **Step 6: Add server route + provider method**

In `packages/server/src/server.ts`, add to `GraphProvider`:

```typescript
  getTour?(limit?: number): unknown[];
```

and register a route (after `/api/overview`):

```typescript
  app.get<{ Querystring: { limit?: string } }>("/api/tour", async (req, reply) => {
    if (!provider.getTour) return reply.code(404).send({ error: "tour unavailable" });
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    return { stops: provider.getTour(limit) };
  });
```

In `packages/server/src/graphService.ts`, add `buildTour` to the `@telos/engine` import and the method:

```typescript
  getTour(limit?: number) {
    return buildTour(this.graph, { limit }).map((s) => ({
      id: s.node.id, qualifiedName: s.node.qualifiedName, summary: s.node.summary, order: s.order,
    }));
  }
```

- [ ] **Step 7: Run engine + cli + server tests**

Run: `pnpm -C packages/engine build && pnpm -C packages/cli test -- main && pnpm -C packages/server test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/tour.ts packages/engine/src/tour.test.ts packages/engine/src/index.ts packages/cli/src/main.ts packages/cli/src/main.test.ts packages/server/src/server.ts packages/server/src/graphService.ts
git commit -m "feat(engine,cli,server): dependency-ordered guided tour"
```

---

### Task 5: Graph Q&A ("where does X happen?")

**Files:**
- Create: `packages/engine/src/ask.ts`
- Create: `packages/engine/src/ask.test.ts`
- Modify: `packages/engine/src/index.ts` (export)
- Modify: `packages/cli/src/main.ts` (add `ask` command)
- Modify: `packages/cli/src/main.test.ts` (assert registered)
- Modify: `packages/server/src/server.ts` (add `GET /api/ask`)
- Modify: `packages/server/src/graphService.ts` (implement `getAnswers`)

**Interfaces:**
- Consumes: `TelosGraph`, `TelosNode` from `./schema.js`.
- Produces:
  - `interface Answer { node: TelosNode; score: number }`
  - `function askGraph(graph: TelosGraph, question: string, opts?: { limit?: number }): Answer[]` — ranks nodes by keyword overlap of the question tokens against `name`/`qualifiedName`/`path`/`summary`, plus a small fan-in importance boost. Deterministic. Returns only nodes with score > 0, highest first (ties by fan-in desc then id), capped at `opts.limit ?? 10`.
  - `GraphProvider.getAnswers?(q: string, limit?: number): unknown[]`

- [ ] **Step 1: Write the failing test** — `packages/engine/src/ask.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "./schema.js";
import { askGraph } from "./ask.js";

function node(id: string, name: string, path: string, summary: string | null, fanIn = 0): TelosNode {
  return {
    id, kind: "function", name, qualifiedName: name, language: "ts", path,
    lineStart: 1, lineEnd: 2, layer: "service", fanIn, fanOut: 0, lines: 2, complexity: 0, summary,
  };
}

const graph: TelosGraph = {
  nodes: [
    node("a", "authenticateUser", "src/auth/login.ts", "Validates user credentials and issues a token.", 5),
    node("b", "renderChart", "src/ui/chart.ts", "Draws a chart.", 1),
    node("c", "hashPassword", "src/auth/crypto.ts", "Hashes a password.", 2),
  ],
  edges: [],
};

describe("askGraph", () => {
  it("ranks the most relevant node first for a natural-language question", () => {
    const answers = askGraph(graph, "where does user authentication happen?");
    expect(answers[0].node.id).toBe("a");
    expect(answers[0].score).toBeGreaterThan(0);
  });

  it("returns only matching nodes and respects the limit", () => {
    const answers = askGraph(graph, "password", { limit: 1 });
    expect(answers).toHaveLength(1);
    expect(answers[0].node.id).toBe("c");
  });

  it("returns empty for a question with no overlap", () => {
    expect(askGraph(graph, "kubernetes deployment yaml")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/engine test -- ask`
Expected: FAIL (cannot find `./ask.js`).

- [ ] **Step 3: Write `packages/engine/src/ask.ts`**

```typescript
import { TelosGraph, TelosNode } from "./schema.js";

export interface Answer {
  node: TelosNode;
  score: number;
}

const STOP = new Set([
  "where", "does", "do", "the", "a", "an", "is", "are", "of", "to", "in", "on",
  "happen", "happens", "what", "which", "how", "and", "or", "for", "this", "that",
]);

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));
}

/** Deterministic keyword+structure ranking. No LLM; embeddings are a later upgrade. */
export function askGraph(graph: TelosGraph, question: string, opts: { limit?: number } = {}): Answer[] {
  const qWords = tokens(question);
  if (qWords.length === 0) return [];
  const answers: Answer[] = [];
  for (const node of graph.nodes) {
    const hay = new Set(tokens(`${node.name} ${node.qualifiedName} ${node.path} ${node.summary ?? ""}`));
    let hits = 0;
    for (const w of qWords) if (hay.has(w)) hits += 1;
    if (hits === 0) continue;
    const score = hits + Math.min(node.fanIn, 10) * 0.1;
    answers.push({ node, score });
  }
  answers.sort((x, y) => y.score - x.score || y.node.fanIn - x.node.fanIn || (x.node.id < y.node.id ? -1 : 1));
  return answers.slice(0, opts.limit ?? 10);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/engine test -- ask`
Expected: PASS (3 tests). Add `export * from "./ask.js";` to `index.ts`, then `pnpm -C packages/engine build`.

- [ ] **Step 5: Add CLI test + command**

Add to `packages/cli/src/main.test.ts`:

```typescript
describe("telos ask command", () => {
  it("is registered", () => {
    expect(buildProgram().commands.map((c) => c.name())).toContain("ask");
  });
});
```

Add `askGraph` to the `@telos/engine` import in `main.ts` and register:

```typescript
  program.command("ask <question>").description("Ask where something happens in the codebase (deterministic; no LLM)")
    .option("-p, --path <path>", "repo path", ".")
    .option("-n, --limit <n>", "max answers", "10")
    .action(async (question: string, opts: { path: string; limit: string }) => {
      const dbPath = join(resolve(opts.path), ".telos", "graph.db");
      if (!existsSync(dbPath)) throw new Error(`No graph at ${dbPath}. Run 'telos scan' first.`);
      const store = GraphStore.open(dbPath);
      try {
        const answers = askGraph(store.loadGraph(), question, { limit: Number(opts.limit) });
        if (answers.length === 0) { console.log("No matching code found."); return; }
        for (const a of answers) console.log(`${a.node.qualifiedName}  (${a.node.path})  ${a.node.summary ?? ""}`.trimEnd());
      } finally { store.close(); }
    });
```

- [ ] **Step 6: Add server route + provider method**

In `packages/server/src/server.ts`, add to `GraphProvider`:

```typescript
  getAnswers?(q: string, limit?: number): unknown[];
```

and a route:

```typescript
  app.get<{ Querystring: { q?: string; limit?: string } }>("/api/ask", async (req, reply) => {
    if (!provider.getAnswers) return reply.code(404).send({ error: "ask unavailable" });
    const q = (req.query.q ?? "").trim();
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    return { answers: q.length === 0 ? [] : provider.getAnswers(q, limit) };
  });
```

In `packages/server/src/graphService.ts`, add `askGraph` to the import and the method:

```typescript
  getAnswers(q: string, limit?: number) {
    return askGraph(this.graph, q, { limit }).map((a) => ({
      id: a.node.id, qualifiedName: a.node.qualifiedName, path: a.node.path,
      summary: a.node.summary, score: a.score,
    }));
  }
```

- [ ] **Step 7: Run engine + cli + server tests**

Run: `pnpm -C packages/engine build && pnpm -C packages/cli test -- main && pnpm -C packages/server test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/ask.ts packages/engine/src/ask.test.ts packages/engine/src/index.ts packages/cli/src/main.ts packages/cli/src/main.test.ts packages/server/src/server.ts packages/server/src/graphService.ts
git commit -m "feat(engine,cli,server): deterministic graph Q&A (where does X happen)"
```

---

## Final verification

- [ ] Run the full workspace suite: `pnpm -r test`. Expected: all packages green (engine + the new tests, cli, web, server, harness, mcp).
- [ ] Smoke: `node packages/cli/dist/main.js scan packages/engine/fixtures/scan-sample && node packages/cli/dist/main.js enrich packages/engine/fixtures/scan-sample && node packages/cli/dist/main.js tour packages/engine/fixtures/scan-sample -n 5 && node packages/cli/dist/main.js ask "where does parsing happen" -p packages/engine/fixtures/scan-sample`.
- [ ] Update memory `telos-project-state.md`: mark Phase 3 enrichment sub-project shipped.

## Self-Review notes

- **Spec coverage:** §2.1 Enricher → Task 1; §2.2 HeuristicEnricher → Task 1; §2.3 applyEnrichment → Task 2; §2.4 buildTour → Task 4; §2.5 askGraph → Task 5; §3 surfaces (CLI enrich/tour/ask, server tour/ask, web summary) → Tasks 2–5; §6 isolation (no LLM import) → enforced by Global Constraints + Task 1 stub test. The `LlmEnricher` (§5 slice 5) is intentionally out of scope.
- **Type consistency:** `Enricher`/`EnrichContext`/`NodeEnrichment` defined Task 1, consumed Task 2; `TourStop`/`buildTour` defined Task 4 used in CLI/server same task; `Answer`/`askGraph` defined Task 5 used same task. `applyEnrichment` signature identical in store and CLI caller.
- **No placeholders:** every code step shows full code.
