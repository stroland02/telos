# Semantic Intent Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route prompts to workflows + agents by semantic similarity using a small local embedding model, replacing brittle keyword matching, with a keyword fallback so there is never a regression.

**Architecture:** Pure cosine scorer + cache in `@telos/harness`; the embedding model lives once in `@telos/server` behind `POST /api/route`; `telos-hook` calls the server and falls back to keyword routing when it is down.

**Tech Stack:** TypeScript ESM, Node ≥20, transformers.js (wasm, server-only), vitest.

## Global Constraints

- No multi-GB download: model + runtime ≤ ~40MB (NFR1).
- ≤ 50ms added per prompt warm; 0ms in keyword fallback (NFR2).
- Offline after first model fetch; zero per-prompt API cost (NFR3).
- Server down ⇒ behavior identical to current keyword router (NFR4/FR3).
- No native build step; pure JS + wasm (NFR5).
- transformers.js dependency scoped to `@telos/server` only. Hook stays engine-free.
- Do not touch parallel-session-owned files; do not push.

---

### Task 1: Pure cosine + semantic scorer (`@telos/harness`)

**Files:**
- Create: `packages/harness/src/semantic.ts`
- Test: `packages/harness/src/semantic.test.ts`
- Modify: `packages/harness/src/index.ts` (export)

**Interfaces:**
- Produces: `cosine(a: number[], b: number[]): number`;
  `type SemTarget = { id: string; vec: number[] }`;
  `scoreSemantic(promptVec: number[], targets: SemTarget[], opts?: { min?: number; limit?: number }): { id: string; score: number }[]`
  (sorted desc, filtered by `min` threshold default 0.25, capped at `limit` default 5).

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { cosine, scoreSemantic } from "./semantic.js";

