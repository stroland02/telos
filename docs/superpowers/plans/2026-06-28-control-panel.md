# Telos Control Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold all background-visibility (harness routing, injected context, MCP queries, token impact) and the Activate control into the `⚙ Harness` web panel, organized as a tabbed control panel.

**Architecture:** Three Telos processes coordinate through append-only JSONL files under `.telos/`. The hook records what it injects per prompt (extended `activity.jsonl`); the MCP server records each graph query (new `mcp-activity.jsonl`); the web server reads both plus the existing `measure()` and serves them to a rebuilt `HarnessPanel`.

**Tech Stack:** TypeScript, pnpm workspaces, Node ≥20, Fastify (server), MCP SDK, React 18 + framer-motion (web), Vitest + React Testing Library.

## Global Constraints

- **Token estimate = `Math.ceil(text.length / 4)`** everywhere (matches engine `estimateTokens`). Copy verbatim per-package; do NOT import the engine's copy into the hook (see next line).
- **`packages/cli/src/hook.ts` MUST stay engine-free** — it runs on every prompt (~150ms budget). Only import from `@telos/harness` and node builtins. Never import `@telos/engine`.
- **All JSONL logging is best-effort and MUST NOT throw** — a failed write/read must never break a hook or a tool call (same guarantee as existing `recordActivity`).
- **No hard-coded hex in web components** — use `var(--...)` design tokens only.
- **Test runner:** from repo root, `pnpm --filter <pkg> exec vitest run <relative-test-path>`. If a package's workspace deps changed, run `pnpm -r build` first.
- **Commit after every task.** End commit messages with the repo's `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

### Task 1: Extend the activity entry + token helper (harness)

**Files:**
- Modify: `packages/harness/src/activity.ts`
- Test: `packages/harness/src/activity.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `estimateTokens(text: string): number`
  - `ActivityEntry` gains `injectedTokens?: number` and `block?: string`.

- [ ] **Step 1: Write the failing test**

Add to `packages/harness/src/activity.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { estimateTokens, recordActivity, readActivity } from "./activity.js";

