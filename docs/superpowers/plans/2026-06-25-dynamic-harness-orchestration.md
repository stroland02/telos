# Dynamic Harness Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Telos's two hand-typed harness catalogs with a live, product-aware, planner-in-the-loop system that scans installed plugins, composes a multi-agent workflow per prompt, injects a visible plan into the chat, and records every plan to a feed.

**Architecture:** New `discover.ts` scans `~/.claude/plugins/installed_plugins.json` → a `HarnessRoster`. `router.ts` gains description+graph scoring. `workflows.ts` holds signature templates whose roles resolve to concrete discovered agents. The `telos route --hook` path renders a rich plan block and appends to `.telos/activity.jsonl`. A server route + web panel section surface the feed.

**Tech Stack:** TypeScript ESM (Node ≥20), `.js` import specifiers, vitest, Fastify, React + framer-motion. pnpm workspace.

## Global Constraints

- Node ≥ 20; TypeScript strict; ESM with `.js` import specifiers verbatim.
- No new runtime dependencies (frontmatter parsed with a tiny in-repo parser — no `yaml` dep).
- Tests run serialized: `pnpm -r --workspace-concurrency=1 exec vitest run`.
- Rebuild a package's `dist` (tsc) before a consumer package uses it.
- `routeForHook` contract preserved: empty string on no match, enabled-sources-only, never blocks.
- Web bundle never imports node-only `@telos/*`; it mirrors types in `apps/web/src/api/types.ts`.
- Each task: commit + push to `master`; keep all workspace gates green.
- Existing `DEFAULT_CATALOG`/`PROMPT_CATALOG` retained as a curation overlay (do not delete).

---

## Shared types (locked — used across tasks)

```ts
// packages/harness/src/discover.ts
export type CapabilityKind = "agent" | "skill";
export interface DiscoveredCapability {
  id: string;            // "ecc:architect", "superpowers:brainstorming"
  kind: CapabilityKind;
  source: string;        // "ecc" | "superpowers" | "headroom" | <pluginId>
  title: string;         // frontmatter name, humanized
  description: string;
  tools?: string[];
  triggers: string[];    // derived from description, lowercased
}
export interface HarnessSourceInfo {
  source: string;
  title: string;
  state: "installed" | "available";
  version?: string;
  installPath?: string;
  counts: { agents: number; skills: number };
}
export interface HarnessRoster {
  capabilities: DiscoveredCapability[];
  sources: HarnessSourceInfo[];
  scannedAt: number;
}

// packages/harness/src/router.ts (additions)
export interface ProductContext { languages: string[]; layers: string[]; changedFiles: string[] }

// packages/harness/src/workflows.ts
export type WorkflowRole =
  | "designer" | "planner" | "tester" | "language-reviewer"
  | "security-reviewer" | "code-reviewer" | "debugger" | "perf" | "db-reviewer" | "compressor";
export interface WorkflowStep { phase: string; parallel: boolean; roles: WorkflowRole[] }
export interface WorkflowTemplate {
  id: string; title: string; intent: string; sources: string[]; triggers: string[]; steps: WorkflowStep[];
}
export interface OrchestrationPlanStep { phase: string; parallel: boolean; agents: { id: string; why: string }[] }
export interface OrchestrationPlan {
  intent: string; template: string | null; steps: OrchestrationPlanStep[]; rationale: string;
}

// activity (packages/harness/src/activity.ts)
export interface ActivityEntry { ts: number; promptSnippet: string; intent: string; agents: string[]; sources: string[] }
export interface ActivityFeed { entries: ActivityEntry[]; tally: { id: string; count: number }[] }
```

---

## H1 — Discovery scanner

### Task 1: Frontmatter parser + trigger derivation

**Files:**
- Create: `packages/harness/src/frontmatter.ts`
- Test: `packages/harness/src/frontmatter.test.ts`

**Interfaces:**
- Produces: `parseFrontmatter(text: string): { name?: string; description?: string; tools?: string[] }`,
  `deriveTriggers(description: string): string[]`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { parseFrontmatter, deriveTriggers } from "./frontmatter.js";

