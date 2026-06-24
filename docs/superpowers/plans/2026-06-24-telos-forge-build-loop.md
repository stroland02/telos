# Telos Forge — Build Loop (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `telos forge "<intent>"` — a bounded agentic build loop that runs on an isolated git branch and reflects each iteration's graph diff onto the live map.

**Architecture:** A new optional `packages/forge` package orchestrates the loop. The agent backend is a pluggable `BuildDriver` (default wraps `@anthropic-ai/claude-agent-sdk`; a deterministic `stubDriver` is the test seam). Each checkpoint re-scans the worktree with a new non-persisting `scanGraph` (so the served `.telos/graph.db` is never clobbered), diffs it against the base graph with a new engine `diffGraphs`, and POSTs the diff to a server forge channel that broadcasts over SSE to the web overlay.

**Tech Stack:** TypeScript (ESM, Node ≥20), pnpm workspace, Vitest, `@telos/engine`, Fastify (server), React Flow (web), Commander (CLI), `@anthropic-ai/claude-agent-sdk` (default driver only).

## Global Constraints

- **Node ≥ 20**, TypeScript **ESM**; intra-package imports use **`.js`** specifiers.
- **pnpm workspace**; new package **`@telos/forge`**, version `0.0.0`, `"type": "module"`.
- **Isolation invariant:** all code writes happen on the forge branch only; the base branch and the served `.telos/graph.db` are never mutated. The map overlay is ephemeral and additive (no run ⇒ no overlay ⇒ no DB writes). The driver is optional: missing SDK / API key / driver error ⇒ clean non-zero exit naming the cause. **No silent failures.**
- **Forge requires a clean working tree** at start (`git status --porcelain` empty); otherwise abort with a clear message.
- Reuse engine types verbatim from `@telos/engine`: `TelosGraph`, `TelosNode` (`id`,`kind`,`qualifiedName`,`lineStart`,`lineEnd`,`layer`,`summary`,…), `TelosEdge` (`sourceId`,`targetId`,`kind`,`resolved`). Do not redefine them.
- Tests: **Vitest**, colocated `*.test.ts`. Web bundle must NOT import `@telos/engine` (node-only); the web overlay consumes only JSON over SSE.

## File Structure

| File | Responsibility |
|---|---|
| `packages/engine/src/diff.ts` | Pure `diffGraphs(base, next) → GraphDiff` |
| `packages/engine/src/pipeline.ts` (modify) | Extract non-persisting `scanGraph`; `scan` wraps it |
| `packages/forge/src/git.ts` | Git helpers (slugify, branch, clean check, commit) over `execFile` |
| `packages/forge/src/driver.ts` | `BuildDriver` interface + types + `stubDriver` |
| `packages/forge/src/claude-driver.ts` | Default driver over `@anthropic-ai/claude-agent-sdk` + pure `mapStop` |
| `packages/forge/src/forge.ts` | `runForge` orchestrator (branch → driver → per-checkpoint scan+diff+reflect → restore) |
| `packages/server/src/server.ts` (modify) | `POST /v1/forge/diff`, `GET /api/forge/stream` (SSE), `GET /api/forge/state` |
| `packages/cli/src/main.ts` (modify) | `telos forge` command |
| `apps/web/src/graph/useForgeOverlay.ts` | SSE subscription → current diff |
| `apps/web/src/components/MapView.tsx` (modify) | Inject `_forge` flags; TelosNode rings |

---

### Task 1: Engine `diffGraphs`

**Files:**
- Create: `packages/engine/src/diff.ts`
- Test: `packages/engine/src/diff.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Produces:
  - `interface GraphDiff { added: { nodes: string[]; edges: string[] }; removed: { nodes: string[]; edges: string[] }; changed: string[] }`
  - `diffGraphs(base: TelosGraph, next: TelosGraph): GraphDiff` — `added`/`removed` are ids present only in next/base. Node id = `TelosNode.id`. Edge id = `` `${sourceId}>${targetId}>${kind}` ``. `changed` = node ids in both whose `kind`/`lineStart`/`lineEnd`/`layer`/`summary` differ.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/engine/src/diff.test.ts
import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "./schema.js";
import { diffGraphs } from "./diff.js";

function n(over: Partial<TelosNode> & { id: string }): TelosNode {
  return {
    kind: "function", name: "f", qualifiedName: "app/f", language: "typescript",
    path: "a.ts", lineStart: 1, lineEnd: 5, layer: "service",
    fanIn: 0, fanOut: 0, lines: 5, complexity: 1, summary: null, ...over,
  };
}

describe("diffGraphs", () => {
  it("reports added, removed, and changed nodes", () => {
    const base: TelosGraph = { nodes: [n({ id: "a" }), n({ id: "b", lineEnd: 5 })], edges: [] };
    const next: TelosGraph = { nodes: [n({ id: "a" }), n({ id: "b", lineEnd: 9 }), n({ id: "c" })], edges: [] };
    const d = diffGraphs(base, next);
    expect(d.added.nodes).toEqual(["c"]);
    expect(d.removed.nodes).toEqual([]);
    expect(d.changed).toEqual(["b"]); // lineEnd 5 -> 9
  });

  it("diffs edges by source>target>kind and ignores unchanged graphs", () => {
    const base: TelosGraph = {
      nodes: [n({ id: "a" })],
      edges: [{ sourceId: "a", targetId: "b", kind: "calls", resolved: true }],
    };
    const next: TelosGraph = {
      nodes: [n({ id: "a" })],
      edges: [{ sourceId: "a", targetId: "c", kind: "calls", resolved: true }],
    };
    const d = diffGraphs(base, next);
    expect(d.added.edges).toEqual(["a>c>calls"]);
    expect(d.removed.edges).toEqual(["a>b>calls"]);

    const same = diffGraphs(base, base);
    expect(same).toEqual({ added: { nodes: [], edges: [] }, removed: { nodes: [], edges: [] }, changed: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/engine test -- diff`
