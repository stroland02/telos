# Telos Resolve — Scan for Resolutions (Agent Review Pass)

**Date:** 2026-06-25
**Status:** Approved (design confirmed by user)
**Author:** Sebastian Roland + Claude

---

## 1. Summary

A separate, opt-in pass that runs the **curated harness agents over the scanned
codebase to find issues and suggested resolutions**, surfaced as flags on the map.
`telos resolve [path]` reads the existing graph, routes the most important nodes
to the right review agent, runs a **read-only** review driver, and reflects
findings onto the map + a rail panel. **Find + report only** — no code changes.

Same isolation guardrail as Forge / the LLM enricher: core never depends on it,
the driver is pluggable, and with no agent backend available it no-ops with a
clear message (never fabricates findings).

## 2. Flow

1. **Read the graph** from `<repo>/.telos/graph.db` (error if not scanned).
2. **Pick targets** — rank symbol nodes by complexity then fanIn; take the top N
   (`--limit`, default 20) so the pass is bounded and hits the riskiest code first.
3. **Route each target** to a review capability using the existing
   `recommend`/router (e.g. a `*.tsx` UI node → react-reviewer; a query-heavy data
   node → database-reviewer; default → typescript/security reviewer).
4. **Run the read-only review driver** per target: a `ReviewDriver` (the Forge
   `BuildDriver` pattern, but `allowedTools` = `Read/Grep/Glob` only, never Edit)
   that asks the agent to review that node's file/region and return findings.
5. **Collect findings**, store them, and POST to the server so the map reflects.

## 3. Data model (engine)

```ts
export type Severity = "info" | "warn" | "error";
export interface Finding {
  nodeId: string;
  file: string;
  severity: Severity;
  title: string;        // short
  detail: string;       // what's wrong
  suggestion: string;   // how to resolve (text, not a diff)
  agent: string;        // which capability produced it
}
export interface ResolveState {
  findings: Finding[];
  scanned: number;      // nodes reviewed
  startedAt: number;    // ms (stamped by caller)
  done: boolean;
}
```

## 4. Driver (new `packages/resolve`, sibling of forge)

```ts
export interface ReviewDriverArgs {
  node: { id: string; qualifiedName: string; path: string; lineStart: number; lineEnd: number };
  repoDir: string; capability: string; signal: AbortSignal;
}
export interface ReviewDriver { readonly id: string; review(a: ReviewDriverArgs): Promise<Finding[]> }
```
- `stubReviewDriver` — deterministic, no-network, returns one fixed finding (test seam).
- `claudeReviewDriver` — dynamic-imports the Agent SDK (like claude-driver),
  `allowedTools: [Read, Grep, Glob]`, `permissionMode: default`, asks for findings
  as JSON; graceful error → empty findings (never throws past `runResolve`).
- `runResolve(opts)` orchestrates: scanGraph-or-load → pick targets → route →
  drive (bounded concurrency) → emit `onFinding`/`onState` → return `ResolveState`.

## 5. Surfaces

- **Server:** `POST /v1/resolve` (store + broadcast) + `GET /api/resolve/state` +
  `GET /api/resolve/stream` (SSE) — mirrors the Forge channel exactly.
- **Web:** `useResolveOverlay(api)` → MapView injects `_findingSeverity` per node
  → TelosNode shows a severity ring (error red / warn amber / info blue);
  `ResolutionsPanel` (rail entry **⚠ Resolve**) lists findings grouped by severity,
  each click opens the node + shows title/detail/suggestion.
- **CLI:** `telos resolve [path] [--driver claude|stub] [--limit] [--url]` — runs
  the pass, prints a findings summary, best-effort POSTs to a running server.

## 6. Testing
- `runResolve` with `stubReviewDriver` over a fixture graph → expected findings,
  bounded by `--limit`, `scanned` count correct.
- routing: a `.tsx` node routes to a UI reviewer; default path routes to the
  fallback reviewer (reuse/extend the router catalog).
- server `/v1/resolve` stores + streams (mirror forge.test).
- web: ResolutionsPanel renders findings from a stub; node ring reflects severity.
- `mapStop`/graceful: claude driver missing SDK → empty findings, no throw.

## 7. Out of scope
- Generating or applying fix diffs (this slice is find + report).
- Running inside `telos scan` (it's a separate `telos resolve` pass).
- Full-repo review (bounded to top-N targets; `log` what was capped).
