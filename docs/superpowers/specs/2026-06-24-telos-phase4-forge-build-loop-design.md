# Telos Forge — Slice 1: The Build Loop (Phase 4) — Design

*Status: approved design, ready for implementation plan. Date: 2026-06-24.*

## 1. Context & Thesis

Telos renders any codebase as a universal architecture graph (Phase 1), exposes
it to agents over MCP (Phase 1.5), overlays live runtime signals (Phase 2), and
enriches it with summaries (Phase 3). Phase 4 — **Telos Forge** — closes the
loop: the map becomes a surface on which software is *built*, not just read.

The §8.2 "Forge" vision is a far-horizon bundle of subsystems (bidirectional
round-trip, node scaffolding, edge authoring, intent generation). It is too
large for one spec. This document specs **only the first slice**: a **continuous
agentic build loop** where a developer expresses product intent, a bounded agent
builds it on an isolated branch, and every iteration's **graph diff** animates
the live map.

**Forge has two modes by design; this slice builds the first:**
1. **The build loop (this slice)** — agentic, intent-driven, LLM-backed, optional.
2. **Deterministic visual editing (future slice)** — manual AST refactors
   (rename/extract), no LLM. Both modes share one foundation: the graph is the
   re-derived shared state.

The loop is an **option, not the only way to build** — and, like the LLM
enricher, it is **strictly optional**: Telos core never depends on it.

### Why the loop fits Telos specifically

The agentic loop (Anthropic "Building Effective Agents"; Claude Code agent loop)
is a tight cycle: **gather context → act → verify → repeat**, until a stop
condition. It needs three things Telos already has, which is what makes "Forge as
a loop" a real product rather than "Claude Code in a box":

| Loop needs | Telos provides |
|---|---|
| Context (perceive the codebase) | Graph + MCP tools (`telos_explore`/`ask`/`recommend`) |
| Reflection (observe what changed) | Scan re-derives the graph; the map animates the diff |
| Guardrails (budget/stop) | Session cost tracking + Phase 2 live overlay |
| Capability selection | Harness curation picks agents/skills per node |

## 2. Locked Decisions

- **Scope:** thin vertical loop — prove the end-to-end experience fastest.
- **Agent backend:** a pluggable `BuildDriver` interface (mirrors the Phase 3
  `Enricher`) with one shipped adapter over **`@anthropic-ai/claude-agent-sdk`**
  (in-process TS; native `maxTurns`/`maxBudgetUsd`/permission-modes/hooks). A
  deterministic `stubDriver` is the test seam.
- **Isolation:** the loop runs on an **auto-created dedicated git branch**
  (`telos/forge/<slug>`); the working tree's base branch and the served map's
  `.telos/graph.db` are never mutated. Each iteration is a commit; the user
  reviews `git diff` and merges or discards.
- **Driving surface:** **CLI drives, map reflects** — `telos forge "<intent>"`
  runs the loop; the already-open web map animates each iteration's diff over the
  existing Phase 2 SSE channel. No web intent box in this slice.

## 3. Isolation Invariant (non-negotiable)

Identical in spirit to the Phase 2 signal guardrail and the Phase 3 enricher:

- All code writes happen **on the forge branch only**. The base branch and
  `.telos/graph.db` (the served map's source of truth) are never written.
- The map's forge overlay is **ephemeral and purely additive**: no Forge run, no
  overlay; closing/ending Forge leaves the map exactly as it was. No DB writes.
- The build driver is **optional**: missing SDK / missing API key / driver error
  ⇒ Forge exits with a clear message and a non-zero code; Telos core is
  unaffected. **No silent failures** — every exit names its cause.

## 4. Components

### 4.1 `packages/forge` (new package)

The loop orchestrator and its driver abstraction. Depends on `@telos/engine`
(scan + `diffGraphs`) and, for the default driver only, on
`@anthropic-ai/claude-agent-sdk`.

```ts
// Driver abstraction — the agent backend is swappable.
export interface BuildCheckpoint {
  turn: number;          // 1-based iteration index
  summary: string;       // short human note for this checkpoint
  costUsd: number;       // cumulative cost so far
  committed: boolean;    // whether a commit was produced this checkpoint
}

export interface BuildDriverArgs {
  intent: string;
  repoDir: string;       // absolute path to the worktree (on the forge branch)
  branch: string;        // telos/forge/<slug>
  maxTurns: number;
  maxBudgetUsd: number;
  signal: AbortSignal;   // Ctrl-C / external cancel
  onCheckpoint: (c: BuildCheckpoint) => void | Promise<void>;
}

export type BuildStop =
  | "success" | "max_turns" | "max_budget" | "cancelled" | "error";

export interface BuildResult {
  stop: BuildStop;
  turns: number;
  costUsd: number;
  message: string;       // human summary or error text
}

export interface BuildDriver {
  readonly id: string;   // "claude-agent" | "stub"
  run(args: BuildDriverArgs): Promise<BuildResult>;
}
```

- `claudeAgentDriver`: wraps `query()` from the Agent SDK with
  `allowedTools: ["Read","Edit","Write","Bash","Glob","Grep"]`, the **Telos MCP
  server attached** (so the agent can `telos_explore`/`ask` the graph),
  `permissionMode: "acceptEdits"`, `maxTurns`, `maxBudgetUsd`. It invokes
  `onCheckpoint` per turn (mapping the SDK's per-turn `AssistantMessage`/
  `ResultMessage` to `BuildCheckpoint`), and maps the SDK `ResultMessage.subtype`
  to `BuildStop` (`success`→success, `error_max_turns`→max_turns,
  `error_max_budget_usd`→max_budget, others→error).
- `stubDriver`: deterministic, no network. Writes one known file, calls
  `onCheckpoint` once, returns `{ stop: "success" }`. The seam that makes the
  whole loop testable without an LLM.
- `runForge(opts)`: the orchestrator — creates the branch, drives the driver,
  re-scans + diffs + reflects per checkpoint, commits, and returns a final
  `ForgeRunResult` (branch, commits, files touched, cost, turns, stop reason,
  test status).

### 4.2 `packages/engine` — `diffGraphs`

A pure, reusable graph diff:

```ts
export interface GraphDiff {
  added:   { nodes: string[]; edges: string[] };   // ids present only in next
  removed: { nodes: string[]; edges: string[] };   // ids present only in base
  changed: string[];                                // node ids whose signature/
                                                    // summary/lines/layer changed
}
export function diffGraphs(base: TelosGraph, next: TelosGraph): GraphDiff;
```

Keyed by stable node `id` (`qualifiedName`-derived). "Changed" compares the
fields that matter for the map — `kind`, `lineStart`, `lineEnd`, `layer`,
`summary` — so a body edit that moves line ranges or changes the summary shows as
changed. Edges are keyed by `from→to` pairs.

### 4.3 `packages/server` — forge reflection channel

Mirrors the Phase 2 ingest→SSE pattern; ephemeral, additive, no DB writes:

- `POST /v1/forge/diff` — body `{ run: string; checkpoint: BuildCheckpoint; diff: GraphDiff }`.
  Stores the latest forge state in a bounded in-memory `ForgeHub` and broadcasts
  it to subscribers.
- `GET /api/forge/stream` — SSE stream of forge checkpoints + diffs (the open map
  subscribes).
- `GET /api/forge/state` — latest forge state (for late subscribers).

`ForgeHub` is part of the optional `getTraceHub?()`-style provider extension;
minimal providers 404 (same as the trace hub).

### 4.4 `apps/web` — forge overlay

- `useForgeOverlay()` — subscribes to `/api/forge/stream`; exposes the current
  diff (`added`/`changed`/`removed` node ids) + checkpoint meta (turn, cost).
- MapView injects `_forge` render flags into node data: added → green ring,
  changed → amber ring, removed → faded. A small top-bar status (`⚒ Forge —
  turn n · $x`) shows while a run streams. Overlay clears when the stream ends.

### 4.5 `packages/cli` — `telos forge`

```
telos forge "<intent>" [--budget <usd>] [--max-turns <n>] [--driver claude-agent|stub]
                        [--url <server>] [-p, --path <repo>]
```

Creates `telos/forge/<slug>` from HEAD, runs `runForge`, POSTs each checkpoint's
diff to the server (so an open map animates), and prints a final summary: branch,
commits, files touched, cost, turns, stop reason, and how to review/merge
(`git diff <base>..telos/forge/<slug>`).

## 5. Data Flow (one run)

```
telos forge "add a /health endpoint"
  1. create branch telos/forge/add-a-health-endpoint from HEAD
  2. BuildDriver.run({ intent, repoDir, branch, maxTurns, maxBudgetUsd, signal, onCheckpoint })
       - claudeAgentDriver: agent reads graph via MCP, edits files, returns per-turn checkpoints
  3. per checkpoint: commit → re-scan worktree → diffGraphs(base, next)
       → POST /v1/forge/diff → SSE → map animates added/changed nodes
  4. stop on: success (done + optional test gate) | max_turns | max_budget | cancelled | error
  5. print summary; user reviews `git diff` and merges or discards
```

## 6. Stop Conditions & Errors

Always reported, never silent:

| Stop | Trigger | Exit |
|---|---|---|
| `success` | Driver finished; optional `--test <cmd>` gate passed | 0 |
| `max_turns` | `--max-turns` reached | non-zero, resumable note |
| `max_budget` | `--budget` (maps to `maxBudgetUsd`) reached | non-zero |
| `cancelled` | Ctrl-C (AbortSignal) | non-zero |
| `error` | Driver threw / SDK missing / no API key | non-zero, cause printed |

## 7. Testing Strategy

- **Engine** `diffGraphs`: added/changed/removed nodes and edges (changed =
  `kind`/`lineStart`/`lineEnd`/`layer`/`summary` differ); stable under unchanged
  input (empty diff); rename surfaces as removed+added (honest).
- **Forge** loop mechanics via `stubDriver`: branch created, `onCheckpoint`
  fires, re-scan+diff computed, summary returned — **no API**. Git-isolation
  test: base branch and `.telos/graph.db` untouched after a run.
- **Server**: `/v1/forge/diff` ingest + `/api/forge/stream` SSE broadcast
  (`app.inject`); minimal provider 404s.
- **Web**: `useForgeOverlay` consumes a stream; MapView applies forge classes.
- **CLI**: `telos forge --driver stub` asserts the printed summary + that the
  branch exists.
- **Claude Agent SDK adapter**: thin; smoke-tested manually end-to-end (not
  unit-tested against the live API).

## 8. Scope Boundaries (YAGNI — explicitly out of this slice)

- No web intent box (CLI drives; intent box is a later slice).
- No deterministic AST editing (the separate manual Forge mode).
- No multi-agent orchestration / evaluator panel — a single bounded loop.
- No automatic merge — the human reviews and merges.
- Reflection = whole-repo re-scan per checkpoint; **incremental re-scan** is a
  noted performance follow-up.
- No persistence of forge runs — ephemeral, like Phase 2 signals.

## 9. Future Slices (named, not specced here)

1. Deterministic visual editing (rename/extract via AST) — the manual mode.
2. Web Forge panel — in-map intent box, run/stop/iteration controls, live stream.
3. Node scaffolding / edge authoring from the canvas.
4. Evaluator-optimizer + orchestrator-workers patterns for higher-quality builds.
5. Incremental re-scan for fast reflection on large repos.

## 10. Dependencies & Risks

| Risk | Mitigation |
|---|---|
| Agent SDK is a new heavyweight dep | Confined to the default driver; `packages/forge` builds and tests pass with the `stubDriver` alone. Core never imports it. |
| API cost runaway | `--budget`→`maxBudgetUsd` hard stop; `--max-turns`; running cost printed; the research's three stop conditions are all implemented. |
| Re-scan latency per checkpoint | Acceptable for small repos in slice 1; incremental scan is a named follow-up. |
| Branch litter | Branch name is deterministic per intent slug; summary tells the user how to delete; no auto-merge. |
| Web bundle pulling node-only engine | The web overlay consumes only the JSON diff over SSE; it never imports `@telos/engine` (same rule as the process panel). |
