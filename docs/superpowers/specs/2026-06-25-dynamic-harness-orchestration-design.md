# Phase 6 — Dynamic Harness Orchestration

**Date:** 2026-06-25
**Status:** Approved (design)
**Author:** Sebastian Roland (with Claude)

## Problem

Telos's harness layer is statically wired. `packages/harness/src/catalog.ts` hard-codes
8 node-activated agents; `router.ts`'s `PROMPT_CATALOG` hard-codes 14 prompt-activated
entries. Routing is substring keyword-counting (`routePrompt`) that emits a single one-line
nudge through the `UserPromptSubmit` hook: `"Telos: for this task, use X, Y, Z."`

Consequences the user observed:

- **Static agent quantity.** The per-harness counts never change. On disk the real
  inventory is **ECC = 67 agents + 271 skills, Superpowers = 14 skills** (~350 capabilities)
  vs. the 22 hand-typed today.
- **Not product-aware.** Routing ignores what is actually being built (languages, layers,
  changed files). It cannot "fluctuate based off what the product is."
- **No real orchestration.** A prompt is never siphoned into a *multi-agent workflow*; the
  hook injects one line and stops.
- **No visible proof.** It is hard to tell, in the chat where the user works, that harnesses
  are active or making a difference, and there is no record over time.

## Goal

A live, product-aware, **planner-in-the-loop** harness system that, for each prompt:

1. Knows the *real* installed roster (dynamic, fluctuates with what's installed).
2. Picks a **multi-agent workflow** faithful to each harness's signature process.
3. Injects a **rich, visible plan** into the conversation for the host Claude to execute.
4. **Records** every plan so the web UI can prove, over time, that harnesses do real work.

## Key decisions (locked with the user)

| Decision | Choice | Why |
|---|---|---|
| Orchestration model | **Planner-in-the-loop** | Telos cannot spawn subagents itself; Claude Code (the host) does. Telos owns the brain + visible reporting; the host executes. Visibility lives *in the chat*. |
| Roster source | **Scan installed plugins** | 3 harnesses (ECC/Superpowers/Headroom) are recognized defaults; any other installed plugin is added too. Counts reflect reality, zero hand-maintenance. |
| Planner brain | **Heuristic + workflow templates** | Deterministic, instant, zero token cost. Faithful templates mined from each harness. (Internal routing seam kept clean for a future optional LLM planner.) |
| Visibility | **In-chat plan + recorded feed** | Rich hook block in the conversation *and* a live activity feed in the web Harness panel. |

## On-disk facts the design relies on

- Authoritative manifest: `~/.claude/plugins/installed_plugins.json` (v2) maps
  `plugin@marketplace` → `{ installPath, version }`.
- Agent files: `<installPath>/agents/*.md` with YAML frontmatter
  `name`, `description`, `tools` (array), `model`.
- Skill files: `<installPath>/skills/<slug>/SKILL.md` with frontmatter `name`, `description`.
- Known-default → source mapping: `superpowers → superpowers`, `ecc → ecc`,
  `headroom → headroom`. Headroom is **not currently installed** → design must support a
  default harness in `available` (not `installed`) state.
- Descriptions are rich ("Use PROACTIVELY when …") — enough routing material that
  hand-typed triggers are unnecessary.

## Architecture

Five units in `packages/harness`, plus one server route and one web panel section.

### 1. Discovery scanner — `packages/harness/src/discover.ts`

Replaces the static catalogs as the source of truth.

- `discoverHarnesses(opts): HarnessRoster` reads `installed_plugins.json` (+ optional
  project `.claude/`), resolves each install path, parses `agents/*.md` and
  `skills/*/SKILL.md` frontmatter.
- Emits `DiscoveredCapability { id, kind: "agent"|"skill", source, title, description, tools?, triggers: string[] }`.
  `triggers` are derived deterministically from the description (salient terms) so routing
  has material without hand-typing.
- The 3 known harnesses always appear with `state: "installed" | "available"`. Unknown
  installed plugins are included under `source = <pluginId>` ("whatever is installed is added").
- Result cached to `.telos/harness-roster.json`, invalidated by manifest mtime, so the hook
  never walks disk on the hot path.

The existing `DEFAULT_CATALOG` / `PROMPT_CATALOG` are retained as a thin **curation overlay**
(tuned priorities/weights layered on top of the scan), not the source of truth — so existing
consumers keep working.

### 2. Product-aware routing — extend `router.ts`

- Generalize `routePrompt` to score against each capability's **description + name** using
  deterministic term overlap (still zero-cost), not just hand-typed triggers.
- Accept optional `ProductContext { languages[], layers[], changedFiles[] }` derived from the
  Telos graph and **boost** capabilities whose hints align with the product. This is the
  "fluctuate based off what the product is" signal.

### 3. Workflow templates + planner — `packages/harness/src/workflows.ts`

Encode each harness's signature pipeline (mined faithfully from their files):

- `feature-build` (Superpowers): brainstorming → writing-plans → TDD → code-review
- `bugfix` (Superpowers + ECC): systematic-debugging → targeted language reviewer → tests
- `review` (ECC): language-reviewer ∥ security-reviewer ∥ code-reviewer (parallel)
- `perf` (ECC): performance-optimizer → database-reviewer (when a data layer exists)
- `context-heavy` (Headroom): compress → proceed

A template's steps reference a **role** (e.g. `language-reviewer`) that the planner resolves
to a *concrete* discovered agent using the product graph (a TS/React repo resolves to
`ecc:typescript-reviewer` / `ecc:react-reviewer`).

`planWorkflow(prompt, roster, ctx): OrchestrationPlan` where
`OrchestrationPlan { intent, template, steps: [{ phase, parallel: boolean, agents: [{ id, why }] }], rationale }`.
When no template matches confidently, fall back to the flat top-N routing (today's behavior).

### 4. Rich in-chat injection — upgrade `telos route --hook`

Replace the one-liner with a structured, visible block:

```
⟢ Telos · feature build · product: TypeScript/React (web,server)
  1. superpowers:brainstorming — design before code
  2. ⇉ parallel: ecc:react-reviewer, ecc:typescript-reviewer, ecc:security-reviewer
  3. ecc:code-reviewer — final gate
  → dispatch these as subagents.
```

Printed to stdout → injected as `UserPromptSubmit` context → the host Claude reads and
dispatches, and the user sees it. Restricted to currently-enabled harnesses; empty output
when nothing matches (never blocks the prompt).

### 5. Activity recording + web feed

- The hook appends each plan to `.telos/activity.jsonl` (append-only:
  `{ ts, promptSnippet, intent, agents[], sources[] }`).
- Server: `GET /api/harness/activity` (mirrors the `getMeasure` provider pattern on
  `GraphProvider`) → recent entries + an "agents fired" tally.
- Web: `HarnessPanel` gains an **Activity** section — a live feed of recent orchestrations
  plus a small leaderboard of which agents/sources fired most.

## Data flow

```
prompt typed
  → UserPromptSubmit hook (telos route --hook)
    → load cached roster (discover.ts)
    → planWorkflow(prompt, roster, productContext)
    → (a) print rich plan block to stdout  → injected into chat → host dispatches agents
    → (b) append plan to .telos/activity.jsonl
  → web Harness panel reads /api/harness/activity → live feed + leaderboard
```

## CLI surface

- `telos harness` — counts now reflect the dynamic roster; `--activity` prints recent feed.
- `telos route "<prompt>"` — prints the `OrchestrationPlan` for a prompt (debuggable; shares
  the code path with `--hook`).

## Testing

Fixture-based, deterministic:

- `discover.ts`: a fake plugin dir → roster; unknown plugin included; default-but-not-installed
  surfaces as `available`; frontmatter parse edge cases.
- routing: description-based scoring ranks correctly; product-context boost changes order.
- `workflows.ts`: template selection per intent; role resolution picks the language reviewer
  matching the product; no-match falls back to flat routing.
- hook: rich block format; activity append writes a well-formed JSONL line.
- server route + web panel: mirror existing `/api/measure` + panel test patterns.

Run serialized (`pnpm -r --workspace-concurrency=1 exec vitest run`) per repo convention.

## Phasing — five shippable slices

Each slice: commit + push to `master`, green gates across the workspace.

- **H1 — Discovery scanner.** Live roster replaces static arrays; counts reflect reality;
  curation overlay retained.
- **H2 — Product-aware routing.** Description + graph-context scoring.
- **H3 — Workflow templates + planner.** The orchestration brain.
- **H4 — Rich in-chat plan injection.** Upgrade the hook output.
- **H5 — Activity recording + web feed.** Proof over time.

## Backward compatibility

- `DEFAULT_CATALOG` / `PROMPT_CATALOG` survive as the curation overlay; `recommend`,
  `routeForHook`, and the harness status keep their signatures (extended, not broken).
- `routeForHook`'s empty-on-no-match / enabled-sources-only contract is preserved.
- The hook degrades gracefully when no roster cache and no manifest exist (emits nothing).

## Out of scope (YAGNI)

- LLM-based planning (seam kept clean; not built).
- Telos spawning its own subagent fleet via the Agent SDK (the "executor" model — deferred).
- Cross-session analytics beyond the append-only activity log.
