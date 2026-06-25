# Telos Ultimate Harness — Graph-as-Memory + Harness Cockpit

**Date:** 2026-06-24
**Status:** Shipped 2026-06-24 — B (engine/CLI/MCP) + A (harness/CLI/server/web)
**Author:** Sebastian Roland + Claude

---

## 1. Summary

Two builds that turn Telos from "a tool with harness features" into **the
legible, token-efficient harness** — the thesis the user named: harnesses
embedded so a vibe-coder can *see* which powers are enabled, and the visual
graph used *as memory* so AI agents spend tokens on work, not re-exploration.

- **B — Graph-as-Memory context pack.** Distill the universal graph into one
  compact, token-budgeted architecture brief an agent reads *once* to start
  warm. Surfaced as `telos context` and MCP `telos_context`.
- **A — Harness Cockpit.** A single status view of installed harnesses, enabled
  capability counts, and drift — `telos harness` + a web "Harness" panel — so
  the embedding is visible during vibe-coding.

Both are additive and isolated: no change to the engine pipeline, the served
`graph.db`, or any existing command. Build order: **B first, then A.**

## 2. Build B — Graph-as-Memory context pack

### Purpose
Today an agent orients by calling several MCP tools (`explore`, `callers`, …).
The context pack collapses that into a single pre-digested brief — the literal
"visuals as memory" idea — maximizing useful tokens.

### Engine: `packages/engine/src/context.ts`

```ts
export interface ContextPackNode {
  id: string; qualifiedName: string; kind: string; layer: string;
  path: string; fanIn: number; fanOut: number; summary?: string;
}

export interface ContextPack {
  totals: { nodes: number; edges: number; files: number; languages: string[] };
  layers: { layer: string; count: number }[];      // node count per layer, desc
  entryPoints: ContextPackNode[];                   // top by fanIn (most depended-upon)
  hotspots: ContextPackNode[];                      // top by complexity (fallback fanOut)
  summaries: { qualifiedName: string; summary: string }[]; // enriched nodes, top N
}

// Pure. `limit` caps every list (default 12) so the pack is token-bounded
// regardless of repo size.
export function buildContextPack(graph: TelosGraph, opts?: { limit?: number }): ContextPack;

// Compact markdown rendering — what an agent / human reads.
export function renderContextPack(pack: ContextPack): string;
```

Rules: `files` = count of `kind === "file"` nodes; `languages` = distinct
`node.language`; `entryPoints`/`hotspots`/`summaries` each sliced to `limit`;
`summaries` includes only nodes whose `summary` is non-empty. Deterministic
ordering (stable sort by the metric then `qualifiedName`).

### CLI: `telos context [path]`
`--limit <n>` (default 12), `--json` (emit the `ContextPack` object instead of
markdown). Scans the repo (reuses `scanGraph`, non-persisting), builds + renders.

### MCP: `telos_context` tool
Registered alongside the existing 8 tools. No input (or optional `limit`).
Returns `renderContextPack(buildContextPack(graph))` as text — the agent's
warm-start brief. Reads the same in-memory graph the other MCP tools use.

## 3. Build A — Harness Cockpit

### Purpose
Make the harness embedding legible: one place showing what's installed, what's
enabled, and whether anything has drifted.

### Harness: `packages/harness/src/status.ts`

```ts
export interface HarnessSourceStatus {
  source: CapabilitySource;       // "ecc" | "superpowers" | "headroom"
  title: string;
  repo: string;
  nodeCapabilities: number;       // count in the node catalog from this source
}

export interface HarnessStatus {
  installed: HarnessSourceStatus[];                 // HARNESS_INSTALLS joined w/ catalog
  totals: { nodeCapabilities: number; promptIntents: number };
  drift: DriftReport;                               // diffLock(lock, catalog) if lock present
  lock: { present: boolean; path: string };
}

// Pure aggregate. `lock` is the parsed lock or null (absent). Reuses diffLock.
export function buildHarnessStatus(args: {
  lockPath: string;
  lock: HarnessLock | null;
  nodeCatalog: Capability[];
  promptCatalog: PromptCapability[];
  installs: HarnessInstall[];
}): HarnessStatus;
```

`nodeCapabilities` per source = `nodeCatalog.filter(c => c.source === source).length`.
When the lock is absent, `drift = { status: "ok", missing: [], added: [] }` and
`lock.present = false`.

### CLI: `telos harness`
`--json` flag. Reads `.telos/harness.lock` (if present), builds the status from
`DEFAULT_CATALOG` / `PROMPT_CATALOG` / `HARNESS_INSTALLS`, prints a compact table:
each installed harness with its capability count, the totals, and drift (or "ok").

### Server: `GET /api/harness`
Returns the `HarnessStatus` JSON (lock read from the served repo's
`.telos/harness.lock`). Additive route on the existing Fastify server.

### Web: "Harness" panel
Top-bar toggle (next to ● Live / 🔥 Hot / ▤ Procs). `client.harnessStatus()`
fetches `/api/harness`; the panel lists installed harnesses + capability counts +
drift badge. Mirrors types (no `@telos/engine`/`@telos/harness` import in the
browser bundle — consume JSON, like every other panel).

## 4. Testing

- **B engine:** `buildContextPack` on a fixture graph → correct totals, layer
  counts, top-N entryPoints by fanIn, hotspots by complexity, only-enriched
  summaries, `limit` respected; `renderContextPack` contains the headline
  numbers. CLI `--json` round-trips. MCP tool returns non-empty text.
- **A harness:** `buildHarnessStatus` → per-source counts, totals, drift from a
  lock (ok + drift cases), `lock.present` false when null. Server `/api/harness`
  returns the shape (in-memory graph fixture). Web panel renders rows from a
  stubbed `harnessStatus`.

## 5. Out of scope
- Binding the persistent `.claude/memory` files to graph nodes (future).
- Live "which capability fired" history (the per-node recommend already exists in
  the DetailPanel; the cockpit shows the *aggregate*, not a timeline).
- Headroom runtime integration beyond showing it as an installed harness.