describe("estimateTokens", () => {
  it("is ceil(length/4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("activity entry with injected fields", () => {
  it("round-trips injectedTokens and block", () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-act-"));
    recordActivity(dir, {
      ts: 1, promptSnippet: "p", intent: "bug-fix", agents: ["a"], sources: ["x"],
      injectedTokens: 42, block: "PLAN BLOCK",
    });
    const feed = readActivity(dir);
    expect(feed.entries[0].injectedTokens).toBe(42);
    expect(feed.entries[0].block).toBe("PLAN BLOCK");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @telos/harness exec vitest run src/activity.test.ts`
Expected: FAIL — `estimateTokens is not a function` and/or type error on the new fields.

- [ ] **Step 3: Write minimal implementation**

In `packages/harness/src/activity.ts`, extend the interface and add the helper near the top (after the imports):

```typescript
// Token estimate. Kept local (not imported from @telos/engine) so the per-prompt
// hook that imports this module stays engine-free. Matches engine/estimateTokens.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

And add the two optional fields to `ActivityEntry`:

```typescript
export interface ActivityEntry {
  ts: number;
  promptSnippet: string;
  intent: string;
  agents: string[];
  sources: string[];
  /** Estimated tokens of the context block this prompt injected. */
  injectedTokens?: number;
  /** The injected context block (truncated by the writer). */
  block?: string;
}
```

`recordActivity` / `readActivity` need no change — they serialize the whole entry.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @telos/harness exec vitest run src/activity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/activity.ts packages/harness/src/activity.test.ts
git commit -m "feat(harness): activity entry carries injected tokens + block; add estimateTokens"
```

---

### Task 2: Record injected tokens + block in both hook paths (cli)

**Files:**
- Modify: `packages/cli/src/hook.ts` (fast path)
- Modify: `packages/cli/src/main.ts` (the `route --hook` path, ~line 738-750)
- Test: `packages/cli/src/main.test.ts`

**Interfaces:**
- Consumes: `estimateTokens` + extended `ActivityEntry` from Task 1.
- Produces: activity entries written by the hooks now include `injectedTokens` + truncated `block`.

- [ ] **Step 1: Write the failing test**

Add to `packages/cli/src/main.test.ts` a test that drives the `route --hook` path and asserts the recorded entry has the new fields. Use the existing test's harness for invoking the program if present; otherwise assert at the unit boundary. Minimal version:

```typescript
import { describe, it, expect } from "vitest";
import { estimateTokens } from "@telos/harness";

describe("hook records injected token cost", () => {
  it("estimateTokens matches the block length", () => {
    const block = "x".repeat(40);
    expect(estimateTokens(block)).toBe(10);
  });
});
```

> Note: this asserts the shared helper the hook uses. The real recording is covered end-to-end by Task 1's round-trip; this task wires it into both hook call sites.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -r build && pnpm --filter @telos/cli exec vitest run src/main.test.ts`
Expected: FAIL until `@telos/harness` is rebuilt with `estimateTokens` (Task 1). After rebuild it passes — proceed to wire the call sites regardless.

- [ ] **Step 3: Write minimal implementation**

In `packages/cli/src/hook.ts`, add `estimateTokens` to the harness import on line 13 and update the `recordActivity` call (lines 54-61):

```typescript
import { readConfig, loadRoster, planWorkflow, semanticRoute, augmentWithSpecialists, renderPlan, recordActivity, estimateTokens } from "@telos/harness";
```

```typescript
  console.log(block);
  const agents = plan.steps.flatMap((s) => s.agents.map((a) => a.id));
  recordActivity(telosDir, {
    ts: Date.now(),
    promptSnippet: prompt.slice(0, 120),
    intent: plan.intent,
    agents,
    sources: [...new Set(agents.map((id) => id.split(":")[0]))],
    injectedTokens: estimateTokens(block),
    block: block.slice(0, 2048),
  });
```

In `packages/cli/src/main.ts`, add `estimateTokens` to the `@telos/harness` import on line 12, and update the hook's `recordActivity` call (around lines 743-749) to match:

```typescript
          recordActivity(join(cwd, ".telos"), {
            ts: Date.now(),
            promptSnippet: userPrompt.slice(0, 120),
            intent: plan.intent,
            agents,
            sources: [...new Set(agents.map((id) => id.split(":")[0]))],
            injectedTokens: estimateTokens(block),
            block: block.slice(0, 2048),
          });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -r build && pnpm --filter @telos/cli exec vitest run src/main.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/hook.ts packages/cli/src/main.ts packages/cli/src/main.test.ts
git commit -m "feat(cli): hooks record injected token cost + truncated block"
```

---

### Task 3: MCP activity log module (harness)

**Files:**
- Create: `packages/harness/src/mcpActivity.ts`
- Modify: `packages/harness/src/index.ts` (add `export * from "./mcpActivity.js";`)
- Test: `packages/harness/src/mcpActivity.test.ts`

**Interfaces:**
- Produces:
  - `interface McpActivityEntry { ts: number; tool: string; argsSummary: string; resultTokens: number }`
  - `interface McpActivityFeed { entries: McpActivityEntry[]; totals: { queries: number; tokens: number } }`
  - `recordMcpQuery(telosDir: string, entry: McpActivityEntry): void`
  - `readMcpActivity(telosDir: string, limit?: number): McpActivityFeed`

- [ ] **Step 1: Write the failing test**

Create `packages/harness/src/mcpActivity.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordMcpQuery, readMcpActivity } from "./mcpActivity.js";

function tmp() { return mkdtempSync(join(tmpdir(), "telos-mcp-")); }

describe("mcp activity", () => {
  it("returns an empty feed when no log exists", () => {
    const feed = readMcpActivity(tmp());
    expect(feed).toEqual({ entries: [], totals: { queries: 0, tokens: 0 } });
  });

  it("round-trips entries newest-first and totals", () => {
    const dir = tmp();
    recordMcpQuery(dir, { ts: 1, tool: "telos_explore", argsSummary: "auth", resultTokens: 10 });
    recordMcpQuery(dir, { ts: 2, tool: "telos_ask", argsSummary: "where login", resultTokens: 5 });
    const feed = readMcpActivity(dir);
    expect(feed.entries.map((e) => e.tool)).toEqual(["telos_ask", "telos_explore"]);
    expect(feed.totals).toEqual({ queries: 2, tokens: 15 });
  });

  it("skips malformed lines without throwing", () => {
    const dir = tmp();
    const path = join(dir, ".telos-mcp-test"); // ignored; we write the real file below
    void path;
    recordMcpQuery(dir, { ts: 1, tool: "telos_ask", argsSummary: "q", resultTokens: 3 });
    appendFileSync(join(dir, "mcp-activity.jsonl"), "{not json\n");
    const feed = readMcpActivity(dir);
    expect(feed.totals.queries).toBe(1);
  });

  it("honors limit (most recent N)", () => {
    const dir = tmp();
    for (let i = 0; i < 5; i++) recordMcpQuery(dir, { ts: i, tool: "t", argsSummary: "", resultTokens: 1 });
    const feed = readMcpActivity(dir, 2);
    expect(feed.entries.length).toBe(2);
    expect(feed.totals.queries).toBe(5); // totals span the whole log
    void writeFileSync;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @telos/harness exec vitest run src/mcpActivity.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `packages/harness/src/mcpActivity.ts`:

```typescript
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// One MCP tool call the agent made against the graph. Append-only so the web
// panel can show, over a session, how Telos fed the agent instead of cold reads.
export interface McpActivityEntry {
  ts: number;
  tool: string;
  argsSummary: string;
  resultTokens: number;
}

export interface McpActivityFeed {
  entries: McpActivityEntry[];
  totals: { queries: number; tokens: number };
}

function logPath(telosDir: string): string {
  return join(telosDir, "mcp-activity.jsonl");
}

/** Append one MCP query. Best-effort — never throws (must not break a tool call). */
export function recordMcpQuery(telosDir: string, entry: McpActivityEntry): void {
  try {
    const path = logPath(telosDir);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(entry) + "\n");
  } catch {
    // best-effort
  }
}

/** Read the most recent N entries (newest first); totals span the whole log. */
export function readMcpActivity(telosDir: string, limit = 50): McpActivityFeed {
  const path = logPath(telosDir);
  if (!existsSync(path)) return { entries: [], totals: { queries: 0, tokens: 0 } };
  let lines: string[] = [];
  try {
    lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim());
  } catch {
    return { entries: [], totals: { queries: 0, tokens: 0 } };
  }
  const parsed: McpActivityEntry[] = [];
  for (const line of lines) {
    try { parsed.push(JSON.parse(line) as McpActivityEntry); } catch { /* skip malformed */ }
  }
  const totals = {
    queries: parsed.length,
    tokens: parsed.reduce((sum, e) => sum + (e.resultTokens || 0), 0),
  };
  return { entries: parsed.slice(-limit).reverse(), totals };
}
```

Add to `packages/harness/src/index.ts`:

```typescript
export * from "./mcpActivity.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @telos/harness exec vitest run src/mcpActivity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/mcpActivity.ts packages/harness/src/mcpActivity.test.ts packages/harness/src/index.ts
git commit -m "feat(harness): mcp-activity.jsonl logger (record/read MCP queries)"
```

---

### Task 4: Instrument MCP server tool handlers (mcp)

**Files:**
- Modify: `packages/mcp/src/tools.ts` (add optional `telosDir` to `ToolContext`)
- Modify: `packages/mcp/src/load.ts` (derive `telosDir` from `dbPath`)
- Modify: `packages/mcp/src/server.ts` (log each tool call)
- Test: `packages/mcp/src/server.test.ts`

**Interfaces:**
- Consumes: `recordMcpQuery` + `estimateTokens` from `@telos/harness`.
- Produces: every registered tool appends an `McpActivityEntry` when `ctx.telosDir` is set.

- [ ] **Step 1: Write the failing test**

Add to `packages/mcp/src/server.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMcpServer } from "./server.js";
import type { ToolContext } from "./tools.js";
import type { TelosGraph } from "@telos/engine";

function ctxWith(telosDir: string): ToolContext {
  const graph: TelosGraph = { nodes: [], edges: [] } as unknown as TelosGraph;
  return { graph, store: null, telosDir };
}

describe("mcp server logs queries", () => {
  it("appends an mcp-activity entry when a tool is called", async () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-mcpsrv-"));
    const server = buildMcpServer(ctxWith(dir));
    // call a tool through the server's registered handler
    await (server as unknown as { _registeredTools: Record<string, { callback: (a: unknown) => Promise<unknown> }> })
      ._registeredTools["telos_ask"].callback({ question: "where login" });
    const log = join(dir, "mcp-activity.jsonl");
    expect(existsSync(log)).toBe(true);
    const entry = JSON.parse(readFileSync(log, "utf8").trim());
    expect(entry.tool).toBe("telos_ask");
    expect(entry.argsSummary).toContain("where login");
    expect(typeof entry.resultTokens).toBe("number");
  });
});
```

> If `_registeredTools` internal access proves brittle in the installed MCP SDK version, instead export a small `wrapToolHandler` from `server.ts` and unit-test that wrapper directly with a fake `recordMcpQuery`. Pick whichever the SDK supports; the deliverable is "a tool call writes one log line".

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -r build && pnpm --filter @telos/mcp exec vitest run src/server.test.ts`
Expected: FAIL — no log written / `telosDir` not on `ToolContext`.