Expected: FAIL — `Cannot find module './diff.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/engine/src/diff.ts
import { TelosGraph, TelosNode } from "./schema.js";

export interface GraphDiff {
  added: { nodes: string[]; edges: string[] };
  removed: { nodes: string[]; edges: string[] };
  changed: string[];
}

const edgeId = (e: { sourceId: string; targetId: string; kind: string }) =>
  `${e.sourceId}>${e.targetId}>${e.kind}`;

// Fields whose change should light up the map.
function nodeChanged(a: TelosNode, b: TelosNode): boolean {
  return a.kind !== b.kind || a.lineStart !== b.lineStart || a.lineEnd !== b.lineEnd
    || a.layer !== b.layer || a.summary !== b.summary;
}

export function diffGraphs(base: TelosGraph, next: TelosGraph): GraphDiff {
  const baseNodes = new Map(base.nodes.map((n) => [n.id, n]));
  const nextNodes = new Map(next.nodes.map((n) => [n.id, n]));
  const baseEdges = new Set(base.edges.map(edgeId));
  const nextEdges = new Set(next.edges.map(edgeId));

  const addedNodes = [...nextNodes.keys()].filter((id) => !baseNodes.has(id));
  const removedNodes = [...baseNodes.keys()].filter((id) => !nextNodes.has(id));
  const changed = [...nextNodes.keys()].filter(
    (id) => baseNodes.has(id) && nodeChanged(baseNodes.get(id)!, nextNodes.get(id)!),
  );
  const addedEdges = [...nextEdges].filter((e) => !baseEdges.has(e));
  const removedEdges = [...baseEdges].filter((e) => !nextEdges.has(e));

  return {
    added: { nodes: addedNodes, edges: addedEdges },
    removed: { nodes: removedNodes, edges: removedEdges },
    changed,
  };
}
```

