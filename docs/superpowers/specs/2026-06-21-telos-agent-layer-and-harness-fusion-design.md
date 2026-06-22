# Telos Phase 1.5 — Agent Layer (MCP) + Harness Fusion — Design Spec

**Date:** 2026-06-21
**Status:** Approved (design) — pending implementation plan
**Author:** Sebastian Roland + Claude (brainstorming session)
**Parent spec:** [`2026-06-19-telos-code-sentinel-design.md`](./2026-06-19-telos-code-sentinel-design.md) §8 roadmap

---

## 1. Summary

This spec inserts a new phase — **Phase 1.5** — between the shipped visual map (v1) and
the live-monitoring phase (Phase 2). It does two things, both built on the **existing
`graph.db`** with **no engine changes**:

1. **Telos for Agents (MCP layer).** Expose the universal graph as a Model Context
   Protocol server so AI coding agents (Claude Code, Cursor, Codex, Gemini) answer
   structural questions from the pre-built index instead of blindly grepping. This is the
   *measurable* cost-saving pillar — the one Telos benefit you can put a number on.
2. **Harness Fusion.** When a developer installs Telos, they also get **ECC** and
   **Superpowers** wired up and made *more practical to use*, via an **orchestrate-and-curate**
   model (not a vendored copy). Telos's graph drives **contextual recommendation** of the
   right agent/skill for the code in view, turning ECC's 271 skills + 67 agents from an
   overwhelming catalog into just-in-time help.