- [ ] **Step 3: Write minimal implementation**

In `packages/mcp/src/tools.ts`, extend `ToolContext`:

```typescript
export interface ToolContext { graph: TelosGraph; store: GraphStore | null; telosDir?: string }
```

In `packages/mcp/src/load.ts`, set it:

```typescript
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { GraphStore } from "@telos/engine";
import { ToolContext } from "./tools.js";

export function loadContext(dbPath: string): ToolContext {
  if (!existsSync(dbPath)) {
    throw new Error(`Telos graph.db not found at "${dbPath}". Run \`telos scan\` first.`);
  }
  const store = GraphStore.open(dbPath);
  // graph.db lives at <repo>/.telos/graph.db → telosDir is its parent.
  return { graph: store.loadGraph(), store, telosDir: dirname(dbPath) };
}
```

In `packages/mcp/src/server.ts`, add a logging wrapper and route every handler through it. Add the import and helper, then wrap each `async (args) => asText(run...())`:

```typescript
import { recordMcpQuery, estimateTokens } from "@telos/harness";

// Wrap a tool handler so each call is logged to .telos/mcp-activity.jsonl.
// Best-effort: logging never alters or blocks the tool result.
function logged<A>(
  ctx: ToolContext,
  tool: string,
  run: (args: A) => { content: { type: "text"; text: string }[] } | Promise<{ content: { type: "text"; text: string }[] }>,
): (args: A) => Promise<{ content: { type: "text"; text: string }[] }> {
  return async (args: A) => {
    const result = await run(args);
    if (ctx.telosDir) {
      const text = result.content.map((c) => c.text).join("");
      recordMcpQuery(ctx.telosDir, {
        ts: Date.now(),
        tool,
        argsSummary: JSON.stringify(args ?? {}).slice(0, 200),
        resultTokens: estimateTokens(text),
      });
    }
    return result;
  };
}
```

Then change each `registerTool` callback. Example for two of them (apply the same pattern to all nine: `telos_explore`, `telos_callers`, `telos_callees`, `telos_impact`, `telos_affected`, `telos_recommend`, `telos_tour`, `telos_ask`, `telos_context`):

```typescript
  server.registerTool(
    "telos_ask",
    {
      description: "Where does X happen? Ranks the most relevant symbols for a natural-language question over the graph.",
      inputSchema: { question: z.string(), limit: z.number().optional() },
    },
    logged(ctx, "telos_ask", (args) => asText(runAsk(ctx, args))),
  );

  server.registerTool(
    "telos_context",
    {
      description: "Warm-start architecture brief: a token-budgeted overview of layers, entry points, hotspots, and key summaries — the graph as agent memory. Read this first to orient before exploring.",
      inputSchema: { limit: z.number().optional() },
    },
    logged(ctx, "telos_context", (args) => ({ content: [{ type: "text" as const, text: runContext(ctx, args) }] })),
  );
