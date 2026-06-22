# Telos Phase 3 — LlmEnricher (local OSS model) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a real LLM enricher that writes node summaries using a **local open-source model**, as a drop-in `Enricher` at the boundary the Phase 3 pipeline already defined — with graceful fallback to the deterministic heuristic when the model is unavailable.

**Architecture:** `LocalLlmEnricher implements Enricher` talks to an **OpenAI-compatible** `/chat/completions` endpoint (default Ollama `http://localhost:11434/v1`, model `qwen2.5-coder:7b`; works with LM Studio / llama.cpp-server / vLLM by changing the base URL). It depends on nothing but `fetch` (injectable for tests). The `enrich` interface is widened to allow async; `enrichGraph` becomes async with bounded concurrency. On any error (network, timeout, malformed response) the enricher falls back per-node to `heuristicEnricher`, so a run always completes — the isolation/drift-resilience invariant.

**Tech Stack:** TypeScript ESM, Vitest, fetch. No LLM SDK dependency.

## Global Constraints

- No new runtime dependency on any LLM/embedding vendor or SDK — HTTP via `fetch` only.
- Core must never hard-depend on a model being present: every LLM failure degrades to `heuristicEnricher`.
- Deterministic tests: inject a fake `fetch`; never hit a real network. No `Date.now()`/`Math.random()`.
- Defaults: base URL `http://localhost:11434/v1`, model `qwen2.5-coder:7b`. Both overridable.
- After editing engine, rebuild its dist before cli consumes it.

---

### Task A: Make the enrichment pipeline async with bounded concurrency

**Files:**
- Modify: `packages/engine/src/enrich.ts` (widen `Enricher.enrich` return type; `enrichGraph` async + concurrency)
- Modify: `packages/engine/src/enrich.test.ts` (await the async calls)
- Modify: `packages/cli/src/main.ts` (`runEnrich` awaits `enrichGraph`)

**Interfaces:**
- Produces:
  - `Enricher.enrich(node, ctx): NodeEnrichment | Promise<NodeEnrichment>`
  - `enrichGraph(graph, enricher, opts?: { concurrency?: number }): Promise<TelosGraph>` (default concurrency 8, order preserved)

- [ ] **Step 1: Update `enrich.test.ts`** — make the three existing cases `await`:

```typescript
  it("fills a deterministic structural summary for every node", async () => {
    const out = await enrichGraph(graph, heuristicEnricher);
    // ...unchanged assertions...
  });
  it("does not mutate the input graph", async () => {
    await enrichGraph(graph, heuristicEnricher);
    expect(graph.nodes.find((n) => n.id === "a")!.summary).toBeNull();
  });
  it("accepts any object implementing Enricher (LlmEnricher drop-in point)", async () => {
    const stub: Enricher = { name: "stub", enrich: () => ({ summary: "x" }) };
    const out = await enrichGraph(graph, stub);
    expect(out.nodes.every((n) => n.summary === "x")).toBe(true);
  });
```

Add a new case for async enrichers and concurrency ordering:

```typescript
  it("supports async enrichers and preserves node order", async () => {
    const asyncEnricher: Enricher = { name: "async", enrich: async (n) => ({ summary: `s:${n.id}` }) };
    const out = await enrichGraph(graph, asyncEnricher, { concurrency: 1 });
    expect(out.nodes.map((n) => n.summary)).toEqual(["s:a", "s:b"]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/engine test -- enrich.test`