**Core architectural invariant (the user's guardrail):** the harness layer is **additive
and isolated**. Telos's engine, API, web UI, and MCP server have **zero hard runtime
dependency** on ECC or Superpowers. Therefore *no upstream vendor change can break the
Telos product* — at worst, the optional recommendation layer degrades gracefully.

---

## 2. Positioning — Why this matters (the three pillars)

The research compared the two closest references against Telos:

| | CodeGraph (`colbymchenry/codegraph`) | Understand-Anything (`Egonex-AI`) | **Telos** |
|---|---|---|---|
| Primary user | AI agents (no human view) | Humans (learners) | **Humans first, agents next** |
| Surface | MCP + CLI, no visualization | Graph + tours + domain view | **Polished semantic-zoom map** |
| Engine | tree-sitter + SQLite + FTS5 | tree-sitter + 6-agent LLM pipeline | **tree-sitter + SQLite + FTS5** |
| Proven value | *Measured*: 35% cheaper, 57% fewer tokens, 46% faster agent runs (7 repos) | Onboarding compression, shareable graph | Live runtime overlay (Phase 2) |
| Gap | No human view | No live runtime, no agent-cost angle | No agent surface *until this phase* |

**Telos's distinctive thesis — one universal graph, consumed three ways:**

1. **Understand** — the visual map (v1, shipped; humans).
2. **Spend less** — the MCP agent layer (this phase; the provable $ saving CodeGraph
   demonstrated, but on a product that *also* has the human map they lack).
3. **Watch it live** — OTel overlay (Phase 2) + semantic brain (Phase 3); neither
   competitor has the live dimension.

Kept ours because **no competitor combines visual-first human UX + agent-cheap context +
live runtime on one graph**, and none make the broader harness ecosystem (ECC +
Superpowers) *contextually* usable the way the Harness Fusion does.

---

## 3. Phase 1.5a — Telos for Agents (MCP layer)

### 3.1 What it is

A local MCP server that reads the existing `.telos/graph.db` and answers structural
queries in one call, so an agent spends tokens on the *answer*, not on discovery.

### 3.2 MCP tools (modeled on CodeGraph, kept minimal)

| Tool | Input | Returns | Backed by |
|---|---|---|---|
| `telos_explore` | free-text query | relevant symbols' source + call paths + impact summary in one payload | FTS5 search + graph traversal |
| `telos_callers` | symbol id/name | direct + transitive callers | `edges` where `kind=calls`, reverse |
| `telos_callees` | symbol id/name | direct + transitive callees | `edges` where `kind=calls`, forward |
| `telos_impact` | symbol id/name | blast-radius (everything transitively affected) | BFS over reverse-dependency edges |
| `telos_affected` | changed file paths | the symbols + likely tests impacted | path → nodes → impact closure |

These are **read-only projections of data the aggregator already computes** (fan-in/out,
dependency order, metrics). No new schema; no new parsing.

### 3.3 Architecture — thin adapter, reuses everything

```
agent (Claude Code / Cursor / Codex)
        │  MCP stdio
        ▼
packages/mcp/   ← NEW: small MCP server
        │  in-process query API (shared with packages/server)
        ▼
packages/engine graph store (.telos/graph.db)  ← UNCHANGED
```

The query logic is shared with the existing Fastify API (`packages/server`) so the HTTP
dashboard and the MCP server return identical results from one source of truth.

### 3.4 The "Telos skill" artifact

Like CodeGraph's `.claude/skills` and Understand-Anything's one-line installers, Telos
ships an **installable skill** that registers the MCP server and teaches an agent when to
prefer `telos_explore` over grep. This is the entry point that lets Telos "do more in the
future" — it makes Telos a context provider in the agent ecosystem, not just a viz.

### 3.5 Success criteria

- On a sample repo, an agent task answered via `telos_explore` uses **measurably fewer
  tool calls / tokens** than the grep-and-read baseline (we record a before/after on at
  least one fixture, mirroring CodeGraph's benchmark method).
- MCP server starts from `telos serve --mcp` (or a dedicated `telos mcp`) and is reachable
  by Claude Code via generated config.

---

## 4. Phase 1.5b — Harness Fusion (orchestrate + curate)

### 4.1 Model: orchestrate, don't vendor

Telos does **not** copy ECC's 67 agents + 271 skills or Superpowers' skills into its repo
(that fork would go stale against their active releases and overwhelm the user). Instead:

- **Orchestrate:** a `telos setup` step installs/links ECC + Superpowers via *their own*
  plugin mechanisms, **pinned to specific known-good versions** recorded in a lockfile.
- **Curate:** Telos adds the value layer that makes them *practical* — the graph
  recommends the right capability for the code in view.

Both upstreams are **MIT-licensed**, so orchestration + any small attribution snippet is
fully permitted; we preserve their license/attribution where we reference them.

### 4.2 The curation layer (the part that is genuinely ours)

Telos's graph already classifies code (layer, language, framework signals). The curation
layer maps that context → relevant ECC/Superpowers capabilities:

| Graph context (from `graph.db`) | Suggested capability |
|---|---|
| node `layer=data`, language Python, Django signals | `ecc:django-reviewer`, migration-safety skill |
| `.tsx` / React component nodes | `ecc:react-reviewer`, frontend skills |
| user about to start a feature | Superpowers `brainstorming` → `writing-plans` |
| user debugging | Superpowers `systematic-debugging` |
| security-sensitive node (auth/input) | `ecc:security-reviewer` |

Surfaced in the web UI (a contextual "Actions" affordance on node/cluster selection) and
via the MCP layer (an agent can ask `telos_explore` *and* get a "recommended next skill").
This is what turns 271 raw skills into just-in-time help — "easier to use" by construction.

### 4.3 Vendor-drift resilience (the explicit guardrail)

The requirement: *"identify when there is a vendor change so it does not break the
infrastructure codebase or when it's running."* Design:

1. **Version pinning + lockfile.** `telos setup` records the exact installed ECC +
   Superpowers versions (and a manifest of the specific agent/skill IDs the curation layer
   references) in `.telos/harness.lock`.
2. **`telos doctor` health check.** Run on setup and on `serve`/`mcp` startup. It verifies
   the pinned plugins are present and that every referenced agent/skill ID still resolves.
3. **Drift detection.** Compare installed versions/manifest against `harness.lock`. On a
   version bump, rename, or removed capability, emit a **clear warning** (what changed,
   what's now unavailable) — never a crash.
4. **Graceful degradation.** The curation layer treats every ECC/Superpowers capability as
   an **optional reference**. A missing/renamed capability is simply hidden from
   recommendations; the map, API, and MCP tools keep working untouched.
5. **Isolation invariant.** Telos core has **no import-time or runtime hard dependency** on
   the harness. The fusion is a feature flag-guarded enhancement layer; with the harness
   absent or broken, Telos runs exactly as it does today.

This makes the integration **fail-safe**: upstream churn can degrade the *recommendations*
but can never break the *product*.

### 4.4 Success criteria

- `telos doctor` correctly reports: harness present & matching / present but drifted
  (names the delta) / absent — and `telos serve` works in all three states.
- Simulated drift (rename a referenced skill id in the lock) produces a warning and a
  hidden recommendation, **not** an error or a broken page.

---

## 4A. Headroom — context-compression harness (3rd orchestrated harness)

[Headroom](https://github.com/chopratejas/headroom) (**Apache-2.0**) compresses tool
outputs, logs, RAG chunks, files, and conversation history *before* they reach the LLM —
*"60–95% fewer tokens, same answers."* Strategies: SmartCrusher (JSON), CodeCompressor
(AST-aware), reversible compression with `headroom_retrieve`, cross-agent memory, and
CacheAligner for provider KV-cache hits. Ships as library / proxy / CLI wrapper / **MCP
server**.

**Why it belongs here:** it is a *third harness* in the same orchestrate-and-curate family
as ECC + Superpowers, and it **compounds our cost-saving pillar** — `telos_explore`
payloads (§3) get Headroom-compressed on the way to the agent, stacking Telos's discovery
savings on top of Headroom's compression savings.

**Integration:** orchestrated (installed via its own MCP/proxy/wrapper, version-pinned in
`.telos/harness.lock`), governed by the same **drift-resilience** rules as §4.3, and
isolated per the §1 invariant.

**License note:** Headroom is **Apache-2.0** (ECC/Superpowers are MIT). Apache-2.0 is
permissive and compatible; orchestration triggers only the standard NOTICE/attribution
obligation, which we honor in Telos docs and `telos setup` output.

---

## 4B. Authoring/Assist mode vs. Comprehension mode

A core distinction that governs *when* the harness capabilities fire:

| Mode | What the developer is doing | Active capabilities |
|---|---|---|
| **Comprehension** | viewing the map / monitoring runtime | v1 visual map, Phase 2 overlay, Phase 3 summaries |
| **Authoring / Assist** | *actively writing/creating code* | **Harness Fusion** (ECC + Superpowers + Headroom) + the capability router (§4C) |

The harness fusion and the router are **authoring-mode features** — they help while the
developer *builds*, not merely when they *look*. This keeps comprehension surfaces calm and
reserves the heavier agentic machinery for moments it actually helps.

---

## 4C. The capability router — prompt-aware auto-detection

**Goal:** when a developer writes a prompt, Telos automatically detects which
tools/skills/plans/methodologies apply, applies token-saving efficiencies, and pulls in the
right project capabilities **without being asked**.

**Best-practice basis (AI engineering):** *semantic routing* — embed the prompt, match it
against a capability catalog, and return `{capability, confidence}` as a function-call, with
an orchestrator + fallback rules. Documented wins: routing latency ~5000ms → ~100ms, +10.2
pts task accuracy, and **tool-catalog reduction (≈120K → ≈1K tokens)** — the mechanism that
makes ECC's 271 skills usable without flooding the context window. References:
[semantic router guide](https://atul4u.medium.com/building-a-production-grade-semantic-router-the-smart-way-to-route-ai-prompts-f303e6d2ae7e),
[AI agent routing](https://botpress.com/blog/ai-agent-routing),
[semantic tool selection](https://vllm-semantic-router.com/blog/semantic-tool-selection/),
[hybrid AI routers (arXiv)](https://arxiv.org/pdf/2504.10519).

**Phasing — when to implement, correctly (the explicit guidance):**

| Stage | Phase | Mechanism | Why this phase |
|---|---|---|---|
| **Heuristic router** | **Phase 1.5** | graph context (layer/language/framework) + prompt keywords → capability match; no LLM | Ships with the harness fusion; deterministic, fast, no model dependency |
| **Semantic router** | **Phase 3** | prompt embeddings + confidence scoring + catalog reduction over the full ECC/Superpowers/Headroom catalog | Embedding/LLM infra already lands in the Semantic-brain phase; this is where catalog-reduction pays off |

Both stages obey §4.3 drift-resilience (a routed-to capability that no longer resolves is
dropped from candidates, never a crash) and the §1 isolation invariant.

---

## 5. How this slots into the roadmap (no renumbering)

- **v1** — unchanged (shipped).
- **Phase 1.5 (this spec)** — MCP agent layer + harness fusion; pure additive layer over
  the existing graph.
- **Phase 2 (Sentinel goes live)** — unchanged; the MCP `telos_explore` payload later gains
  live OTel fields once Phase 2 lands (same node IDs).
- **Phase 3 (Semantic brain)** — Understand-Anything features now *named*: summaries,
  business-domain view, dependency-ordered tours, "where does X happen?" Q&A. The curation
  layer's recommendations get LLM-smarter here.
- **Phase 3-lite (optional)** — non-LLM wins: tour scaffold, diff/impact view, shareable
  export.
- **Phase 4 (Forge)** — unchanged.

Nothing in this phase blocks or alters later phases; it only adds consumers of the same
graph.

---

## 6. Licensing & attribution

- **ECC** (`affaan-m/ECC`) — MIT. 67 agents, 271 skills, hooks, rules, MCP configs.
- **Superpowers** (`obra/superpowers`, Prime Radiant Inc. / Jesse Vincent) — MIT. v6.0.3.
- We **orchestrate** (install via upstream mechanisms) rather than redistribute source, so
  obligations are minimal; we still include a NOTICE/attribution crediting both projects
  and their MIT licenses in Telos docs and the setup output.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Upstream ECC/Superpowers change breaks integration | §4.3 drift detection + graceful degradation + isolation invariant |
| 271 skills overwhelm the user | Curation layer surfaces only context-relevant capabilities |
| MCP results drift from HTTP dashboard results | Single shared query API backs both `packages/mcp` and `packages/server` |
| Scope creep from Phase 2/3 leaking into 1.5 | This spec is read-only over the existing graph; no schema/engine edits |
| Maintaining a vendored fork goes stale | Explicitly rejected — orchestrate + pin, never copy |

---

## 8. References (verified repositories)

- CodeGraph — https://github.com/colbymchenry/codegraph · docs https://colbymchenry.github.io/codegraph/getting-started/introduction/
- Understand-Anything — https://github.com/Egonex-AI/Understand-Anything
- ECC (harness) — https://github.com/affaan-m/ECC  (MIT)
- Superpowers (harness) — https://github.com/obra/superpowers  (MIT)
- Model Context Protocol — https://modelcontextprotocol.io/