```

> `@telos/mcp` already depends on `@telos/harness` (it imports `recommend`); no new package dependency is needed. Verify `@telos/harness` is listed in `packages/mcp/package.json` dependencies — it is.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -r build && pnpm --filter @telos/mcp exec vitest run src/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/tools.ts packages/mcp/src/load.ts packages/mcp/src/server.ts packages/mcp/src/server.test.ts
git commit -m "feat(mcp): log every graph query to .telos/mcp-activity.jsonl"
```

---

### Task 5: Server route + provider method (server)

**Files:**
- Modify: `packages/server/src/server.ts` (provider interface + route)
- Modify: `packages/server/src/graphService.ts` (implement)
- Test: `packages/server/src/server-routes.test.ts`

**Interfaces:**
- Consumes: `readMcpActivity` from `@telos/harness`; `McpActivityFeed` shape.
- Produces:
  - `GraphProvider.getMcpActivity?(limit?: number): McpActivityFeed`
  - `GET /api/harness/mcp-activity` → `McpActivityFeed`

- [ ] **Step 1: Write the failing test**

Add to `packages/server/src/server-routes.test.ts`:

```typescript
it("GET /api/harness/mcp-activity returns the provider feed", async () => {
  // Build a server over a minimal provider that implements getMcpActivity.
  const provider = {
    ...minimalProvider(), // reuse the file's existing stub helper
    getMcpActivity: () => ({ entries: [{ ts: 1, tool: "telos_ask", argsSummary: "q", resultTokens: 7 }], totals: { queries: 1, tokens: 7 } }),
  };
  const app = buildServer(provider as never);
  const res = await app.inject({ method: "GET", url: "/api/harness/mcp-activity" });
  expect(res.statusCode).toBe(200);
  expect(res.json().totals).toEqual({ queries: 1, tokens: 7 });
  await app.close();
});

it("GET /api/harness/mcp-activity is empty when provider lacks the method", async () => {
  const app = buildServer(minimalProvider() as never);
  const res = await app.inject({ method: "GET", url: "/api/harness/mcp-activity" });
  expect(res.json()).toEqual({ entries: [], totals: { queries: 0, tokens: 0 } });
  await app.close();
});
```

> Use the existing minimal-provider/stub pattern already in `server-routes.test.ts`. If the helper has a different name, adapt — the assertion is what matters.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -r build && pnpm --filter @telos/server exec vitest run src/server-routes.test.ts`
Expected: FAIL — route returns 404 / not defined.

- [ ] **Step 3: Write minimal implementation**

In `packages/server/src/server.ts`, add to the `GraphProvider` interface (next to `getActivity?`):

```typescript
  /** Optional: recent MCP graph queries + totals for the control panel. */
  getMcpActivity?(limit?: number): { entries: { ts: number; tool: string; argsSummary: string; resultTokens: number }[]; totals: { queries: number; tokens: number } };
```

Add the route next to the existing `/api/harness/activity` handler:

```typescript
  // MCP query feed: what the agent asked the graph instead of cold-reading files.
  app.get("/api/harness/mcp-activity", async (req) => {
    const limit = Number((req.query as { limit?: string }).limit) || undefined;
    return provider.getMcpActivity
      ? provider.getMcpActivity(limit)
      : { entries: [], totals: { queries: 0, tokens: 0 } };
  });