describe("cosine", () => {
  it("is 1 for identical, 0 for orthogonal", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("returns 0 when a vector is zero-length", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("scoreSemantic", () => {
  const targets = [
    { id: "feature-build", vec: [1, 0, 0] },
    { id: "review", vec: [0, 1, 0] },
    { id: "test", vec: [0, 0, 1] },
  ];
  it("ranks the nearest target first", () => {
    const r = scoreSemantic([0.9, 0.1, 0], targets);
    expect(r[0].id).toBe("feature-build");
  });
  it("drops targets below the threshold", () => {
    const r = scoreSemantic([0, 0, 1], targets, { min: 0.5 });
    expect(r.map((x) => x.id)).toEqual(["test"]);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `pnpm --filter @telos/harness exec vitest run src/semantic.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type SemTarget = { id: string; vec: number[] };

export function scoreSemantic(
  promptVec: number[], targets: SemTarget[], opts: { min?: number; limit?: number } = {},
): { id: string; score: number }[] {
  const min = opts.min ?? 0.25, limit = opts.limit ?? 5;
  return targets
    .map((t) => ({ id: t.id, score: cosine(promptVec, t.vec) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
```

- [ ] **Step 4: Export** — add `export * from "./semantic.js";` to `packages/harness/src/index.ts`.
- [ ] **Step 5: Run tests** → PASS.
- [ ] **Step 6: Commit** — `feat(harness): pure cosine + semantic scorer`.

---

### Task 2: Target extraction + embedding cache (`@telos/harness`)

**Files:**
- Create: `packages/harness/src/routeTargets.ts`
- Test: `packages/harness/src/routeTargets.test.ts`
- Modify: `packages/harness/src/index.ts` (export)

**Interfaces:**
- Consumes: `HarnessRoster` (from `discover.ts`), `WORKFLOW_TEMPLATES` (from `workflows.ts`).
- Produces: `type RouteTarget = { id: string; kind: "template" | "capability"; text: string }`;
  `collectRouteTargets(roster, enabledSources): RouteTarget[]`;
  `targetsHash(targets: RouteTarget[]): string`;
  `type EmbeddingCache = { hash: string; dim: number; vectors: Record<string, number[]> }`;
  `readEmbeddingCache(telosDir): EmbeddingCache | null`;
  `writeEmbeddingCache(telosDir, cache): void`.

- [ ] **Step 1: Write failing tests** — assert `collectRouteTargets` yields one target per template (text = intent + trigger words) and per enabled capability (text = title + description); `targetsHash` is stable and changes when text changes; cache round-trips and `readEmbeddingCache` returns null on missing/corrupt file.

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectRouteTargets, targetsHash, readEmbeddingCache, writeEmbeddingCache } from "./routeTargets.js";

const roster = { capabilities: [{ id: "ecc:code-reviewer", kind: "agent", source: "ecc", title: "Code reviewer", description: "reviews code quality", triggers: ["review"] }], sources: [], scannedAt: 0 } as any;

describe("route targets + cache", () => {
  it("emits template + capability targets with text", () => {
    const t = collectRouteTargets(roster, ["ecc"]);
    expect(t.some((x) => x.kind === "template")).toBe(true);
    expect(t.some((x) => x.id === "ecc:code-reviewer" && /reviews code/.test(x.text))).toBe(true);
  });
  it("hash changes with content", () => {
    const a = targetsHash([{ id: "x", kind: "template", text: "one" }]);
    const b = targetsHash([{ id: "x", kind: "template", text: "two" }]);
    expect(a).not.toBe(b);
  });
  it("cache round-trips and is null on missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-emb-"));
    try {
      expect(readEmbeddingCache(dir)).toBeNull();
      writeEmbeddingCache(dir, { hash: "h", dim: 2, vectors: { x: [1, 0] } });
      expect(readEmbeddingCache(dir)!.vectors.x).toEqual([1, 0]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `collectRouteTargets` (iterate `WORKFLOW_TEMPLATES` → `{id: template, kind:"template", text: intent + triggers.join(" ")}`; iterate `roster.capabilities` filtered to `enabledSources` → `{id, kind:"capability", text: title + " " + description}`), `targetsHash` (`createHash("sha1").update(JSON.stringify(targets.map(t=>[t.id,t.text]))).digest("hex")`), and cache read/write to `.telos/route-embeddings.json` (fs + JSON, try/catch → null).
- [ ] **Step 4: Export** in `index.ts`.
- [ ] **Step 5: Run tests** → PASS.
- [ ] **Step 6: Commit** — `feat(harness): route-target extraction + embedding cache`.

---

### Task 3: Server embedding provider + `POST /api/route`

**Files:**
- Create: `packages/server/src/embeddings.ts`
- Modify: `packages/server/src/server.ts` (route), `packages/server/package.json` (dep)
- Test: `packages/server/src/route-endpoint.test.ts`

**Interfaces:**
- Produces: `interface EmbeddingProvider { embed(texts: string[]): Promise<number[][]> }`;
  `class TransformersEmbeddingProvider implements EmbeddingProvider` (lazy-loads `@xenova/transformers` `pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { quantized: true })`, mean-pools to 384-dim);
  `planRoute(prompt, roster, enabled, ctx, provider, telosDir): Promise<OrchestrationPlan>`
  (embeds prompt + uncached targets, updates cache, builds `SemTarget[]`, runs `scoreSemantic`, maps the winning template id back through `planWorkflow`/role resolution).
- Consumes: harness `collectRouteTargets`, `targetsHash`, read/writeEmbeddingCache, `scoreSemantic`, `planWorkflow`.

- [ ] **Step 1: Write failing test** with a STUB provider (no real model) so CI never downloads weights:

```ts
import { describe, it, expect } from "vitest";
import { planRoute } from "./embeddings.js";

const stub = { embed: async (t: string[]) => t.map((s) => (/review|quality/.test(s) ? [0, 1] : [1, 0])) };

describe("planRoute (stub provider)", () => {
  it("routes a review-ish prompt to a plan via semantic match", async () => {
    const roster = { capabilities: [], sources: [], scannedAt: 0 } as any;
    const plan = await planRoute("review this code for quality", roster, ["ecc"], { languages: [], layers: [], changedFiles: [] }, stub as any, null);
    expect(plan).toBeTruthy();
    expect(typeof plan.template === "string" || plan.template === null).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Add dep** — `pnpm --filter @telos/server add @xenova/transformers` (verify installed size; transformers.js core is small, model is fetched at runtime, not bundled).
- [ ] **Step 4: Implement** `embeddings.ts` (provider + `planRoute`; `planRoute` takes `telosDir: string | null` and skips cache writes when null).
- [ ] **Step 5: Add route** in `server.ts`: `app.post("/api/route", async (req) => ({ plan: await planRoute((req.body as any).prompt ?? "", roster, enabled, ctx, provider, telosDir) }))`, constructing one shared `TransformersEmbeddingProvider` at server start (lazy model load on first call).
- [ ] **Step 6: Run tests** → PASS (stub path; real model untouched).
- [ ] **Step 7: Commit** — `feat(server): resident embedding provider + POST /api/route`.

---

### Task 4: Hook client with keyword fallback (`@telos/cli`)

**Files:**
- Create: `packages/cli/src/routeClient.ts`
- Modify: `packages/cli/src/hook.ts`
- Test: `packages/cli/src/routeClient.test.ts`

**Interfaces:**
- Produces: `fetchRoutePlan(prompt: string, port: number, timeoutMs?: number): Promise<OrchestrationPlan | null>`
  (POST to `http://127.0.0.1:<port>/api/route`; returns null on timeout/error/non-200).
- `hook.ts` change: `const plan = (await fetchRoutePlan(prompt, port)) ?? planWorkflow(prompt, loadRoster({ telosDir }), enabled, ctx);`

- [ ] **Step 1: Write failing tests** — `fetchRoutePlan` returns null when nothing listens on the port (closed-port → connection refused within timeout); returns the parsed plan when a stub server responds `{ plan }` (spin up a tiny `http.createServer` on an ephemeral port in the test).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `routeClient.ts` using `fetch` with `AbortSignal.timeout(timeoutMs ?? 150)`, try/catch → null.
- [ ] **Step 4: Wire** `hook.ts` to try `fetchRoutePlan` first, fall back to `planWorkflow`. Discover the port the same way the CLI already does (reuse existing port-resolution helper; default if absent).
- [ ] **Step 5: Run tests** → PASS; also re-run `src/main.test.ts` (banner path unaffected).
- [ ] **Step 6: Commit** — `feat(cli): hook routes via server with keyword fallback`.

---

### Task 5: Precision regression + manual model verification

**Files:**
- Create: `packages/server/src/routing-precision.test.ts` (real model, guarded)

**Interfaces:** consumes `TransformersEmbeddingProvider`, `planRoute`.

- [ ] **Step 1: Write the labeled set** — prompts → expected intent, including the real misroutes: `"begin the llm phase"` ⇒ NOT `review`; `"implement all the SDLC tests"` ⇒ `test`; `"build a new dashboard feature"` ⇒ `feature-build`; `"this code is slow, optimize it"` ⇒ `perf`. Guard with `describe.skipIf(!process.env.TELOS_E2E_MODEL)` so CI without the model stays green; document running it with the model fetched.
- [ ] **Step 2: Implement** the test calling `planRoute` with a real provider; assert the winning template matches expectation.
- [ ] **Step 3: Manual verification** (document in PR/commit body): with `pnpm dev` + `telos serve` running, send the four prompts in chat and confirm the banner intent matches; confirm killing the server falls back to keyword routing with no error.
- [ ] **Step 4: Run the guarded suite locally with `TELOS_E2E_MODEL=1`** → PASS.
- [ ] **Step 5: Commit** — `test(server): semantic routing precision regression (guarded)`.

## Self-Review

- Spec coverage: FR1 (Task 3 planRoute), FR2 (Task 1 threshold), FR3 (Task 4 fallback), FR4 (Task 2 cache + hash), FR5 (renderPlan unchanged); NFR1 (Task 3 dep-size check), NFR2 (warm path / fallback), NFR4 (Task 4 test). All covered.
- No placeholders: each code step carries real code or an exact command.
- Type consistency: `EmbeddingProvider.embed`, `SemTarget`, `RouteTarget`, `EmbeddingCache` used consistently across tasks; `planRoute` signature stable between Task 3 and Task 5.
