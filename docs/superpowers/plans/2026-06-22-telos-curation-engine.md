# Telos Curation Engine (Phase 1.5b, slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure curation engine that maps a code node's graph context (layer, language, path, name signals) to a ranked list of relevant ECC/Superpowers/Headroom capabilities — turning a huge capability catalog into just-in-time, context-relevant suggestions.

**Architecture:** A new `packages/harness` package holding pure, data-driven matching logic over the existing `TelosNode` type plus a static capability catalog. No external installs, no I/O — capabilities are *optional data references* (ids), so this layer can never break the product (the drift-resilience invariant by construction). Later 1.5b slices (orchestration, `telos doctor`/`harness.lock`, capability router) build on this package.

**Tech Stack:** TypeScript (ESM, Node ≥20), `@telos/engine` (for the `TelosNode`/`Layer` types), Vitest, pnpm workspace.

## Global Constraints

- **Node ≥ 20**, TypeScript **ESM**; intra-package imports use **`.js`** specifiers.
- **pnpm workspace**; new package name **`@telos/harness`**, version `0.0.0`, `"type": "module"`.
- **Pure logic only** — no filesystem, network, or plugin-install code in this slice. Input: `TelosNode` (+ catalog); output: plain data.
- Reuse `TelosNode` and `Layer` from `@telos/engine`. Do **not** redefine them.
- A capability is an **optional reference**: the engine returns capability ids; whether an id currently resolves to an installed agent/skill is NOT this slice's concern (that is `telos doctor`, a later slice). This keeps curation crash-proof.
- Tests: **Vitest**, colocated `*.test.ts`. Run with `pnpm -C packages/harness test`.
- Matching is case-insensitive for `languages`, `pathIncludes`, `nameIncludes`.

---

### Task 1: Scaffold `@telos/harness` package

**Files:**
- Create: `packages/harness/package.json`
- Create: `packages/harness/tsconfig.json`
- Create: `packages/harness/vitest.config.ts`
- Create: `packages/harness/src/index.ts` (placeholder)

**Interfaces:**
- Produces: a buildable/testable package `@telos/harness` depending on `@telos/engine`.

- [ ] **Step 1: Create `packages/harness/package.json`**

```json
{
  "name": "@telos/harness",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@telos/engine": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/harness/tsconfig.json`** (mirrors `packages/mcp/tsconfig.json`)

```json
{ "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"] }
```

- [ ] **Step 3: Create `packages/harness/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
```

- [ ] **Step 4: Create placeholder `packages/harness/src/index.ts`**

```typescript
export const TELOS_HARNESS_READY = true;
```

- [ ] **Step 5: Install + commit**

Run: `pnpm install` (expected: links `@telos/harness` into the workspace).
```bash
git add packages/harness/package.json packages/harness/tsconfig.json packages/harness/vitest.config.ts packages/harness/src/index.ts pnpm-lock.yaml
git commit -m "chore(harness): scaffold @telos/harness package"
```

---

### Task 2: Capability types + `matchesNode` matcher

**Files:**
- Create: `packages/harness/src/capability.ts`
- Test: `packages/harness/src/capability.test.ts`