describe("parseFrontmatter", () => {
  it("parses name, description, and a tools array", () => {
    const md = `---\nname: architect\ndescription: System design specialist. Use PROACTIVELY when planning.\ntools: ["Read", "Grep"]\n---\nbody`;
    expect(parseFrontmatter(md)).toEqual({
      name: "architect",
      description: "System design specialist. Use PROACTIVELY when planning.",
      tools: ["Read", "Grep"],
    });
  });
  it("returns empty object when no frontmatter", () => {
    expect(parseFrontmatter("no frontmatter here")).toEqual({});
  });
});

describe("deriveTriggers", () => {
  it("extracts salient lowercased terms and drops stopwords", () => {
    const t = deriveTriggers("Security review for authentication and injection vulnerabilities");
    expect(t).toContain("security");
    expect(t).toContain("authentication");
    expect(t).toContain("injection");
    expect(t).not.toContain("and");
  });
});
```

- [ ] **Step 2: Run, verify fail** — `pnpm --filter @telos/harness exec vitest run src/frontmatter.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
const STOPWORDS = new Set(["the","and","for","when","with","that","this","use","used","using","into","your","you","are","from","not","but","all","any","via","per","its","has","have","will","can","code","review","reviewer","specialist","proactively"]);

export function parseFrontmatter(text: string): { name?: string; description?: string; tools?: string[] } {
  const m = /^---\s*\n([\s\S]*?)\n---/.exec(text);
  if (!m) return {};
  const out: { name?: string; description?: string; tools?: string[] } = {};
  for (const line of m[1].split("\n")) {
    const kv = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const [, key, raw] = kv;
    if (key === "name") out.name = strip(raw);
    else if (key === "description") out.description = strip(raw);
    else if (key === "tools") {
      const arr = /^\[(.*)\]$/.exec(raw.trim());
      if (arr) out.tools = arr[1].split(",").map((s) => strip(s.trim())).filter(Boolean);
    }
  }
  return out;
}
function strip(s: string): string { return s.replace(/^["']|["']$/g, "").trim(); }

export function deriveTriggers(description: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of description.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []) {
    if (STOPWORDS.has(w) || seen.has(w)) continue;
    seen.add(w); out.push(w);
    if (out.length >= 12) break;
  }
  return out;
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(harness): frontmatter parser + trigger derivation (H1)`.

### Task 2: `discoverHarnesses` scan + roster

**Files:**
- Create: `packages/harness/src/discover.ts`
- Test: `packages/harness/src/discover.test.ts` (with a fixture plugin tree under `packages/harness/src/__fixtures__/plugins/`)

**Interfaces:**
- Consumes: `parseFrontmatter`, `deriveTriggers` (Task 1).
- Produces: `discoverHarnesses(opts?: { pluginsDir?: string }): HarnessRoster`,
  const `KNOWN_HARNESSES: { source: string; pluginId: string; title: string }[]`.

- [ ] **Step 1: Build a fixture tree** — create
  `__fixtures__/plugins/installed_plugins.json` (maps `ecc@ecc` → installPath `__fixtures__/plugins/ecc/2.0.0`, `superpowers@claude-plugins-official` → `.../superpowers/6.0.3`, plus an unknown `foo@bar`),
  with `agents/architect.md`, `skills/brainstorming/SKILL.md`, and a `foo` plugin agent — minimal frontmatter each.

- [ ] **Step 2: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverHarnesses } from "./discover.js";

const pluginsDir = join(fileURLToPath(new URL(".", import.meta.url)), "__fixtures__", "plugins");

describe("discoverHarnesses", () => {
  const roster = discoverHarnesses({ pluginsDir });
  it("includes ecc + superpowers as installed with real counts", () => {
    const ecc = roster.sources.find((s) => s.source === "ecc")!;
    expect(ecc.state).toBe("installed");
    expect(ecc.counts.agents).toBeGreaterThanOrEqual(1);
  });
  it("surfaces headroom (known default, not installed) as available", () => {
    expect(roster.sources.find((s) => s.source === "headroom")!.state).toBe("available");
  });
  it("includes an unknown installed plugin under its own source", () => {
    expect(roster.sources.some((s) => s.source === "bar" || s.source === "foo")).toBe(true);
  });
  it("derives triggers for each capability", () => {
    expect(roster.capabilities.every((c) => Array.isArray(c.triggers))).toBe(true);
  });
});
```

- [ ] **Step 3: Run, verify fail.**

- [ ] **Step 4: Implement** `discover.ts`:
  - `KNOWN_HARNESSES = [{source:"superpowers",pluginId:"superpowers",title:"Superpowers"},{source:"ecc",pluginId:"ecc",title:"ECC"},{source:"headroom",pluginId:"headroom",title:"Headroom"}]`.
  - `pluginsDir` default `join(homedir(), ".claude", "plugins")`.
  - Read `installed_plugins.json`; for each `plugin@marketplace`, derive `pluginId = plugin`, take latest entry's `installPath`/`version`.
  - source = known mapping by pluginId else pluginId.
  - Scan `<installPath>/agents/*.md` → kind agent; `<installPath>/skills/*/SKILL.md` → kind skill. Parse frontmatter; `id = \`${source}:${name}\``; `triggers = deriveTriggers(description)`.
  - Build `sources` with counts; append any KNOWN_HARNESSES not seen as `state:"available"` with zero counts.
  - `scannedAt = Date.now()`. Use `existsSync`/`readdirSync`/`readFileSync`; guard missing dirs.

- [ ] **Step 5: Run, verify pass.**
- [ ] **Step 6: Commit** — `feat(harness): discoverHarnesses scans installed plugins into a roster (H1)`.

### Task 3: Roster cache + wire into harness status

**Files:**
- Create: `packages/harness/src/roster.ts` (cache layer)
- Modify: `packages/harness/src/status.ts` (use roster counts), `packages/harness/src/index.ts` (exports)
- Test: `packages/harness/src/roster.test.ts`

**Interfaces:**
- Produces: `loadRoster(opts?: { telosDir?: string; pluginsDir?: string; force?: boolean }): HarnessRoster`
  (reads/writes `<telosDir>/harness-roster.json`, re-scans when manifest mtime is newer than cache).

- [ ] **Step 1: Failing test** — call `loadRoster({ telosDir: tmp, pluginsDir: fixture })` twice; second call returns cached object (same `scannedAt`); `force:true` re-scans (new `scannedAt`). Use a `node:os` tmpdir.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `roster.ts`: cache path `join(telosDir, "harness-roster.json")`; if exists and `cache.scannedAt >= statSync(manifest).mtimeMs` and not `force`, return parsed cache; else `discoverHarnesses`, write cache, return. Guard all FS in try/catch → on any failure return a fresh scan (never throw on the hot path).

- [ ] **Step 4:** In `status.ts`, add optional `roster?: HarnessRoster` to `buildHarnessStatus` args; when present, `nodeCapabilities`/counts come from roster sources; keep current behavior when absent (backward compatible). Export `loadRoster`, `discoverHarnesses`, types from `index.ts`.

- [ ] **Step 5: Run harness suite, verify green** — `pnpm --filter @telos/harness exec vitest run`.
- [ ] **Step 6: Commit + push** — `feat(harness): roster cache + status wired to live counts (H1)`.

---

## H2 — Product-aware routing

### Task 4: Description + context scoring

**Files:**
- Modify: `packages/harness/src/router.ts`
- Test: `packages/harness/src/router.test.ts`

**Interfaces:**
- Consumes: `DiscoveredCapability`, `HarnessRoster` (H1), `ProductContext`.
- Produces: `scoreCapability(prompt: string, cap: DiscoveredCapability, ctx?: ProductContext): number`,
  `routeRoster(prompt: string, roster: HarnessRoster, enabledSources: string[], ctx?: ProductContext, limit?: number): { capability: DiscoveredCapability; score: number }[]`.

- [ ] **Step 1: Failing tests**

```ts
import { scoreCapability, routeRoster } from "./router.js";
// cap A description mentions "react component"; cap B "python migration".
// prompt "fix the react component" → A outranks B.
// ctx.languages=["python"] boosts B for prompt "review the migration".
```
Write two ordering assertions (A before B; context flips ranking).

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `scoreCapability`: `+2` per trigger substring hit in prompt, `+1` per shared term between prompt tokens and description tokens (deduped), `+3` if `ctx.languages`/`ctx.layers` term appears in the capability id/description. `routeRoster`: filter by `enabledSources`, score, drop zeros, sort by score desc then id, slice limit (default 3). Keep `routePrompt`/`PROMPT_CATALOG`/`routeForHook` intact.

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit + push** — `feat(harness): product-aware roster scoring (H2)`.

### Task 5: Derive ProductContext from the graph (CLI side)

**Files:**
- Create: `packages/cli/src/productContext.ts`
- Test: `packages/cli/src/productContext.test.ts`

**Interfaces:**
- Produces: `productContextFromGraph(path: string): ProductContext` — opens `.telos/graph.db` if present via the engine store, collects distinct file languages + layers; returns empty arrays when no DB. `changedFiles` left `[]` for now (YAGNI; reserved).

- [ ] **Step 1: Failing test** — on the repo root (or a scanned fixture), `languages` includes `"typescript"`; on a path with no `.telos/graph.db`, returns `{ languages: [], layers: [], changedFiles: [] }`.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** using existing engine store read API (mirror how `runMeasure`/`getContext` read nodes). Distinct `node.language` for kind `file`; distinct `node.layer`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit + push** — `feat(cli): derive ProductContext from the graph (H2)`.

---

## H3 — Workflow templates + planner

### Task 6: Templates + `planWorkflow`

**Files:**
- Create: `packages/harness/src/workflows.ts`
- Test: `packages/harness/src/workflows.test.ts`
- Modify: `packages/harness/src/index.ts` (exports)

**Interfaces:**
- Consumes: `HarnessRoster`, `ProductContext`, `routeRoster` (H2).
- Produces: `WORKFLOW_TEMPLATES`, `planWorkflow(prompt, roster, enabledSources, ctx?): OrchestrationPlan`,
  `resolveRole(role: WorkflowRole, roster: HarnessRoster, ctx?: ProductContext): DiscoveredCapability | null`.

- [ ] **Step 1: Failing tests**

```ts
// "build a new feature for the dashboard" → intent "feature-build",
//   first step roles include "designer" resolving to superpowers:brainstorming.
// "the parser keeps crashing" → intent "bugfix", step roles include "debugger".
// ctx.languages=["typescript"] → resolveRole("language-reviewer") === ecc:typescript-reviewer (if present in roster).
// prompt with no template match → template === null and steps fall back to flat routeRoster top-N.
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement templates** (triggers mined from the harnesses):
  - `feature-build` (superpowers): steps `[{design,false,[designer]},{plan,false,[planner]},{test,false,[tester]},{review,true,[language-reviewer,security-reviewer,code-reviewer]}]`, triggers `["build","create","add a feature","new feature","implement"]`.
  - `bugfix` (superpowers,ecc): `[{diagnose,false,[debugger]},{fix-review,true,[language-reviewer]},{test,false,[tester]}]`, triggers `["bug","crash","error","failing","broken","not working","regression"]`.
  - `review` (ecc): `[{review,true,[language-reviewer,security-reviewer,code-reviewer]}]`, triggers `["review","pull request","before merging"]`.
  - `perf` (ecc): `[{profile,false,[perf]},{data,false,[db-reviewer]}]`, triggers `["slow","optimize","performance","bottleneck","latency"]`.
  - `context-heavy` (headroom): `[{compress,false,[compressor]}]`, triggers `["too many tokens","compress","too long","reduce cost"]`.
  - `ROLE_RESOLVERS`: map role → preferred capability ids, e.g. `designer→superpowers:brainstorming`, `planner→superpowers:writing-plans`, `tester→superpowers:test-driven-development`, `debugger→superpowers:systematic-debugging`, `security-reviewer→ecc:security-reviewer`, `code-reviewer→ecc:code-reviewer`, `perf→ecc:performance-optimizer`, `db-reviewer→ecc:database-reviewer`, `compressor→headroom:compress`. `language-reviewer`: choose by `ctx.languages` (`typescript/javascript→ecc:typescript-reviewer`, `+.tsx→ecc:react-reviewer`, `python→ecc:python-reviewer`, `go→ecc:go-reviewer`, `rust→ecc:rust-reviewer`), default `ecc:code-reviewer`.
  - `resolveRole` returns the capability from the roster matching the preferred id whose `source` is enabled, else null (drop the role).
  - `planWorkflow`: pick the highest-trigger-scoring template among enabled sources; build `steps` by resolving roles (drop nulls; drop empty steps); `rationale` summarizes intent + product. No template → `template:null`, single step `{phase:"assist",parallel:true,agents: routeRoster(...top 3)}`, `intent:"assist"`.

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit + push** — `feat(harness): workflow templates + planWorkflow (H3)`.

---

## H4 — Rich in-chat plan injection

### Task 7: `renderPlan` + hook wiring

**Files:**
- Create: `packages/harness/src/renderPlan.ts`
- Test: `packages/harness/src/renderPlan.test.ts`
- Modify: `packages/cli/src/main.ts` (the `route --hook` path + a `route "<prompt>"` print), `packages/cli/src/main.test.ts`

**Interfaces:**
- Consumes: `OrchestrationPlan` (H3).
- Produces: `renderPlan(plan: OrchestrationPlan, product?: ProductContext): string` (empty string when plan has no agents).

- [ ] **Step 1: Failing test** for `renderPlan`: given a plan with a parallel review step, output contains `⟢ Telos`, the intent, `⇉ parallel:`, each agent id, and `dispatch`. Empty plan → `""`.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `renderPlan`:

```ts
export function renderPlan(plan: OrchestrationPlan, product?: ProductContext): string {
  const agents = plan.steps.flatMap((s) => s.agents);
  if (agents.length === 0) return "";
  const prod = product && (product.languages.length || product.layers.length)
    ? ` · product: ${product.languages.join("/") || "?"} (${product.layers.join(",") || "?"})` : "";
  const lines = [`⟢ Telos · ${plan.intent}${prod}`];
  plan.steps.forEach((s, i) => {
    if (s.agents.length === 0) return;
    const tag = s.parallel && s.agents.length > 1 ? "⇉ parallel: " : "";
    lines.push(`  ${i + 1}. ${tag}${s.agents.map((a) => a.id).join(", ")}`);
  });
  lines.push("  → dispatch these as subagents.");
  return lines.join("\n");
}
```

- [ ] **Step 4:** Wire `route --hook` in `main.ts`: load roster (`loadRoster`), enabled sources from harness config, `productContextFromGraph(cwd)`, `planWorkflow(...)`, print `renderPlan(plan, ctx)`. Preserve empty-output/no-block contract. Add a `route <prompt>` command that prints the plan for debugging. Keep the legacy `routeForHook` reachable behind a `--legacy` flag (safety).

- [ ] **Step 5:** Update `main.test.ts` — `route --hook` with a prompt yields a block containing `⟢ Telos` (or empty when sources disabled).

- [ ] **Step 6: Run cli + harness suites green; commit + push** — `feat(cli): rich in-chat orchestration plan via route --hook (H4)`.

---

## H5 — Activity recording + web feed

### Task 8: Activity log (record + read)

**Files:**
- Create: `packages/harness/src/activity.ts`
- Test: `packages/harness/src/activity.test.ts`
- Modify: `packages/cli/src/main.ts` (append on `--hook`), `packages/harness/src/index.ts`

**Interfaces:**
- Produces: `recordActivity(telosDir: string, e: ActivityEntry): void` (append JSONL),
  `readActivity(telosDir: string, limit?: number): ActivityFeed` (tail N + tally by agent id).

- [ ] **Step 1: Failing test** — `recordActivity` twice into a tmp dir, `readActivity(tmp, 10)` returns both entries newest-first and a tally counting agent ids.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — append `JSON.stringify(e) + "\n"` to `<telosDir>/activity.jsonl`; read = split lines, parse, take last N, reverse, build `tally` map sorted desc. Guard FS.
- [ ] **Step 4:** In `main.ts route --hook`, after rendering a non-empty plan, `recordActivity(telosDir, { ts: Date.now(), promptSnippet: prompt.slice(0,120), intent: plan.intent, agents: agents.map(a=>a.id), sources: unique sources })`.
- [ ] **Step 5: Run green; commit + push** — `feat(harness): activity log record + read (H5)`.

### Task 9: Server route `/api/harness/activity`

**Files:**
- Modify: `packages/server/src/graphService.ts` (add `getActivity`), `packages/server/src/server.ts` (route + provider method), `packages/server/src/server-routes.test.ts`

**Interfaces:**
- Consumes: `readActivity` (Task 8).
- Produces: `GraphProvider.getActivity?(limit: number): ActivityFeed`; route `GET /api/harness/activity?limit=` → `ActivityFeed`.

- [ ] **Step 1: Failing test** in `server-routes.test.ts` — `GET /api/harness/activity` returns 200 with `{ entries, tally }` shape (seed one entry via `recordActivity` into the test repo's `.telos`).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `getActivity(limit)` = `readActivity(join(repoRoot, ".telos"), limit)`; add optional `getActivity?` to `GraphProvider`; register route returning 200 + feed (or `{entries:[],tally:[]}` when unsupported).
- [ ] **Step 4: Run server suite green; commit + push** — `feat(server): GET /api/harness/activity (H5)`.

### Task 10: Web Activity feed in HarnessPanel

**Files:**
- Modify: `apps/web/src/api/types.ts` (mirror `ActivityEntry`/`ActivityFeed`), `apps/web/src/api/client.ts` (`activity()`), `apps/web/src/components/HarnessPanel.tsx`, `apps/web/src/components/HarnessPanel.test.tsx`

**Interfaces:**
- Consumes: `GET /api/harness/activity`.
- Produces: `TelosApi.activity(): Promise<ActivityFeed>`; an **Activity** section in `HarnessPanel` (feed list newest-first + a small "agents fired" leaderboard using `Badge`).

- [ ] **Step 1: Failing test** — render `HarnessPanel` with a mocked `activity()` returning two entries + tally; assert the panel shows an intent label and an agent id from the tally. Update the App/fetch stubs that enumerate routes (add `/api/harness/activity`).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — `client.ts` `activity()` fetches the route; `HarnessPanel` fetches on open (alongside existing refresh), renders an Activity section: each entry `intent · agents` with a relative time, plus a `Badge` row of top tally ids. Reuse existing `Panel`/`Badge` primitives; no new deps.
- [ ] **Step 4: Run web suite green; commit + push** — `feat(web): harness Activity feed + leaderboard (H5)`.

### Task 11: README + roadmap

**Files:** Modify `README.md`.
- [ ] Add a "Dynamic harness orchestration" bullet to Features and flip a roadmap line. Commit + push — `docs: dynamic harness orchestration (H5)`.

---

## Self-Review

**Spec coverage:** discovery (T1–T3) ✓; product-aware routing (T4–T5) ✓; templates+planner (T6) ✓; rich in-chat injection (T7) ✓; activity record+route+feed (T8–T10) ✓; backward-compat overlay preserved (constraints + T3/T4 keep legacy exports) ✓; CLI `route`/`harness --activity` surface (T7/T8) ✓.

**Placeholder scan:** no TBD/TODO; each code step shows real code or an exact mechanical transformation against named files.

**Type consistency:** `DiscoveredCapability`, `HarnessRoster`, `ProductContext`, `OrchestrationPlan`, `ActivityEntry`/`ActivityFeed` are defined once in the shared-types block and referenced verbatim by every task. `planWorkflow`, `routeRoster`, `resolveRole`, `renderPlan`, `loadRoster`, `recordActivity`/`readActivity` signatures match across producer/consumer tasks.