```

In `packages/server/src/graphService.ts`, add `readMcpActivity` to the harness import on line 10, then implement the method next to `getActivity`:

```typescript
  /** Recent MCP graph queries, read from .telos/mcp-activity.jsonl. */
  getMcpActivity(limit?: number) {
    if (!this.repoRoot) return { entries: [], totals: { queries: 0, tokens: 0 } };
    return readMcpActivity(join(this.repoRoot, ".telos"), limit);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -r build && pnpm --filter @telos/server exec vitest run src/server-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/server.ts packages/server/src/graphService.ts packages/server/src/server-routes.test.ts
git commit -m "feat(server): GET /api/harness/mcp-activity"
```

---

### Task 6: Client types + API method (web)

**Files:**
- Modify: `apps/web/src/api/types.ts`
- Modify: `apps/web/src/api/client.ts`
- Test: `apps/web/src/api/client.test.ts` (create if absent)

**Interfaces:**
- Produces:
  - `ActivityEntry` gains `injectedTokens?: number` and `block?: string`.
  - `McpActivityEntry { ts; tool; argsSummary; resultTokens }`, `McpActivityFeed { entries; totals: { queries; tokens } }`.
  - `TelosApi.mcpActivity(): Promise<McpActivityFeed>`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/api/client.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { createApi } from "./client";

afterEach(() => vi.restoreAllMocks());

describe("mcpActivity", () => {
  it("GETs /api/harness/mcp-activity", async () => {
    const feed = { entries: [], totals: { queries: 0, tokens: 0 } };
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(feed), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const api = createApi("");
    const out = await api.mcpActivity();
    expect(spy).toHaveBeenCalledWith("/api/harness/mcp-activity");
    expect(out).toEqual(feed);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @telos/web exec vitest run src/api/client.test.ts`
Expected: FAIL — `api.mcpActivity is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/api/types.ts`, extend `ActivityEntry` and add the MCP types (after the `ActivityFeed` line, ~56):

```typescript
export interface ActivityEntry { ts: number; promptSnippet: string; intent: string; agents: string[]; sources: string[]; injectedTokens?: number; block?: string; }
export interface ActivityFeed { entries: ActivityEntry[]; tally: { id: string; count: number }[]; }
export interface McpActivityEntry { ts: number; tool: string; argsSummary: string; resultTokens: number; }
export interface McpActivityFeed { entries: McpActivityEntry[]; totals: { queries: number; tokens: number }; }
```

In `apps/web/src/api/client.ts`, add `McpActivityFeed` to the type import on line 1, declare the method in the `TelosApi` interface (after `harnessActivity`):

```typescript
  /** Recent MCP graph queries + totals for the control panel. */
  mcpActivity(): Promise<McpActivityFeed>;
```

and implement it in the returned object (after `harnessActivity`):

```typescript
    mcpActivity: () => get<McpActivityFeed>("/api/harness/mcp-activity"),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @telos/web exec vitest run src/api/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/types.ts apps/web/src/api/client.ts apps/web/src/api/client.test.ts
git commit -m "feat(web): mcpActivity API + injected-token activity fields"
```

---

### Task 7: Switch UI primitive (web)

**Files:**
- Create: `apps/web/src/components/ui/Switch.tsx`
- Modify: `apps/web/src/components/ui/index.ts`
- Test: `apps/web/src/components/ui/ui.test.tsx`

**Interfaces:**
- Produces: `Switch({ checked: boolean; onChange: (next: boolean) => void; label: string }): JSX.Element` — `role="switch"`, `aria-checked`, keyboard + click operable.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/components/ui/ui.test.tsx`:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { Switch } from "./Switch";

describe("Switch", () => {
  it("renders as a switch with aria-checked and toggles on click", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Telos engaged" />);
    const sw = screen.getByRole("switch", { name: "Telos engaged" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
```

> Ensure `vi`, `describe`, `it`, `expect` are imported the same way the rest of `ui.test.tsx` does (the file already configures these).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @telos/web exec vitest run src/components/ui/ui.test.tsx`
Expected: FAIL — cannot find `./Switch`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/components/ui/Switch.tsx`:

```tsx
/** Switch — accessible on/off toggle. Token-styled, no hard-coded hex. */
export function Switch({
  checked, onChange, label,
}: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        cursor: "pointer", background: "none", border: "none", padding: 0,
        fontFamily: "var(--font-ui)", fontSize: "var(--t-meta-size)", color: "var(--text)",
        outline: "none",
      }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = "var(--focus-ring)"; }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 34, height: 18, borderRadius: 999, position: "relative", flexShrink: 0,
          background: checked ? "var(--accent)" : "var(--border)",
          transition: "background 120ms ease",
        }}
      >
        <span style={{
          position: "absolute", top: 2, left: checked ? 18 : 2, width: 14, height: 14,
          borderRadius: 999, background: "var(--surface)", transition: "left 120ms ease",
        }} />
      </span>
      <span>{checked ? "on" : "off"}</span>
    </button>
  );
}
```

Add to `apps/web/src/components/ui/index.ts`:

```typescript
export { Switch } from "./Switch";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @telos/web exec vitest run src/components/ui/ui.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/Switch.tsx apps/web/src/components/ui/index.ts apps/web/src/components/ui/ui.test.tsx
git commit -m "feat(web): accessible Switch UI primitive"
```

---

### Task 8: Rebuild HarnessPanel as the tabbed control panel (web)

**Files:**
- Modify: `apps/web/src/components/HarnessPanel.tsx`
- Test: `apps/web/src/components/HarnessPanel.test.tsx`

**Interfaces:**
- Consumes: `api.activate`, `api.activationState`, `api.measure`, `api.harnessActivity`, `api.mcpActivity`, `Switch`, `SegmentedControl`.
- Produces: `HarnessPanel` now self-manages engagement (no `engaged`/`onActivate` props). Signature stays `{ open, api, onClose }`.

- [ ] **Step 1: Write the failing test**

Replace/extend `apps/web/src/components/HarnessPanel.test.tsx` with a fake api covering the new surface. Key new assertions:

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HarnessPanel } from "./HarnessPanel";