Expected: FAIL (`enrichGraph(...).nodes` is undefined — it's now a Promise; and concurrency option unused).

- [ ] **Step 3: Rewrite `enrichGraph` in `enrich.ts`**

Replace the `Enricher` interface return type and the `enrichGraph` function:

```typescript
export interface Enricher {
  readonly name: string;
  enrich(node: TelosNode, ctx: EnrichContext): NodeEnrichment | Promise<NodeEnrichment>;
}

/** Returns a new graph with summaries (and any refined layers) filled. Async to
 *  support remote/LLM enrichers; bounded concurrency keeps local models sane. */
export async function enrichGraph(
  graph: TelosGraph,
  enricher: Enricher,
  opts: { concurrency?: number } = {},
): Promise<TelosGraph> {
  const concurrency = Math.max(1, opts.concurrency ?? 8);
  const nodes = [...graph.nodes];
  const out: TelosNode[] = new Array(nodes.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= nodes.length) return;
      const node = nodes[i];
      const ctx: EnrichContext = { graph, callers: callersOf(graph, node.id), callees: calleesOf(graph, node.id) };
      const e = await enricher.enrich(node, ctx);
      out[i] = { ...node, summary: e.summary, layer: e.layer ?? node.layer };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, nodes.length) }, worker));
  return { nodes: out, edges: graph.edges };
}
```

- [ ] **Step 4: Fix the `runEnrich` caller in `packages/cli/src/main.ts`**

Change `const enriched = enrichGraph(store.loadGraph(), heuristicEnricher);` to:

```typescript
    const enriched = await enrichGraph(store.loadGraph(), heuristicEnricher);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm -C packages/engine test -- enrich.test`
Expected: PASS (4 tests). Then `pnpm -C packages/engine build`.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/enrich.ts packages/engine/src/enrich.test.ts packages/cli/src/main.ts
git commit -m "refactor(engine): async enrichGraph with bounded concurrency (LLM-ready)"
```

---

### Task B: LocalLlmEnricher (OpenAI-compatible, graceful fallback)

**Files:**
- Create: `packages/engine/src/enrichers/llm.ts`
- Create: `packages/engine/src/enrichers/llm.test.ts`
- Modify: `packages/engine/src/index.ts` (export)

**Interfaces:**
- Consumes: `Enricher`, `EnrichContext`, `heuristicEnricher`.
- Produces:
  - `interface LlmConfig { baseUrl?: string; model?: string; apiKey?: string; timeoutMs?: number; fallback?: Enricher; fetchImpl?: typeof fetch }`
  - `function createLlmEnricher(config?: LlmConfig): Enricher` (name `"llm"`)
  - `const DEFAULT_LLM = { baseUrl: "http://localhost:11434/v1", model: "qwen2.5-coder:7b" }`

- [ ] **Step 1: Write the failing test** — `packages/engine/src/enrichers/llm.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { TelosNode } from "../schema.js";
import { EnrichContext } from "../enrich.js";
import { createLlmEnricher, DEFAULT_LLM } from "./llm.js";

const node: TelosNode = {
  id: "a", kind: "function", name: "authenticate", qualifiedName: "auth.authenticate",
  language: "ts", path: "auth.ts", lineStart: 1, lineEnd: 9, layer: "api",
  fanIn: 3, fanOut: 1, lines: 9, complexity: 2, summary: null,
};
const ctx: EnrichContext = { graph: { nodes: [node], edges: [] }, callers: [], callees: [] };

function okResponse(text: string) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }] }) } as Response;
}