Then add to `packages/engine/src/index.ts`:
```typescript
export { diffGraphs } from "./diff.js";
export type { GraphDiff } from "./diff.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/engine test -- diff`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/diff.ts packages/engine/src/diff.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): diffGraphs — added/changed/removed nodes and edges"
```

---

### Task 2: Engine `scanGraph` (non-persisting scan)

**Files:**
- Modify: `packages/engine/src/pipeline.ts`
- Test: `packages/engine/src/scan-graph.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Produces: `scanGraph(repoRoot: string): Promise<TelosGraph>` — same parse/resolve as `scan` but **writes no `.telos/graph.db`**. `scan` is refactored to call `scanGraph` then persist (its `{ dbPath, graph }` return is unchanged).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/engine/src/scan-graph.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanGraph } from "./pipeline.js";

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe("scanGraph", () => {
  it("returns a graph WITHOUT writing .telos/graph.db", async () => {
    dir = mkdtempSync(join(tmpdir(), "telos-scan-"));
    writeFileSync(join(dir, "a.ts"), "export function hello() { return 1; }\n");
    const graph = await scanGraph(dir);
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, ".telos", "graph.db"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/engine test -- scan-graph`
Expected: FAIL — `scanGraph is not a function` / not exported.

- [ ] **Step 3: Refactor `pipeline.ts` to extract `scanGraph`**

Replace the body of `packages/engine/src/pipeline.ts` with:
```typescript
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { walk } from "./walker.js";
import { Parser } from "./parser.js";
import { extractFile } from "./extractor.js";
import { resolveGraph } from "./resolver.js";
import { GraphStore } from "./store.js";
import { TelosGraph, TelosNode, TelosEdge } from "./schema.js";

/** Parse + resolve a repo into a graph. Pure: writes nothing to disk. */
export async function scanGraph(repoRoot: string): Promise<TelosGraph> {
  const files = await walk(repoRoot);
  const parser = await Parser.create();
  const nodes: TelosNode[] = []; const edges: TelosEdge[] = [];

  try {
    for (const f of files) {
      const source = await readFile(f.path, "utf8");
      const tree = parser.parse(source, f.language);
      const relPath = relative(repoRoot, f.path).replace(/\\/g, "/");
      const r = extractFile({ tree, source, relPath, language: f.language });
      nodes.push(...r.nodes); edges.push(...r.edges);
      tree.delete();
    }
  } finally {
    parser.dispose();
  }
  return resolveGraph({ nodes, edges });
}

/** Scan a repo and persist the graph to <repoRoot>/.telos/graph.db. */
export async function scan(repoRoot: string): Promise<{ dbPath: string; graph: TelosGraph }> {
  const graph = await scanGraph(repoRoot);
  const telosDir = join(repoRoot, ".telos");
  mkdirSync(telosDir, { recursive: true });
  const dbPath = join(telosDir, "graph.db");
  const store = GraphStore.open(dbPath);
  store.save(graph); store.close();
  return { dbPath, graph };
}
```

Then add to `packages/engine/src/index.ts`:
```typescript
export { scan, scanGraph } from "./pipeline.js";
```
(If `scan` is already exported there, change that line to also export `scanGraph`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C packages/engine test -- scan-graph` then `pnpm -C packages/engine test`
Expected: new test PASS; all prior engine tests still PASS (scan unchanged behavior).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/pipeline.ts packages/engine/src/scan-graph.test.ts packages/engine/src/index.ts
git commit -m "refactor(engine): extract non-persisting scanGraph; scan wraps it"
```

---

### Task 3: Scaffold `@telos/forge` package

**Files:**
- Create: `packages/forge/package.json`, `packages/forge/tsconfig.json`, `packages/forge/vitest.config.ts`, `packages/forge/src/index.ts`

**Interfaces:**
- Produces: a buildable/testable `@telos/forge` depending on `@telos/engine`.

- [ ] **Step 1: Create `packages/forge/package.json`**

```json
{
  "name": "@telos/forge",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run" },
  "dependencies": {
    "@telos/engine": "workspace:*",
    "@anthropic-ai/claude-agent-sdk": "^0.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/forge/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"] }
```

- [ ] **Step 3: Create `packages/forge/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
```

- [ ] **Step 4: Create placeholder `packages/forge/src/index.ts`**

```typescript
export const TELOS_FORGE_READY = true;
```

- [ ] **Step 5: Install + commit**

Run: `pnpm install`
Expected: links `@telos/forge`; installs `@anthropic-ai/claude-agent-sdk`. If that exact version is unavailable, run `pnpm -C packages/forge add @anthropic-ai/claude-agent-sdk` and accept the resolved version.

```bash
git add packages/forge/package.json packages/forge/tsconfig.json packages/forge/vitest.config.ts packages/forge/src/index.ts pnpm-lock.yaml
git commit -m "chore(forge): scaffold @telos/forge package"
```

---

### Task 4: Forge git helpers

**Files:**
- Create: `packages/forge/src/git.ts`
- Test: `packages/forge/src/git.test.ts`

**Interfaces:**
- Produces (all over `execFile("git", …, { cwd })`):
  - `slugify(s: string): string` — lowercased, non-alphanumerics → `-`, trimmed, capped 40 chars.
  - `currentBranch(cwd: string): Promise<string>`
  - `isClean(cwd: string): Promise<boolean>` — true iff `git status --porcelain` is empty.
  - `createAndCheckout(cwd: string, branch: string): Promise<void>` — `git checkout -b <branch>`.
  - `checkout(cwd: string, branch: string): Promise<void>`
  - `commitAll(cwd: string, message: string): Promise<boolean>` — stages all and commits; returns false if there was nothing to commit.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/forge/src/git.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { slugify, currentBranch, isClean, createAndCheckout, checkout, commitAll } from "./git.js";

const run = promisify(execFile);
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "telos-git-"));
  await run("git", ["init", "-b", "main"], { cwd: dir });
  await run("git", ["config", "user.email", "t@t.dev"], { cwd: dir });
  await run("git", ["config", "user.name", "T"], { cwd: dir });
  writeFileSync(join(dir, "a.txt"), "1\n");
  await run("git", ["add", "."], { cwd: dir });
  await run("git", ["commit", "-m", "init"], { cwd: dir });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("git helpers", () => {
  it("slugify normalizes intent text", () => {
    expect(slugify("Add a /health endpoint!")).toBe("add-a-health-endpoint");
  });

  it("reports branch and clean state, creates/checks out branches, commits", async () => {
    expect(await currentBranch(dir)).toBe("main");
    expect(await isClean(dir)).toBe(true);

    await createAndCheckout(dir, "telos/forge/x");
    expect(await currentBranch(dir)).toBe("telos/forge/x");

    writeFileSync(join(dir, "b.ts"), "export function g() { return 2; }\n");
    expect(await isClean(dir)).toBe(false);
    expect(await commitAll(dir, "add b")).toBe(true);
    expect(await isClean(dir)).toBe(true);
    expect(await commitAll(dir, "noop")).toBe(false); // nothing to commit

    await checkout(dir, "main");
    expect(await currentBranch(dir)).toBe("main");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/forge test -- git`
Expected: FAIL — `Cannot find module './git.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/forge/src/git.ts
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const run = promisify(execFile);

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export async function currentBranch(cwd: string): Promise<string> {
  const { stdout } = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  return stdout.trim();
}

export async function isClean(cwd: string): Promise<boolean> {
  const { stdout } = await run("git", ["status", "--porcelain"], { cwd });
  return stdout.trim().length === 0;
}

export async function createAndCheckout(cwd: string, branch: string): Promise<void> {
  await run("git", ["checkout", "-b", branch], { cwd });
}

export async function checkout(cwd: string, branch: string): Promise<void> {
  await run("git", ["checkout", branch], { cwd });
}

export async function commitAll(cwd: string, message: string): Promise<boolean> {
  await run("git", ["add", "-A"], { cwd });
  if (await isClean(cwd)) return false;
  await run("git", ["commit", "-m", message], { cwd });
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/forge test -- git`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/forge/src/git.ts packages/forge/src/git.test.ts
git commit -m "feat(forge): git helpers (slugify, branch, clean check, commit)"
```

---

### Task 5: `BuildDriver` interface + `stubDriver`

**Files:**
- Create: `packages/forge/src/driver.ts`
- Test: `packages/forge/src/driver.test.ts`

**Interfaces:**
- Produces:
  - `interface BuildCheckpoint { turn: number; summary: string; costUsd: number; committed: boolean }`
  - `interface BuildDriverArgs { intent: string; repoDir: string; branch: string; maxTurns: number; maxBudgetUsd: number; signal: AbortSignal; onCheckpoint: (c: BuildCheckpoint) => void | Promise<void> }`
  - `type BuildStop = "success" | "max_turns" | "max_budget" | "cancelled" | "error"`
  - `interface BuildResult { stop: BuildStop; turns: number; costUsd: number; message: string }`
  - `interface BuildDriver { readonly id: string; run(args: BuildDriverArgs): Promise<BuildResult> }`
  - `stubDriver: BuildDriver` — writes `forge_stub.ts` (a real `.ts` file so it appears in the graph), fires `onCheckpoint` once, returns `{ stop: "success", turns: 1, costUsd: 0, message: "stub wrote forge_stub.ts" }`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/forge/src/driver.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stubDriver, BuildCheckpoint } from "./driver.js";

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe("stubDriver", () => {
  it("writes a .ts file, emits a checkpoint, and returns success", async () => {
    dir = mkdtempSync(join(tmpdir(), "telos-stub-"));
    const seen: BuildCheckpoint[] = [];
    const res = await stubDriver.run({
      intent: "anything", repoDir: dir, branch: "telos/forge/x",
      maxTurns: 5, maxBudgetUsd: 1, signal: new AbortController().signal,
      onCheckpoint: (c) => { seen.push(c); },
    });
    expect(stubDriver.id).toBe("stub");
    expect(res.stop).toBe("success");
    expect(existsSync(join(dir, "forge_stub.ts"))).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0].turn).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/forge test -- driver`
Expected: FAIL — `Cannot find module './driver.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/forge/src/driver.ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface BuildCheckpoint { turn: number; summary: string; costUsd: number; committed: boolean }

export interface BuildDriverArgs {
  intent: string;
  repoDir: string;
  branch: string;
  maxTurns: number;
  maxBudgetUsd: number;
  signal: AbortSignal;
  onCheckpoint: (c: BuildCheckpoint) => void | Promise<void>;
}

export type BuildStop = "success" | "max_turns" | "max_budget" | "cancelled" | "error";
export interface BuildResult { stop: BuildStop; turns: number; costUsd: number; message: string }
export interface BuildDriver { readonly id: string; run(args: BuildDriverArgs): Promise<BuildResult> }

/** Deterministic, no-network driver. Writes one real .ts file so the loop's
 *  scan+diff has something to reflect. The seam that makes the loop testable. */
export const stubDriver: BuildDriver = {
  id: "stub",
  async run({ repoDir, onCheckpoint }: BuildDriverArgs): Promise<BuildResult> {
    await writeFile(join(repoDir, "forge_stub.ts"), "export function forgeStub() { return 42; }\n");
    await onCheckpoint({ turn: 1, summary: "stub wrote forge_stub.ts", costUsd: 0, committed: false });
    return { stop: "success", turns: 1, costUsd: 0, message: "stub wrote forge_stub.ts" };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/forge test -- driver`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/forge/src/driver.ts packages/forge/src/driver.test.ts
git commit -m "feat(forge): BuildDriver interface + deterministic stubDriver"
```

---

### Task 6: `runForge` orchestrator

**Files:**
- Create: `packages/forge/src/forge.ts`
- Test: `packages/forge/src/forge.test.ts`
- Modify: `packages/forge/src/index.ts`

**Interfaces:**
- Consumes: `scanGraph`, `diffGraphs`, `GraphDiff` from `@telos/engine`; git helpers from `./git.js`; driver types from `./driver.js`.
- Produces:
  - `interface ForgeDiffEvent { checkpoint: BuildCheckpoint; diff: GraphDiff }`
  - `interface ForgeOptions { intent: string; repoDir: string; driver: BuildDriver; maxTurns?: number; maxBudgetUsd?: number; signal?: AbortSignal; onDiff?: (e: ForgeDiffEvent) => void | Promise<void> }`
  - `interface ForgeRunResult { branch: string; baseBranch: string; commits: number; turns: number; costUsd: number; stop: BuildStop; message: string }`
  - `runForge(opts: ForgeOptions): Promise<ForgeRunResult>` — requires a clean tree (throws `Error("working tree not clean…")` otherwise); creates `telos/forge/<slug>` from HEAD; computes the base graph once; runs the driver; on each checkpoint re-scans, diffs against base, commits, and calls `onDiff`; **restores the original branch in a `finally`**; returns the result.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/forge/src/forge.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { stubDriver } from "./driver.js";
import { runForge, ForgeDiffEvent } from "./forge.js";

const run = promisify(execFile);
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "telos-forge-"));
  await run("git", ["init", "-b", "main"], { cwd: dir });
  await run("git", ["config", "user.email", "t@t.dev"], { cwd: dir });
  await run("git", ["config", "user.name", "T"], { cwd: dir });
  writeFileSync(join(dir, "a.ts"), "export function a() { return 1; }\n");
  await run("git", ["add", "."], { cwd: dir });
  await run("git", ["commit", "-m", "init"], { cwd: dir });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("runForge", () => {
  it("runs the loop on a forge branch, reflects a diff, and restores the base branch", async () => {
    const events: ForgeDiffEvent[] = [];
    const res = await runForge({
      intent: "add forge stub", repoDir: dir, driver: stubDriver,
      onDiff: (e) => { events.push(e); },
    });

    expect(res.stop).toBe("success");
    expect(res.branch).toBe("telos/forge/add-forge-stub");
    expect(res.baseBranch).toBe("main");
    expect(res.commits).toBe(1);
    // the stub's new file shows up as an added node in the reflected diff
    expect(events.length).toBe(1);
    expect(events[0].diff.added.nodes.length).toBeGreaterThan(0);

    // base branch restored, served db never written, forge branch holds the work
    const { stdout: branch } = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir });
    expect(branch.trim()).toBe("main");
    expect(existsSync(join(dir, ".telos", "graph.db"))).toBe(false);
    expect(existsSync(join(dir, "forge_stub.ts"))).toBe(false); // not on main
    const { stdout: branches } = await run("git", ["branch"], { cwd: dir });
    expect(branches).toContain("telos/forge/add-forge-stub");
  });

  it("refuses to run on a dirty working tree", async () => {
    writeFileSync(join(dir, "dirty.ts"), "export function d() { return 0; }\n");
    await expect(runForge({ intent: "x", repoDir: dir, driver: stubDriver }))
      .rejects.toThrow(/working tree not clean/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/forge test -- forge`
Expected: FAIL — `Cannot find module './forge.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/forge/src/forge.ts
import { scanGraph, diffGraphs, GraphDiff, TelosGraph } from "@telos/engine";
import { BuildCheckpoint, BuildDriver, BuildStop } from "./driver.js";
import { slugify, currentBranch, isClean, createAndCheckout, checkout, commitAll } from "./git.js";

export interface ForgeDiffEvent { checkpoint: BuildCheckpoint; diff: GraphDiff }

export interface ForgeOptions {
  intent: string;
  repoDir: string;
  driver: BuildDriver;
  maxTurns?: number;
  maxBudgetUsd?: number;
  signal?: AbortSignal;
  onDiff?: (e: ForgeDiffEvent) => void | Promise<void>;
}

export interface ForgeRunResult {
  branch: string; baseBranch: string; commits: number;
  turns: number; costUsd: number; stop: BuildStop; message: string;
}

export async function runForge(opts: ForgeOptions): Promise<ForgeRunResult> {
  const { intent, repoDir, driver } = opts;
  if (!(await isClean(repoDir))) {
    throw new Error("working tree not clean — commit or stash changes before running forge");
  }
  const baseBranch = await currentBranch(repoDir);
  const branch = `telos/forge/${slugify(intent)}`;
  const base: TelosGraph = await scanGraph(repoDir);

  await createAndCheckout(repoDir, branch);
  let commits = 0;

  try {
    const result = await driver.run({
      intent, repoDir, branch,
      maxTurns: opts.maxTurns ?? 20,
      maxBudgetUsd: opts.maxBudgetUsd ?? 2,
      signal: opts.signal ?? new AbortController().signal,
      onCheckpoint: async (c) => {
        const committed = await commitAll(repoDir, `forge: turn ${c.turn} — ${c.summary}`);
        if (committed) commits += 1;
        const next = await scanGraph(repoDir);
        const diff = diffGraphs(base, next);
        await opts.onDiff?.({ checkpoint: { ...c, committed }, diff });
      },
    });
    return { branch, baseBranch, commits, turns: result.turns, costUsd: result.costUsd, stop: result.stop, message: result.message };
  } finally {
    await checkout(repoDir, baseBranch); // restore the user's tree no matter what
  }
}
```

Then set `packages/forge/src/index.ts`:
```typescript
export * from "./driver.js";
export * from "./forge.js";
export { slugify } from "./git.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm -C packages/forge test`
Expected: all PASS (git, driver, forge).

- [ ] **Step 5: Build + commit**

Run: `pnpm -C packages/forge build` (tsc exits 0).
```bash
git add packages/forge/src/forge.ts packages/forge/src/forge.test.ts packages/forge/src/index.ts
git commit -m "feat(forge): runForge orchestrator — branch, drive, reflect diff, restore"
```

---

### Task 7: `claudeAgentDriver` (default backend)

**Files:**
- Create: `packages/forge/src/claude-driver.ts`
- Test: `packages/forge/src/claude-driver.test.ts`
- Modify: `packages/forge/src/index.ts`

**Interfaces:**
- Produces:
  - `mapStop(subtype: string): BuildStop` — pure: `"success"`→`"success"`, `"error_max_turns"`→`"max_turns"`, `"error_max_budget_usd"`→`"max_budget"`, anything else → `"error"`.
  - `claudeAgentDriver: BuildDriver` (`id: "claude-agent"`) — wraps the SDK `query()`. Unit-tested only via `mapStop`; the live `query()` path is smoke-tested manually.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/forge/src/claude-driver.test.ts
import { describe, it, expect } from "vitest";
import { mapStop, claudeAgentDriver } from "./claude-driver.js";

describe("mapStop", () => {
  it("maps SDK result subtypes to BuildStop", () => {
    expect(mapStop("success")).toBe("success");
    expect(mapStop("error_max_turns")).toBe("max_turns");
    expect(mapStop("error_max_budget_usd")).toBe("max_budget");
    expect(mapStop("error_during_execution")).toBe("error");
    expect(mapStop("whatever")).toBe("error");
  });
  it("exposes a claude-agent driver", () => {
    expect(claudeAgentDriver.id).toBe("claude-agent");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/forge test -- claude-driver`
Expected: FAIL — `Cannot find module './claude-driver.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/forge/src/claude-driver.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { BuildDriver, BuildDriverArgs, BuildResult, BuildStop } from "./driver.js";

export function mapStop(subtype: string): BuildStop {
  switch (subtype) {
    case "success": return "success";
    case "error_max_turns": return "max_turns";
    case "error_max_budget_usd": return "max_budget";
    default: return "error";
  }
}

/** Default driver: runs the Claude Code agent loop in-process via the Agent SDK.
 *  Edits happen in repoDir (already on the forge branch). Optional: any failure
 *  (missing auth, SDK error) returns stop:"error" with the cause — never throws
 *  past runForge's branch-restore. */
export const claudeAgentDriver: BuildDriver = {
  id: "claude-agent",
  async run({ intent, repoDir, maxTurns, maxBudgetUsd, signal, onCheckpoint }: BuildDriverArgs): Promise<BuildResult> {
    let turns = 0;
    let costUsd = 0;
    try {
      for await (const message of query({
        prompt: intent,
        options: {
          cwd: repoDir,
          allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
          permissionMode: "acceptEdits",
          maxTurns,
          maxBudgetUsd,
          abortController: signalToController(signal),
        },
      })) {
        if (message.type === "assistant") {
          turns += 1;
          await onCheckpoint({ turn: turns, summary: `turn ${turns}`, costUsd, committed: false });
        }
        if (message.type === "result") {
          costUsd = message.total_cost_usd ?? costUsd;
          return { stop: mapStop(message.subtype), turns, costUsd, message: message.subtype === "success" ? (message.result ?? "done") : message.subtype };
        }
      }
      return { stop: "error", turns, costUsd, message: "agent ended without a result" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { stop: signal.aborted ? "cancelled" : "error", turns, costUsd, message: msg };
    }
  },
};

// The SDK takes an AbortController; bridge our AbortSignal to one.
function signalToController(signal: AbortSignal): AbortController {
  const c = new AbortController();
  if (signal.aborted) c.abort();
  else signal.addEventListener("abort", () => c.abort(), { once: true });
  return c;
}
```

Then add to `packages/forge/src/index.ts`:
```typescript
export { claudeAgentDriver, mapStop } from "./claude-driver.js";
```

> Implementer note: the Agent SDK option names (`maxTurns`, `maxBudgetUsd`, `permissionMode`, `abortController`, `cwd`) follow the TypeScript SDK `Options` type. If a field name differs in the installed version, adjust to the installed type — `mapStop` and the message-type checks (`"assistant"`, `"result"`, `total_cost_usd`, `subtype`, `result`) are the stable contract this task tests. Attaching the Telos MCP server to `options.mcpServers` is a follow-up; this slice ships with the agent reading files directly.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/forge test -- claude-driver` then `pnpm -C packages/forge build`
Expected: tests PASS; tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/forge/src/claude-driver.ts packages/forge/src/claude-driver.test.ts packages/forge/src/index.ts
git commit -m "feat(forge): claudeAgentDriver (Agent SDK) + pure mapStop"
```

---

### Task 8: Server forge channel

**Files:**
- Modify: `packages/server/src/server.ts`
- Test: `packages/server/src/forge.test.ts`

**Interfaces:**
- Consumes: `GraphDiff` from `@telos/engine`.
- Produces (mirrors the Phase 2 trace ingest→SSE pattern):
  - `interface ForgeState { run: string; turn: number; costUsd: number; stop: string | null; diff: GraphDiff } | null`
  - `POST /v1/forge/diff` — body `{ run: string; checkpoint: { turn: number; costUsd: number }; diff: GraphDiff; stop?: string }` → stores latest `ForgeState`, broadcasts to SSE subscribers, returns `{ ok: true }`. 404 when the provider has no forge hub.
  - `GET /api/forge/state` — returns `{ state: ForgeState }`.
  - `GET /api/forge/stream` — SSE; emits each new state as `data: <json>\n\n`.

> Implementer note: follow the existing trace SSE implementation in `server.ts` (search `/api/trace/stream`, `reply.hijack`). Add a `forge` field to the same optional hub object that `getTraceHub?.()` returns, holding `{ state: ForgeState; subscribers: Set<ServerResponse> }`. If the hub is absent, the forge routes 404 exactly like the trace routes.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/forge.test.ts
import { describe, it, expect } from "vitest";
import { buildServer, GraphService } from "./index.js";
import { join } from "node:path";

// Reuse the same fixture db the other server tests use.
const DB = join(__dirname, "..", "..", "engine", "fixtures", "scan-sample", ".telos", "graph.db");
const REPO = join(__dirname, "..", "..", "engine", "fixtures", "scan-sample");

function app() {
  return buildServer(GraphService.fromDb(DB, REPO), {});
}

describe("forge channel", () => {
  it("ingests a diff and reflects it in /api/forge/state", async () => {
    const a = app();
    const diff = { added: { nodes: ["x"], edges: [] }, removed: { nodes: [], edges: [] }, changed: [] };
    const post = await a.inject({
      method: "POST", url: "/v1/forge/diff",
      payload: { run: "r1", checkpoint: { turn: 1, costUsd: 0.01 }, diff, stop: null },
    });
    expect(post.statusCode).toBe(200);

    const get = await a.inject({ method: "GET", url: "/api/forge/state" });
    expect(get.statusCode).toBe(200);
    const body = get.json();
    expect(body.state.run).toBe("r1");
    expect(body.state.diff.added.nodes).toEqual(["x"]);
    await a.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/server test -- forge`
Expected: FAIL — 404 on `/v1/forge/diff` (route not defined).

- [ ] **Step 3: Implement the routes in `server.ts`**

In the same block where the trace hub is set up, extend the hub returned by `getTraceHub?.()` with a `forge` field initialized to `{ state: null, subscribers: new Set() }`, then add (near the other `/v1` and `/api/trace` routes):

```typescript
  // ── Forge reflection channel (ephemeral; no DB writes) ─────────────────────
  app.post<{ Body: { run: string; checkpoint: { turn: number; costUsd: number }; diff: unknown; stop?: string | null } }>(
    "/v1/forge/diff",
    async (req, reply) => {
      const hub = provider.getTraceHub?.();
      if (!hub) return reply.code(404).send({ error: "forge channel unavailable" });
      const b = req.body;
      hub.forge.state = {
        run: b.run, turn: b.checkpoint.turn, costUsd: b.checkpoint.costUsd,
        stop: b.stop ?? null, diff: b.diff,
      } as never;
      const payload = `data: ${JSON.stringify(hub.forge.state)}\n\n`;
      for (const res of hub.forge.subscribers) res.write(payload);
      return { ok: true };
    },
  );

  app.get("/api/forge/state", async (_req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "forge channel unavailable" });
    return { state: hub.forge.state };
  });

  app.get("/api/forge/stream", async (req, reply) => {
    const hub = provider.getTraceHub?.();
    if (!hub) return reply.code(404).send({ error: "forge channel unavailable" });
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive",
    });
    if (hub.forge.state) reply.raw.write(`data: ${JSON.stringify(hub.forge.state)}\n\n`);
    hub.forge.subscribers.add(reply.raw);
    req.raw.on("close", () => { hub.forge.subscribers.delete(reply.raw); });
  });
```

Update the `TraceHub` interface (or its forge-bearing equivalent) to include:
```typescript
  forge: { state: ForgeState; subscribers: Set<import("node:http").ServerResponse> };
```
and define `ForgeState` near the other trace state types:
```typescript
import { GraphDiff } from "@telos/engine";
export type ForgeState = { run: string; turn: number; costUsd: number; stop: string | null; diff: GraphDiff } | null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/server test -- forge` then `pnpm -C packages/server test`
Expected: forge test PASS; all prior server tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/server.ts packages/server/src/forge.test.ts
git commit -m "feat(server): forge reflection channel (POST /v1/forge/diff + SSE)"
```

---

### Task 9: CLI `telos forge`

**Files:**
- Modify: `packages/cli/src/main.ts`
- Test: `packages/cli/src/forge.test.ts`

**Interfaces:**
- Consumes: `runForge`, `stubDriver`, `claudeAgentDriver` from `@telos/forge`.
- Produces:
  - `runForgeCli(opts: { intent: string; path?: string; url?: string; driver?: string; budget?: number; maxTurns?: number; fetchImpl?: typeof fetch }): Promise<ForgeRunResult>` — picks the driver (`stub`→`stubDriver`, else `claudeAgentDriver`), runs `runForge`, and best-effort POSTs each diff to `${url}/v1/forge/diff` (swallows fetch errors so headless runs still work).
  - `telos forge "<intent>"` command with options `-p, --path`, `--url`, `--driver`, `--budget`, `--max-turns`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/cli/src/forge.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { runForgeCli } from "./main.js";

const run = promisify(execFile);
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "telos-cli-forge-"));
  await run("git", ["init", "-b", "main"], { cwd: dir });
  await run("git", ["config", "user.email", "t@t.dev"], { cwd: dir });
  await run("git", ["config", "user.name", "T"], { cwd: dir });
  writeFileSync(join(dir, "a.ts"), "export function a() { return 1; }\n");
  await run("git", ["add", "."], { cwd: dir });
  await run("git", ["commit", "-m", "init"], { cwd: dir });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("runForgeCli", () => {
  it("runs the stub driver and posts the diff best-effort", async () => {
    const posts: string[] = [];
    const fakeFetch = (async (url: string) => { posts.push(String(url)); return { ok: true } as Response; }) as unknown as typeof fetch;
    const res = await runForgeCli({ intent: "add stub", path: dir, driver: "stub", fetchImpl: fakeFetch });
    expect(res.stop).toBe("success");
    expect(res.branch).toBe("telos/forge/add-stub");
    expect(posts.some((u) => u.endsWith("/v1/forge/diff"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/cli test -- forge`
Expected: FAIL — `runForgeCli is not a function`.

- [ ] **Step 3: Implement in `main.ts`**

Add to the imports from `@telos/forge`:
```typescript
import { runForge, stubDriver, claudeAgentDriver, ForgeRunResult } from "@telos/forge";
```

Add the function (near `runTop`):
```typescript
export async function runForgeCli(opts: {
  intent: string; path?: string; url?: string; driver?: string;
  budget?: number; maxTurns?: number; fetchImpl?: typeof fetch;
}): Promise<ForgeRunResult> {
  const repoDir = resolve(opts.path ?? ".");
  const url = (opts.url ?? "http://localhost:5180").replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;
  const driver = opts.driver === "stub" ? stubDriver : claudeAgentDriver;
  const run = `forge-${driver.id}`;
  return runForge({
    intent: opts.intent, repoDir, driver,
    maxBudgetUsd: opts.budget, maxTurns: opts.maxTurns,
    onDiff: async ({ checkpoint, diff }) => {
      try {
        await doFetch(`${url}/v1/forge/diff`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ run, checkpoint, diff }),
        });
      } catch { /* headless / no server — reflection is best-effort */ }
    },
  });
}
```

Add the command (near the `top` command):
```typescript
  program.command("forge <intent>").description("Run a bounded agentic build loop on an isolated branch (reflects onto the map)")
    .option("-p, --path <path>", "repo path", ".")
    .option("--url <url>", "running Telos server base URL", "http://localhost:5180")
    .option("--driver <id>", "build driver: claude-agent | stub", "claude-agent")
    .option("--budget <usd>", "max spend before stopping", parseFloat)
    .option("--max-turns <n>", "max agent turns", (v) => parseInt(v, 10))
    .action(async (intent: string, opts: { path: string; url: string; driver: string; budget?: number; maxTurns?: number }) => {
      const r = await runForgeCli({ intent, path: opts.path, url: opts.url, driver: opts.driver, budget: opts.budget, maxTurns: opts.maxTurns });
      console.log(`Telos forge [${r.stop}] — branch ${r.branch}: ${r.commits} commit(s), ${r.turns} turn(s), $${r.costUsd.toFixed(4)}.`);
      console.log(`Review: git diff ${r.baseBranch}..${r.branch}  (merge to keep, or 'git branch -D ${r.branch}' to discard)`);
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/cli build && pnpm -C packages/cli test -- forge`
Expected: build OK; test PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/main.ts packages/cli/src/forge.test.ts
git commit -m "feat(cli): telos forge — drive the build loop + reflect diffs"
```

---

### Task 10: Web forge overlay

**Files:**
- Create: `apps/web/src/graph/useForgeOverlay.ts`
- Test: `apps/web/src/graph/useForgeOverlay.test.ts`
- Modify: `apps/web/src/api/types.ts`, `apps/web/src/api/client.ts`, `apps/web/src/components/MapView.tsx`, `apps/web/src/components/TelosNode.tsx`

**Interfaces:**
- Consumes: `/api/forge/stream` (SSE).
- Produces:
  - types in `types.ts`: `interface ForgeDiff { added: { nodes: string[]; edges: string[] }; removed: { nodes: string[]; edges: string[] }; changed: string[] }` and `interface ForgeState { run: string; turn: number; costUsd: number; stop: string | null; diff: ForgeDiff }`.
  - `client.ts`: `subscribeForge(onState: (s: ForgeState) => void): () => void` (EventSource; returns an unsubscribe).
  - `useForgeOverlay(api): { forge: ForgeState | null }` — subscribes on mount, unsubscribes on unmount.
  - MapView injects `_forgeAdded`/`_forgeChanged`/`_forgeRemoved` booleans into node data from `forge?.diff`; TelosNode renders a green/amber/faded ring accordingly.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/graph/useForgeOverlay.test.ts
import { describe, it, expect } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useForgeOverlay } from "./useForgeOverlay.js";
import { ForgeState } from "../api/types.js";

describe("useForgeOverlay", () => {
  it("exposes the latest forge state pushed by the subscription", async () => {
    let push: (s: ForgeState) => void = () => {};
    const api = {
      subscribeForge(cb: (s: ForgeState) => void) { push = cb; return () => {}; },
    } as never;

    const { result } = renderHook(() => useForgeOverlay(api));
    expect(result.current.forge).toBeNull();

    const state: ForgeState = { run: "r1", turn: 2, costUsd: 0.05, stop: null,
      diff: { added: { nodes: ["n1"], edges: [] }, removed: { nodes: [], edges: [] }, changed: ["n2"] } };
    act(() => push(state));

    await waitFor(() => expect(result.current.forge?.run).toBe("r1"));
    expect(result.current.forge?.diff.added.nodes).toEqual(["n1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C apps/web test -- useForgeOverlay`
Expected: FAIL — `Cannot find module './useForgeOverlay.js'`.

- [ ] **Step 3: Implement types, client method, and the hook**

Add to `apps/web/src/api/types.ts`:
```typescript
export interface ForgeDiff {
  added: { nodes: string[]; edges: string[] };
  removed: { nodes: string[]; edges: string[] };
  changed: string[];
}
export interface ForgeState {
  run: string; turn: number; costUsd: number; stop: string | null; diff: ForgeDiff;
}
```

Add to the `TelosApi` class in `apps/web/src/api/client.ts`:
```typescript
  subscribeForge(onState: (s: import("./types").ForgeState) => void): () => void {
    const es = new EventSource(`${this.baseUrl}/api/forge/stream`);
    es.onmessage = (ev) => { try { onState(JSON.parse(ev.data)); } catch { /* ignore */ } };
    return () => es.close();
  }
```
(Use the same `this.baseUrl` convention the existing `subscribeTrace` uses.)

Create `apps/web/src/graph/useForgeOverlay.ts`:
```typescript
import { useEffect, useState } from "react";
import { TelosApi } from "../api/client";
import { ForgeState } from "../api/types";

export function useForgeOverlay(api: Pick<TelosApi, "subscribeForge">): { forge: ForgeState | null } {
  const [forge, setForge] = useState<ForgeState | null>(null);
  useEffect(() => api.subscribeForge(setForge), [api]);
  return { forge };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C apps/web test -- useForgeOverlay`
Expected: PASS.

- [ ] **Step 5: Wire the overlay into the map**

In `apps/web/src/components/MapView.tsx`, accept an optional `forge?: ForgeState | null` prop and, when building each node's `data`, set:
```typescript
        _forgeAdded: forge?.diff.added.nodes.includes(node.id) ?? false,
        _forgeChanged: forge?.diff.changed.includes(node.id) ?? false,
        _forgeRemoved: forge?.diff.removed.nodes.includes(node.id) ?? false,
```
In `apps/web/src/components/TelosNode.tsx`, after the existing live/replay/hot rings, add (token-styled, no hard-coded hex):
```typescript
  const forgeRing = data._forgeAdded
    ? "0 0 0 2px var(--ok, #3fb950)"
    : data._forgeChanged
    ? "0 0 0 2px var(--accent)"
    : data._forgeRemoved
    ? "0 0 0 2px var(--text-faint)"
    : undefined;
```
and include `forgeRing` in the node's `boxShadow` composition (following however the existing rings are combined). Then in `App.tsx`, call `useForgeOverlay(api)` and pass `forge` to `<MapView forge={forge} … />`.

- [ ] **Step 6: Build + test the web package, then commit**

Run: `pnpm -C apps/web build && pnpm -C apps/web test`
Expected: tsc/vite build OK; all web tests PASS.

```bash
git add apps/web/src/graph/useForgeOverlay.ts apps/web/src/graph/useForgeOverlay.test.ts apps/web/src/api/types.ts apps/web/src/api/client.ts apps/web/src/components/MapView.tsx apps/web/src/components/TelosNode.tsx apps/web/src/App.tsx
git commit -m "feat(web): forge overlay — green/amber/faded node rings from the diff stream"
```

---

## Final Verification

- [ ] Run the full suite: `pnpm -r test` — all packages green (engine, forge, server, cli, web, mcp, harness).
- [ ] Smoke test end-to-end (manual, stub driver, no API needed):
  1. `pnpm -r build`
  2. In a scratch git repo with a `.ts` file: `node <cli>/dist/main.js forge "add a greeter" --driver stub --path <repo>`
  3. Expect: summary printed, `telos/forge/add-a-greeter` branch created, base branch restored, `forge_stub.ts` only on the forge branch.
  4. With a running `telos serve` + open map: re-run and confirm the added node flashes green on the map.
- [ ] Merge `feat/forge-build-loop` to master `--no-ff`, push, delete branch, update memory.

---

## Self-Review notes

- **Spec coverage** (against `2026-06-24-telos-phase4-forge-build-loop-design.md`):
  §4.1 `BuildDriver`/`stubDriver`/`claudeAgentDriver`/`runForge` → Tasks 5, 6, 7; §4.2 `diffGraphs` → Task 1; non-persisting reflection → Task 2 (`scanGraph`); §4.3 server channel → Task 8; §4.4 web overlay → Task 10; §4.5 `telos forge` → Task 9. §3 isolation invariant: `scanGraph` (no DB write, Task 2), dedicated branch + clean-tree guard + `finally` restore (Task 6), best-effort POST so headless works (Task 9). §6 stop conditions → `mapStop` + driver result (Task 7), surfaced in the CLI summary (Task 9).
- **Placeholder scan:** every code step contains complete code; no TBD/TODO. The two "implementer notes" (Agent SDK option names; wiring the ring into existing `boxShadow`) point at a stable tested contract, not missing code.
- **Type consistency:** `BuildCheckpoint`/`BuildDriverArgs`/`BuildStop`/`BuildResult`/`BuildDriver` defined once (Task 5), reused in Tasks 6/7/9; `GraphDiff` defined in Task 1, reused in Tasks 6/8/10 (web mirrors it as `ForgeDiff`, intentionally — the web bundle must not import `@telos/engine`); `ForgeRunResult` defined in Task 6, reused in Task 9; `scanGraph`/`diffGraphs` signatures consistent across engine and forge.
- **Constraints honored:** ESM `.js` specifiers; reuses engine types; isolation invariant enforced structurally; web never imports engine; the Agent SDK dependency is confined to `claude-driver.ts` and the whole package tests green via `stubDriver` alone.