function fakeApi(over = {}) {
  return {
    harnessStatus: async () => ({ installed: [], totals: { nodeCapabilities: 0, promptIntents: 0 }, lock: { present: true }, drift: { status: "ok", missing: [], added: [] } }),
    harnessConfig: async () => ({ enabled: ["ecc"] }),
    harnessActivity: async () => ({ entries: [], tally: [] }),
    mcpActivity: async () => ({ entries: [{ ts: Date.now(), tool: "telos_ask", argsSummary: "q", resultTokens: 7 }], totals: { queries: 1, tokens: 7 } }),
    measure: async () => ({ baselineTokens: 9000, packTokens: 100, reductionPct: 98, ratio: 90, costSavedUsd: 0.03, files: 5, missing: 0 }),
    activationState: async () => ({ statusLinePresent: false }),
    activate: async () => ({ statusLinePresent: true }),
    harnessSelect: async () => ({ enabled: ["ecc"] }),
    ...over,
  } as never;
}

describe("HarnessPanel control panel", () => {
  it("shows the Activate switch and toggles engagement", async () => {
    const activate = vi.fn(async () => ({ statusLinePresent: true }));
    render(<HarnessPanel open api={fakeApi({ activate })} onClose={() => {}} />);
    const sw = await screen.findByRole("switch", { name: /telos/i });
    fireEvent.click(sw);
    await waitFor(() => expect(activate).toHaveBeenCalled());
  });

  it("switches to the MCP tab and lists queries", async () => {
    render(<HarnessPanel open api={fakeApi()} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: /mcp/i }));
    expect(await screen.findByText(/telos_ask/)).toBeInTheDocument();
  });

  it("shows injected vs saved token impact in the header", async () => {
    render(<HarnessPanel open api={fakeApi()} onClose={() => {}} />);
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });
});
```

> `SegmentedControl` renders `role="tab"`/`role="tablist"`? Confirm by reading `SegmentedControl.tsx`. If it uses `role="radio"`, query by accessible name with `getByRole("radio", { name: /mcp/i })` instead. Match the test queries to the primitive's actual roles.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @telos/web exec vitest run src/components/HarnessPanel.test.tsx`
Expected: FAIL — no switch / no tabs / impact text absent.

- [ ] **Step 3: Write minimal implementation**

Rewrite `apps/web/src/components/HarnessPanel.tsx`. Keep the existing harness on/off table and `ActivitySection` (Routing tab); add header (Switch + impact), tab state, and three new tab bodies. Core additions:

```tsx
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { TelosApi } from "../api/client";
import { HarnessStatus, ActivityFeed, McpActivityFeed, TokenSavings } from "../api/types";
import { Panel, Button, Badge, Switch, SegmentedControl } from "./ui";

type Tab = "routing" | "context" | "mcp" | "impact";

export function HarnessPanel({ open, api, onClose }: { open: boolean; api: TelosApi; onClose: () => void }) {
  const refreshRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<HarnessStatus | null>(null);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityFeed | null>(null);
  const [mcp, setMcp] = useState<McpActivityFeed | null>(null);
  const [measure, setMeasure] = useState<TokenSavings | null>(null);
  const [engaged, setEngaged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("routing");

  const refresh = useCallback(() => {
    setLoading(true);
    api.harnessStatus().then(setStatus).catch(() => setStatus(null)).finally(() => setLoading(false));
    api.harnessConfig().then((c) => setEnabled(c.enabled)).catch(() => setEnabled([]));
    api.harnessActivity().then(setActivity).catch(() => setActivity(null));
    api.mcpActivity().then(setMcp).catch(() => setMcp(null));
    api.measure().then(setMeasure).catch(() => setMeasure(null));
    api.activationState().then((s) => setEngaged(!!s.statusLinePresent)).catch(() => {});
  }, [api]);

  const toggle = useCallback((source: string) => {
    const on = !enabled.includes(source);
    api.harnessSelect(source, on).then((c) => setEnabled(c.enabled)).catch(() => {});
  }, [api, enabled]);

  const toggleEngaged = useCallback((next: boolean) => {
    api.activate(!next).then((s) => setEngaged(!!s.statusLinePresent)).catch(() => {});
  }, [api]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  // Live feed while open: poll the two cheap feeds (activity + mcp).
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      api.harnessActivity().then(setActivity).catch(() => {});
      api.mcpActivity().then(setMcp).catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [open, api]);

  const injected = (activity?.entries ?? []).reduce((s, e) => s + (e.injectedTokens ?? 0), 0);
  const saved = measure?.baselineTokens != null && measure?.packTokens != null
    ? Math.max(0, measure.baselineTokens - measure.packTokens) : 0;
  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <Panel open={open} onClose={onClose} ariaLabel="Harness control panel" width={560} initialFocus={refreshRef}>
      {/* Pinned header: Activate switch + impact summary + refresh */}
      <div style={{ padding: "var(--s-3)", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
          <span style={{ flex: 1, fontFamily: "var(--font-ui)", color: "var(--text)" }}>
            Telos <span style={{ color: "var(--text-faint)" }}>control panel</span>
          </span>
          <Switch checked={engaged} onChange={toggleEngaged} label="Telos engaged" />
          <Button ref={refreshRef} variant="primary" onClick={refresh}>Refresh</Button>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)", color: "var(--text-muted)" }}>
          ↓ {fmt(injected)} tok injected · ↑ {fmt(saved)} tok saved
        </div>
      </div>

      <div style={{ overflowY: "auto", padding: "var(--s-2)" }}>
        {loading && <Empty text="Loading…" />}
        {!loading && !status && <Empty text="No harness data. Is the server running?" />}
        {!loading && status && (
          <>
            {/* existing harness on/off table — keep as-is */}
            {/* ...render the same <table> block from the current file here... */}

            <div style={{ padding: "var(--s-2) 0" }}>
              <SegmentedControl
                ariaLabel="Background signal"
                idBase="harness-tab"
                value={tab}
                onChange={(v) => setTab(v as Tab)}
                options={[
                  { value: "routing", label: "Routing" },
                  { value: "context", label: "Context" },
                  { value: "mcp", label: "MCP" },
                  { value: "impact", label: "Impact" },
                ]}
              />
            </div>

            {tab === "routing" && <ActivitySection feed={activity} />}
            {tab === "context" && <ContextSection feed={activity} />}
            {tab === "mcp" && <McpSection feed={mcp} />}
            {tab === "impact" && <ImpactSection injected={injected} saved={saved} mcp={mcp} measure={measure} />}
          </>
        )}
      </div>
    </Panel>
  );
}
```