**Interfaces:**
- Produces:
  - `type CapabilitySource = "ecc" | "superpowers" | "headroom"`
  - `type CapabilityKind = "agent" | "skill"`
  - `interface CapabilityMatch { layers?: Layer[]; languages?: string[]; pathIncludes?: string[]; nameIncludes?: string[] }`
  - `interface Capability { id: string; kind: CapabilityKind; source: CapabilitySource; title: string; match: CapabilityMatch }`
  - `matchesNode(node: TelosNode, match: CapabilityMatch): boolean` — true iff EVERY *present* criterion is satisfied (AND across criterion types, OR within a criterion's list). An empty match object (no criteria) returns `false` (never match everything). `layers`: `node.layer` ∈ list. `languages`: `node.language` (lowercased) ∈ list (lowercased). `pathIncludes`: some entry is a case-insensitive substring of `node.path`. `nameIncludes`: some entry is a case-insensitive substring of `node.name` or `node.qualifiedName`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/harness/src/capability.test.ts
import { describe, it, expect } from "vitest";
import { TelosNode } from "@telos/engine";
import { matchesNode, CapabilityMatch } from "./capability.js";

function node(over: Partial<TelosNode> = {}): TelosNode {
  return {
    id: "x", kind: "function", name: "handler", qualifiedName: "app/handler",
    language: "typescript", path: "src/app/handler.ts", lineStart: 1, lineEnd: 9,
    layer: "service", fanIn: 0, fanOut: 0, lines: 9, complexity: 1, summary: null, ...over,
  };
}

describe("matchesNode", () => {
  it("matches on layer", () => {
    expect(matchesNode(node({ layer: "data" }), { layers: ["data"] })).toBe(true);
    expect(matchesNode(node({ layer: "ui" }), { layers: ["data"] })).toBe(false);
  });
  it("matches language case-insensitively", () => {
    expect(matchesNode(node({ language: "Python" }), { languages: ["python"] })).toBe(true);
  });
  it("matches path substring case-insensitively", () => {
    expect(matchesNode(node({ path: "src/Components/Button.tsx" }), { pathIncludes: [".tsx"] })).toBe(true);
    expect(matchesNode(node({ path: "src/util.ts" }), { pathIncludes: [".tsx"] })).toBe(false);
  });
  it("matches name/qualifiedName substring", () => {
    expect(matchesNode(node({ name: "verifyAuthToken" }), { nameIncludes: ["auth"] })).toBe(true);
  });
  it("requires ALL present criteria (AND)", () => {
    const m: CapabilityMatch = { languages: ["python"], pathIncludes: ["models"] };
    expect(matchesNode(node({ language: "python", path: "app/models.py" }), m)).toBe(true);
    expect(matchesNode(node({ language: "python", path: "app/views.py" }), m)).toBe(false);
  });
  it("empty match never matches", () => {
    expect(matchesNode(node(), {})).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/harness test -- capability`
Expected: FAIL — `Cannot find module './capability.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/harness/src/capability.ts
import { Layer, TelosNode } from "@telos/engine";

export type CapabilitySource = "ecc" | "superpowers" | "headroom";
export type CapabilityKind = "agent" | "skill";

export interface CapabilityMatch {
  layers?: Layer[];
  languages?: string[];
  pathIncludes?: string[];
  nameIncludes?: string[];
}

export interface Capability {
  id: string;
  kind: CapabilityKind;
  source: CapabilitySource;
  title: string;
  match: CapabilityMatch;
}

const lc = (s: string) => s.toLowerCase();
const someIncludes = (haystack: string, needles: string[]) =>
  needles.some((n) => lc(haystack).includes(lc(n)));

export function matchesNode(node: TelosNode, match: CapabilityMatch): boolean {
  const criteria: boolean[] = [];
  if (match.layers) criteria.push(match.layers.includes(node.layer));
  if (match.languages) criteria.push(match.languages.map(lc).includes(lc(node.language)));
  if (match.pathIncludes) criteria.push(someIncludes(node.path, match.pathIncludes));
  if (match.nameIncludes) {
    criteria.push(someIncludes(node.name, match.nameIncludes) || someIncludes(node.qualifiedName, match.nameIncludes));
  }
  if (criteria.length === 0) return false; // empty match never matches everything
  return criteria.every(Boolean);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/harness test -- capability`
Expected: PASS (6 assertions).

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/capability.ts packages/harness/src/capability.test.ts
git commit -m "feat(harness): capability types + matchesNode matcher"
```

---

### Task 3: `recommendFor` — rank matching capabilities by specificity

**Files:**
- Create: `packages/harness/src/recommend.ts`
- Test: `packages/harness/src/recommend.test.ts`

**Interfaces:**
- Consumes: `Capability`, `matchesNode` from `./capability.js`; `TelosNode` from `@telos/engine`.
- Produces:
  - `specificity(match: CapabilityMatch): number` — count of present criterion *types* (layers/languages/pathIncludes/nameIncludes).
  - `recommendFor(node: TelosNode, catalog: Capability[]): Capability[]` — every catalog entry whose `match` fits `node`, sorted by `specificity` descending, then `id` ascending. A more specific match outranks a generic one.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/harness/src/recommend.test.ts
import { describe, it, expect } from "vitest";
import { TelosNode } from "@telos/engine";
import { Capability } from "./capability.js";
import { recommendFor, specificity } from "./recommend.js";

function node(over: Partial<TelosNode> = {}): TelosNode {
  return {
    id: "x", kind: "function", name: "f", qualifiedName: "app/f",
    language: "python", path: "app/models.py", lineStart: 1, lineEnd: 9,
    layer: "data", fanIn: 0, fanOut: 0, lines: 9, complexity: 1, summary: null, ...over,
  };
}

const CATALOG: Capability[] = [
  { id: "ecc:python-reviewer", kind: "agent", source: "ecc", title: "Python review", match: { languages: ["python"] } },
  { id: "ecc:django-reviewer", kind: "agent", source: "ecc", title: "Django review", match: { languages: ["python"], pathIncludes: ["models", "views"] } },
  { id: "ecc:react-reviewer", kind: "agent", source: "ecc", title: "React review", match: { pathIncludes: [".tsx"] } },
];

describe("specificity", () => {
  it("counts present criterion types", () => {
    expect(specificity({ languages: ["python"] })).toBe(1);
    expect(specificity({ languages: ["python"], pathIncludes: ["models"] })).toBe(2);
  });
});

describe("recommendFor", () => {
  it("returns matches ranked most-specific first", () => {
    const ids = recommendFor(node(), CATALOG).map((c) => c.id);
    expect(ids).toEqual(["ecc:django-reviewer", "ecc:python-reviewer"]);
  });
  it("excludes non-matching capabilities", () => {
    const ids = recommendFor(node({ language: "go", path: "main.go", layer: "service" }), CATALOG).map((c) => c.id);
    expect(ids).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/harness test -- recommend`
Expected: FAIL — `Cannot find module './recommend.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/harness/src/recommend.ts
import { TelosNode } from "@telos/engine";
import { Capability, CapabilityMatch, matchesNode } from "./capability.js";

export function specificity(match: CapabilityMatch): number {
  return [match.layers, match.languages, match.pathIncludes, match.nameIncludes]
    .filter((c) => c !== undefined).length;
}

export function recommendFor(node: TelosNode, catalog: Capability[]): Capability[] {
  return catalog
    .filter((c) => matchesNode(node, c.match))
    .sort((a, b) => specificity(b.match) - specificity(a.match) || a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/harness test -- recommend`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/recommend.ts packages/harness/src/recommend.test.ts
git commit -m "feat(harness): recommendFor ranks capabilities by specificity"
```

---

### Task 4: Default catalog + `recommend(node)` convenience

**Files:**
- Create: `packages/harness/src/catalog.ts`
- Test: `packages/harness/src/catalog.test.ts`
- Modify: `packages/harness/src/index.ts` (replace placeholder with real exports)

**Interfaces:**
- Consumes: `Capability` from `./capability.js`, `recommendFor` from `./recommend.js`.
- Produces:
  - `DEFAULT_CATALOG: Capability[]` — the built-in node-context catalog (reviewers/skills keyed to code context). Every `id` uses the real ECC namespace (e.g. `ecc:react-reviewer`).
  - `recommend(node: TelosNode): Capability[]` — `recommendFor(node, DEFAULT_CATALOG)`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/harness/src/catalog.test.ts
import { describe, it, expect } from "vitest";
import { TelosNode } from "@telos/engine";
import { DEFAULT_CATALOG, recommend } from "./catalog.js";

function node(over: Partial<TelosNode> = {}): TelosNode {
  return {
    id: "x", kind: "function", name: "f", qualifiedName: "app/f",
    language: "typescript", path: "src/x.ts", lineStart: 1, lineEnd: 9,
    layer: "service", fanIn: 0, fanOut: 0, lines: 9, complexity: 1, summary: null, ...over,
  };
}

describe("DEFAULT_CATALOG", () => {
  it("every id is namespaced and every entry has a non-empty match", () => {
    for (const c of DEFAULT_CATALOG) {
      expect(c.id).toMatch(/^(ecc|superpowers|headroom):/);
      expect(Object.keys(c.match).length).toBeGreaterThan(0);
    }
  });
});

describe("recommend", () => {
  it("suggests react review for a .tsx component", () => {
    const ids = recommend(node({ path: "src/components/Button.tsx", language: "typescript" })).map((c) => c.id);
    expect(ids).toContain("ecc:react-reviewer");
  });
  it("suggests security review for an auth-named symbol", () => {
    const ids = recommend(node({ name: "validatePassword" })).map((c) => c.id);
    expect(ids).toContain("ecc:security-reviewer");
  });
  it("returns nothing surprising for a plain util", () => {
    const ids = recommend(node({ language: "go", path: "pkg/util.go", layer: "util", name: "noop" })).map((c) => c.id);
    expect(ids).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/harness test -- catalog`
Expected: FAIL — `Cannot find module './catalog.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/harness/src/catalog.ts
import { TelosNode } from "@telos/engine";
import { Capability } from "./capability.js";
import { recommendFor } from "./recommend.js";

export const DEFAULT_CATALOG: Capability[] = [
  { id: "ecc:react-reviewer", kind: "agent", source: "ecc", title: "React/JSX review", match: { pathIncludes: [".tsx", ".jsx"] } },
  { id: "ecc:typescript-reviewer", kind: "agent", source: "ecc", title: "TypeScript review", match: { languages: ["typescript", "javascript"] } },
  { id: "ecc:python-reviewer", kind: "agent", source: "ecc", title: "Python review", match: { languages: ["python"] } },
  { id: "ecc:django-reviewer", kind: "agent", source: "ecc", title: "Django review", match: { languages: ["python"], pathIncludes: ["models", "views", "urls", "migrations"] } },
  { id: "ecc:go-reviewer", kind: "agent", source: "ecc", title: "Go review", match: { languages: ["go"] } },
  { id: "ecc:rust-reviewer", kind: "agent", source: "ecc", title: "Rust review", match: { languages: ["rust"] } },
  { id: "ecc:database-reviewer", kind: "agent", source: "ecc", title: "Database/SQL review", match: { layers: ["data"] } },
  { id: "ecc:security-reviewer", kind: "agent", source: "ecc", title: "Security review", match: { nameIncludes: ["auth", "login", "password", "token", "crypto", "secret"] } },
];

export function recommend(node: TelosNode): Capability[] {
  return recommendFor(node, DEFAULT_CATALOG);
}
```

Then set `packages/harness/src/index.ts`:
```typescript
export * from "./capability.js";
export * from "./recommend.js";
export { DEFAULT_CATALOG, recommend } from "./catalog.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/harness test -- catalog`
Expected: PASS.

- [ ] **Step 5: Build to confirm types + commit**

Run: `pnpm -C packages/harness build` (expected: tsc exits 0, emits `dist/index.js`).
```bash
git add packages/harness/src/catalog.ts packages/harness/src/catalog.test.ts packages/harness/src/index.ts
git commit -m "feat(harness): default capability catalog + recommend()"
```

---

### Task 5: `recommendForNodes` — dedupe across a selection

**Files:**
- Modify: `packages/harness/src/recommend.ts`
- Test: `packages/harness/src/recommend.test.ts` (append)

**Interfaces:**
- Produces:
  - `interface RankedCapability { capability: Capability; matchCount: number }`
  - `recommendForNodes(nodes: TelosNode[], catalog: Capability[]): RankedCapability[]` — union of capabilities matching ANY node, each with `matchCount` = how many of `nodes` it matched. Sorted by `matchCount` descending, then `id` ascending. Used to recommend capabilities for a whole cluster/selection (e.g. when a layer cluster is selected in the UI).

- [ ] **Step 1: Write the failing test**

```typescript
// append to packages/harness/src/recommend.test.ts
import { recommendForNodes } from "./recommend.js";

describe("recommendForNodes", () => {
  it("aggregates matches across nodes with counts", () => {
    const nodes: TelosNode[] = [
      node({ id: "1", language: "python", path: "app/models.py" }),
      node({ id: "2", language: "python", path: "app/service.py", layer: "service" }),
    ];
    const ranked = recommendForNodes(nodes, CATALOG);
    const python = ranked.find((r) => r.capability.id === "ecc:python-reviewer");
    const django = ranked.find((r) => r.capability.id === "ecc:django-reviewer");
    expect(python?.matchCount).toBe(2);   // both python files
    expect(django?.matchCount).toBe(1);   // only models.py
    // sorted by matchCount desc, so python (2) comes before django (1)
    expect(ranked[0].capability.id).toBe("ecc:python-reviewer");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/harness test -- recommend`
Expected: FAIL — `recommendForNodes is not a function`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// add to packages/harness/src/recommend.ts
export interface RankedCapability { capability: Capability; matchCount: number }

export function recommendForNodes(nodes: TelosNode[], catalog: Capability[]): RankedCapability[] {
  const counts = new Map<string, { capability: Capability; matchCount: number }>();
  for (const node of nodes) {
    for (const cap of recommendFor(node, catalog)) {
      const cur = counts.get(cap.id) ?? { capability: cap, matchCount: 0 };
      cur.matchCount += 1;
      counts.set(cap.id, cur);
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.matchCount - a.matchCount || a.capability.id.localeCompare(b.capability.id),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/harness test -- recommend`
Expected: PASS.

- [ ] **Step 5: Full package test + commit**

Run: `pnpm -C packages/harness test` (expected: all tests pass) and `pnpm -C packages/harness build` (tsc exits 0).
```bash
git add packages/harness/src/recommend.ts packages/harness/src/recommend.test.ts
git commit -m "feat(harness): recommendForNodes aggregates capabilities across a selection"
```

---

## Out of scope (own later plans, Phase 1.5b slices 2–4)

- **Orchestration** — `telos setup` installing/pinning ECC + Superpowers + Headroom via their plugin mechanisms.
- **Drift-resilience** — `telos doctor` + `.telos/harness.lock`: verify pinned plugins + that referenced capability ids still resolve; warn + degrade, never crash. (This slice's capabilities are already crash-proof *data*; doctor adds the live check.)
- **Capability router** — prompt-intent (heuristic) auto-detection; semantic version deferred to Phase 3.
- **Wiring** — surfacing recommendations in the web UI (node/cluster "Actions" affordance) and via the MCP layer (recommend-next-skill alongside `telos_explore`).

## Self-Review notes

- **Spec coverage** (against `2026-06-21-telos-agent-layer-and-harness-fusion-design.md` §4.2): the graph-context→capability table is implemented by `DEFAULT_CATALOG` + `matchesNode` + `recommendFor` (Tasks 2–4); the cluster/selection case by `recommendForNodes` (Task 5). The §4.3 drift-resilience invariant is honored by treating capabilities as pure optional data (no resolution/installation here); live drift checks are explicitly deferred to the doctor slice. Orchestration (§4.1) and the router (§4C) are out of scope above.
- **Placeholder scan:** every code step has complete code; no TBD/TODO; the catalog is concrete.
- **Type consistency:** `Capability`/`CapabilityMatch`/`CapabilitySource`/`CapabilityKind` defined once (Task 2) and reused verbatim in Tasks 3–5; `matchesNode`→`recommendFor`→`recommend`/`recommendForNodes` signatures are consistent; `RankedCapability` defined once (Task 5).
- **Constraints honored:** pure logic, ESM `.js` specifiers, reuses `@telos/engine` types, no engine/schema changes.