describe("createLlmEnricher", () => {
  it("posts an OpenAI-compatible chat request and returns the model's summary", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse("Authenticates a user and returns a token."));
    const enricher = createLlmEnricher({ fetchImpl, model: "qwen2.5-coder:7b" });
    const out = await enricher.enrich(node, ctx);
    expect(out.summary).toBe("Authenticates a user and returns a token.");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${DEFAULT_LLM.baseUrl}/chat/completions`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("qwen2.5-coder:7b");
    expect(JSON.stringify(body.messages)).toContain("authenticate");
  });

  it("falls back to the heuristic summary when the model call fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const enricher = createLlmEnricher({ fetchImpl });
    const out = await enricher.enrich(node, ctx);
    expect(out.summary).toContain("authenticate"); // heuristic structural summary
    expect(out.summary).toContain("called by 3");
  });

  it("falls back when the response is malformed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response);
    const out = await createLlmEnricher({ fetchImpl }).enrich(node, ctx);
    expect(out.summary).toContain("authenticate");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/engine test -- llm.test`
Expected: FAIL (cannot find `./llm.js`).

- [ ] **Step 3: Write `packages/engine/src/enrichers/llm.ts`**

```typescript
import { Enricher, EnrichContext } from "../enrich.js";
import { TelosNode } from "../schema.js";
import { heuristicEnricher } from "./heuristic.js";

export interface LlmConfig {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  fallback?: Enricher;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_LLM = { baseUrl: "http://localhost:11434/v1", model: "qwen2.5-coder:7b" };

const SYSTEM =
  "You document code. Given a symbol and its context, reply with ONE concise sentence " +
  "(<= 20 words) describing what it does. No preamble, no markdown, no quotes.";

function userPrompt(node: TelosNode, ctx: EnrichContext): string {
  const callers = ctx.callers.slice(0, 5).map((n) => n.name).join(", ") || "none";
  const callees = ctx.callees.slice(0, 5).map((n) => n.name).join(", ") || "none";
  return [
    `${node.kind} ${node.qualifiedName} (${node.language}, ${node.layer} layer)`,
    `file: ${node.path}, lines ${node.lineStart}-${node.lineEnd}`,
    `callers: ${callers}`,
    `callees: ${callees}`,
    "Describe what it does in one sentence.",
  ].join("\n");
}

/** OpenAI-compatible local LLM enricher. Falls back to the heuristic on any error. */
export function createLlmEnricher(config: LlmConfig = {}): Enricher {
  const baseUrl = config.baseUrl ?? DEFAULT_LLM.baseUrl;
  const model = config.model ?? DEFAULT_LLM.model;
  const fallback = config.fallback ?? heuristicEnricher;
  const doFetch = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 30_000;

  return {
    name: "llm",
    async enrich(node, ctx) {
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        let res: Response;
        try {
          res = await doFetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
            },
            body: JSON.stringify({
              model,
              temperature: 0.1,
              messages: [
                { role: "system", content: SYSTEM },
                { role: "user", content: userPrompt(node, ctx) },
              ],
            }),
            signal: ac.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) throw new Error(`LLM ${res.status}`);
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error("empty completion");
        return { summary: text };
      } catch {
        return fallback.enrich(node, ctx);
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/engine test -- llm.test`
Expected: PASS (3 tests).

- [ ] **Step 5: Export from `index.ts`**

Add after the heuristic export:

```typescript
export { createLlmEnricher, DEFAULT_LLM } from "./enrichers/llm.js";
```

- [ ] **Step 6: Run full engine suite + build**

Run: `pnpm -C packages/engine test && pnpm -C packages/engine build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/enrichers/llm.ts packages/engine/src/enrichers/llm.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): LocalLlmEnricher — OpenAI-compatible local model with heuristic fallback"
```

---

### Task C: CLI `--llm` wiring

**Files:**
- Modify: `packages/cli/src/main.ts` (`enrich` command flags + enricher selection)
- Modify: `packages/cli/src/main.test.ts` (assert flags parse / enricher selection helper)

**Interfaces:**
- Consumes: `createLlmEnricher`, `heuristicEnricher`, `enrichGraph` from `@telos/engine`.
- Produces: `runEnrich(path, opts?: { llm?: boolean; model?: string; baseUrl?: string; concurrency?: number })`.

- [ ] **Step 1: Update the failing CLI test** — extend `runEnrich` test in `main.test.ts`:

```typescript
import { runEnrich } from "./main.js";
// ...
describe("runEnrich enricher selection", () => {
  it("uses the LLM enricher path without throwing when --llm set (falls back if no server)", async () => {
    // scan fixture first so a graph.db exists
    await runScan(repo);
    const r = await runEnrich(repo, { llm: true, concurrency: 2 });
    expect(r.enriched).toBeGreaterThan(0); // fallback guarantees completion
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/cli test -- main`
Expected: FAIL (`runEnrich` ignores opts / signature mismatch).

- [ ] **Step 3: Update `runEnrich` + `enrich` command in `main.ts`**

Add `createLlmEnricher` to the `@telos/engine` import. Replace `runEnrich`:

```typescript
export async function runEnrich(
  path: string,
  opts: { llm?: boolean; model?: string; baseUrl?: string; concurrency?: number } = {},
): Promise<{ enriched: number; dbPath: string; enricher: string }> {
  const dbPath = join(resolve(path), ".telos", "graph.db");
  if (!existsSync(dbPath)) {
    throw new Error(`No graph found at ${dbPath}. Run 'telos scan ${path}' first.`);
  }
  const enricher = opts.llm
    ? createLlmEnricher({ model: opts.model, baseUrl: opts.baseUrl })
    : heuristicEnricher;
  const store = GraphStore.open(dbPath);
  try {
    const enriched = await enrichGraph(store.loadGraph(), enricher, { concurrency: opts.concurrency });
    store.applyEnrichment(enriched.nodes.map((n) => ({ id: n.id, summary: n.summary!, layer: n.layer })));
    return { enriched: enriched.nodes.length, dbPath, enricher: enricher.name };
  } finally {
    store.close();
  }
}
```

Replace the `enrich` command registration:

```typescript
  program.command("enrich [path]").description("Fill node summaries (heuristic by default; --llm for a local model)")
    .option("--llm", "use a local OpenAI-compatible model (e.g. Ollama)", false)
    .option("--model <name>", "model id", "qwen2.5-coder:7b")
    .option("--base-url <url>", "OpenAI-compatible base URL", "http://localhost:11434/v1")
    .option("-c, --concurrency <n>", "parallel enrichment requests", "8")
    .action(async (path: string | undefined, opts: { llm: boolean; model: string; baseUrl: string; concurrency: string }) => {
      const r = await runEnrich(path ?? ".", {
        llm: opts.llm, model: opts.model, baseUrl: opts.baseUrl, concurrency: Number(opts.concurrency),
      });
      console.log(`Telos: enriched ${r.enriched} nodes via ${r.enricher} -> ${r.dbPath}`);
    });
```

- [ ] **Step 4: Run CLI tests + build**

Run: `pnpm -C packages/cli test -- main && pnpm -C packages/cli build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/main.ts packages/cli/src/main.test.ts
git commit -m "feat(cli): telos enrich --llm — local model enrichment with flags"
```

---

## Final verification

- [ ] `pnpm -r test` — all packages green.
- [ ] Smoke (no model needed — proves graceful fallback): `node packages/cli/dist/main.js scan packages/engine/fixtures/scan-sample && node packages/cli/dist/main.js enrich packages/engine/fixtures/scan-sample --llm` → completes via fallback, prints `via llm` (each node fell back to heuristic).
- [ ] Update memory: Phase 3 LlmEnricher shipped; document Ollama + qwen2.5-coder:7b default and the OpenAI-compatible swap point.
- [ ] README/usage note: to use real summaries, `ollama pull qwen2.5-coder:7b` then `telos enrich --llm`.

## Self-Review notes

- **Isolation invariant:** every LLM error path returns `fallback.enrich(...)` — a run always completes; core never hard-depends on a model. Verified by the two fallback tests + the no-server smoke test.
- **No vendor lock:** OpenAI-compatible `/chat/completions` + configurable base URL covers Ollama, LM Studio, llama.cpp-server, vLLM. Only `fetch` is used.
- **Type consistency:** `enrich` return widened to `NodeEnrichment | Promise<NodeEnrichment>`; `enrichGraph` now async everywhere (sole caller `runEnrich` awaits). `createLlmEnricher` returns the same `Enricher` type `enrichGraph` consumes.