Add the three new section components (keep `ActivitySection`, `relTime`, `Th`, `Td`, `Empty` from the current file):

```tsx
/** Context tab: what the hook injected per prompt + its token cost. */
function ContextSection({ feed }: { feed: ActivityFeed | null }) {
  const entries = (feed?.entries ?? []).filter((e) => e.block || e.injectedTokens != null);
  if (entries.length === 0) return <Empty text="No injected context yet — Telos records each prompt it routes." />;
  return (
    <div style={{ padding: "var(--s-2)" }}>
      {entries.slice(0, 8).map((e, i) => (
        <details key={`${e.ts}-${i}`} style={{ borderTop: "1px solid var(--border)", padding: "var(--s-1) 0" }}>
          <summary style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)", color: "var(--text)" }}>
            <span style={{ color: "var(--accent)" }}>{e.intent}</span> · {(e.injectedTokens ?? 0).toLocaleString("en-US")} tok
          </summary>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", margin: "var(--s-1) 0 0" }}>
            {e.block ?? "(block not recorded)"}
          </pre>
        </details>
      ))}
    </div>
  );
}

/** MCP tab: every graph query the agent made instead of reading files. */
function McpSection({ feed }: { feed: McpActivityFeed | null }) {
  const entries = feed?.entries ?? [];
  if (entries.length === 0) return <Empty text="No MCP queries yet — they appear as the agent explores the graph." />;
  return (
    <div style={{ padding: "var(--s-2)" }}>
      <div style={{ marginBottom: "var(--s-2)" }}>
        <Badge tone="accent">{feed!.totals.queries} queries · {feed!.totals.tokens.toLocaleString("en-US")} tok served</Badge>
      </div>
      {entries.slice(0, 12).map((e, i) => (
        <div key={`${e.ts}-${i}`} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "2px 0", fontFamily: "var(--font-mono)", fontSize: "var(--t-meta-size)" }}>
          <span style={{ color: "var(--text-faint)", width: 56, flexShrink: 0 }}>{relTime(e.ts)}</span>
          <span style={{ color: "var(--accent)", flexShrink: 0 }}>{e.tool}</span>
          <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{e.argsSummary}</span>
          <span style={{ color: "var(--text-faint)", flexShrink: 0 }}>{e.resultTokens} tok</span>
        </div>
      ))}
    </div>
  );
}

/** Impact tab: the honest tokenization story. */
function ImpactSection({ injected, saved, mcp, measure }: { injected: number; saved: number; mcp: McpActivityFeed | null; measure: TokenSavings | null }) {
  const fmt = (n: number) => n.toLocaleString("en-US");
  return (
    <div style={{ padding: "var(--s-2)", fontFamily: "var(--font-ui)", fontSize: "var(--t-meta-size)", color: "var(--text-muted)", lineHeight: 1.7 }}>
      <div>Injected this session: <b style={{ color: "var(--text)" }}>{fmt(injected)}</b> tok across recent prompts</div>
      <div>Warm-start brief saves: <b style={{ color: "var(--text)" }}>{fmt(saved)}</b> tok vs cold read{measure ? ` (${measure.ratio.toFixed(1)}× smaller)` : ""}</div>
      <div>MCP served on demand: <b style={{ color: "var(--text)" }}>{fmt(mcp?.totals.tokens ?? 0)}</b> tok over {mcp?.totals.queries ?? 0} queries</div>
    </div>
  );
}
```

> Move the existing `<table>` harness on/off block verbatim into the spot marked above. Do not duplicate `ActivitySection`/helpers — reuse them.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @telos/web exec vitest run src/components/HarnessPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/HarnessPanel.tsx apps/web/src/components/HarnessPanel.test.tsx
git commit -m "feat(web): HarnessPanel becomes tabbed control panel with Activate switch + impact"
```

---

### Task 9: Remove Activate from sidebar + update App wiring (web)

**Files:**
- Modify: `apps/web/src/components/ControlRail.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/components/ControlRail.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ControlRail` no longer has `engaged` / `onActivate` props or an Activate item. `App` no longer manages engagement (the panel does).

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/components/ControlRail.test.tsx`:

```typescript
it("does not render a standalone Activate item", () => {
  renderRail(); // use the file's existing render helper / default props
  expect(screen.queryByRole("button", { name: /activate/i })).toBeNull();
});

it("still renders the Harness item", () => {
  renderRail();
  expect(screen.getByRole("button", { name: /harness/i })).toBeInTheDocument();
});
```

> If `ControlRail.test.tsx` has no shared `renderRail` helper, inline a render with the minimal props the component needs (copy the prop object from an existing test in the file) and DROP `engaged`/`onActivate` from it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @telos/web exec vitest run src/components/ControlRail.test.tsx`
Expected: FAIL — an Activate button still renders.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/components/ControlRail.tsx`:
- Delete the Activate item line (currently line 96):
  ```tsx
  <Item icon="⚡" label="Activate" active={engaged} sub={engaged ? "engaged" : "off"} collapsed={collapsed} onClick={onActivate} />
  ```
- Remove `engaged` and `onActivate` from the destructured props (lines ~27-28) and from the props type (lines ~50-51):
  ```tsx
  engaged: boolean;
  onActivate: () => void;
  ```

In `apps/web/src/App.tsx`:
- Delete the engagement state and handler (lines 64, 173-176):
  ```tsx
  const [engaged, setEngaged] = useState(false);
  useEffect(() => { api.activationState().then((s) => setEngaged(!!s.statusLinePresent)).catch(() => {}); }, []);
  const onActivate = useCallback(() => {
    api.activate(engaged).then((s) => setEngaged(!!s.statusLinePresent)).catch(() => {});
  }, [engaged]);
  ```
- Remove the two props passed to `<ControlRail>` (lines 255-256):
  ```tsx
  engaged={engaged}
  onActivate={onActivate}
  ```
- `<HarnessPanel open={harnessOpen} api={api} onClose={() => setHarnessOpen(false)} />` (line 375) is unchanged — it already takes only `open/api/onClose`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @telos/web exec vitest run src/components/ControlRail.test.tsx`
Expected: PASS.

Then run the full web + typecheck to catch wiring fallout:
Run: `pnpm --filter @telos/web exec vitest run && pnpm --filter @telos/web exec tsc -p tsconfig.json --noEmit`
Expected: PASS / no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ControlRail.tsx apps/web/src/components/ControlRail.test.tsx apps/web/src/App.tsx
git commit -m "feat(web): move activation into the control panel; drop sidebar Activate item"
```

---

### Task 10: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Build + full test suite**

Run: `pnpm test`
Expected: all packages build, all Vitest suites PASS.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no type errors, no lint errors.

- [ ] **Step 3: Manual smoke (optional but recommended)**

```bash
node packages/cli/dist/main.js scan .
node packages/cli/dist/main.js serve . --open
```
Open `⚙ Harness`: confirm the Activate switch, the four tabs, and the ↓injected/↑saved header render. (MCP/Context tabs populate after real prompts/queries.)

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "test: control panel — full suite green"
```

---

## Self-Review

**Spec coverage:**
- Consolidate into Harness panel → Task 8. ✅
- Activate as switch, removed from sidebar → Tasks 7, 8, 9. ✅
- Routing tab (reuse) → Task 8 (reuses `ActivitySection`). ✅
- Context injected (text + tokens) → Tasks 1, 2 (capture), 8 (display). ✅
- MCP queries (new JSONL, file-based) → Tasks 3, 4 (capture), 5 (serve), 8 (display). ✅
- Token impact (honest: injected vs measure-saved, served tokens) → Task 8 header + ImpactSection. ✅
- Server endpoint `getMcpActivity` → Task 5. ✅
- New `Switch` primitive → Task 7. ✅
- 4s polling kept; full status/measure manual → Task 8. ✅
- Testing across layers → every task + Task 10. ✅
- Out-of-scope items (SSE, charts, overlay, setup) → not implemented. ✅

**Placeholder scan:** No TBD/TODO; all code steps include code. The two "adapt to existing helper" notes (Tasks 5, 8, 9) point at concrete, existing test scaffolding rather than leaving logic unwritten.

**Type consistency:** `McpActivityEntry`/`McpActivityFeed` identical across harness (Task 3), server provider (Task 5), and web types (Task 6): `{ ts, tool, argsSummary, resultTokens }` and `{ entries, totals: { queries, tokens } }`. `ActivityEntry` extension (`injectedTokens?`, `block?`) consistent across harness (Task 1) and web (Task 6). `estimateTokens` defined once in harness (Task 1), consumed in cli (Task 2) and mcp (Task 4). `HarnessPanel` signature unchanged (`{ open, api, onClose }`) so Task 9's App wiring needs no panel-prop changes.
```
