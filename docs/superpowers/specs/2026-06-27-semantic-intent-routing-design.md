# Semantic Intent Routing (Local Embeddings) — Design

**Date:** 2026-06-27
**Status:** Approved (design); implementing.
**Phase:** LLM phase, slice 1 of N (routing first; other LLM applications deferred).

## Goal

Replace brittle keyword/substring routing with semantic similarity, so prompts
route to the right workflow + agents by *meaning* — using a small, local,
offline, cheap embedding model that honors a tight footprint and latency budget.

## Motivation

`router.ts` scores capabilities by keyword/substring overlap. This collides:
"begin LLM phase" routed to a code-`review`; "implement all" matched
"implement a"; "aria" matched "variable". Every fix has been manual
trigger-tuning. Semantic embeddings rank by intent, not surface tokens, and
generalize without hand-maintained trigger lists.

## Non-Goals (YAGNI)

- No hosted-LLM calls (network/cost/offline-break — rejected in brainstorm).
- No generative model (0.5–2GB+ footprint — rejected).
- No semantic code search or context compression yet (separate future slices).
- No change to the workflow-template *structure* or agent resolution — only how
  the prompt is matched to a template/capabilities.

## Architecture

```
prompt → telos-hook ──HTTP POST /api/route──▶ telos serve (model resident)
            │  (warm: ~10–30ms)                │  embed(prompt) → cosine-rank
            │                                   │  targets → plan
            │  ◀───────── plan JSON ────────────┘
            │
            └─ server unreachable? → fall back to keyword routeRoster() (0ms add)
```

The model lives **once** in the long-running `telos serve` process. The hook
stays a thin client and **degrades to today's keyword routing** when the server
is absent — no regression, pure upgrade when the server is up. `telos dev` may
start the server alongside the watcher.

### Components

1. **`@telos/harness` — embedding interface + semantic scorer**
   - `EmbeddingProvider` interface: `embed(texts: string[]): Promise<number[][]>`.
   - `scoreSemantic(promptVec, targets)`: cosine similarity ranking, behind the
     same shape `routeRoster`/`planWorkflow` already return.
   - `cosine(a, b)` util; a confidence threshold preserves empty-on-no-match.
   - Target embeddings (template intents + capability descriptions) cached to
     `.telos/route-embeddings.json`, keyed by a hash of the target text so they
     rebuild only when capabilities/descriptions change.

2. **`@telos/server` — resident model + `POST /api/route`**
   - Loads the embedding model once at startup (lazy on first `/api/route`).
   - `POST /api/route { prompt }` → `{ plan }` using `planWorkflow` with the
     semantic scorer.
   - Uses **transformers.js** with a quantized MiniLM/bge-small model. Pure
     JS + wasm: no native binaries, clean cross-OS, model cached on first run.

3. **`@telos/cli` — hook client + fallback**
   - `hook.ts` tries `POST http://127.0.0.1:<port>/api/route` with a short
     timeout (≤ 150ms). On any failure → existing keyword `planWorkflow`.
   - The chosen plan still renders via `renderPlan` (banner) + `recordActivity`.

### Data flow (unchanged spine)

Prompt → route (semantic if server up, else keyword) → `renderPlan` banner +
`recordActivity` → activity feed → live dashboard. Only the *scoring* changes.

## SRS — Software Requirements Specification

### Functional requirements
- FR1: Given a prompt, the system selects a workflow template + agents by
  semantic similarity to target descriptions.
- FR2: Below a confidence threshold, the system emits no plan (silent banner).
- FR3: When the embedding service is unavailable, routing falls back to keyword
  routing and still returns a valid (possibly empty) plan.
- FR4: Target embeddings are cached and reused; they recompute only when the
  underlying target text changes (content-hash keyed).
- FR5: The selected plan is rendered identically to today (banner + activity),
  regardless of which scorer produced it.

### Non-functional requirements
- NFR1 (footprint): total added on-disk model + runtime ≤ ~40MB; no multi-GB
  download.
- NFR2 (latency): ≤ 50ms added per prompt with a warm server; 0ms added in the
  keyword-fallback path.
- NFR3 (offline): after first model fetch, no network is required; zero
  per-prompt API cost.
- NFR4 (no regression): with the server down, behavior is identical to the
  current keyword router.
- NFR5 (portability): no native build step required (pure JS + wasm runtime),
  works on Windows/macOS/Linux.

## SysRS — System Requirements Specification

- Runtime: Node ≥ 20; transformers.js (wasm backend).
- Model: quantized sentence-embedding model (MiniLM-L6 / bge-small class,
  384-dim), fetched once to a local cache under `.telos/models` (or the
  transformers.js cache), pinned by name + revision.
- Interface: `POST /api/route` (JSON in/out) on the existing server port; the
  hook discovers the port the same way the CLI/web already do.
- Storage: `.telos/route-embeddings.json` for cached target vectors.
- Degradation: server-absent and model-load-failure both fall through to keyword
  routing; the hook must never block or fail the prompt.

## Testing

- Precision regression: a small labeled `prompt → expected intent` set, including
  the real misroutes ("begin LLM phase" ≠ review; "implement all tests" = test
  intent), asserting semantic routing fixes them.
- Cosine/threshold unit tests (deterministic vectors).
- Degradation test: server down → keyword path returns the same result as today.
- Latency guard: a warm-embed call stays within budget (skippable in CI if the
  model isn't fetched).
- Footprint check: assert the model artifact stays under the NFR1 budget.

## Constraints

- No parallel-session-owned files touched; nothing pushed.
- Hook stays engine-free; the model never loads in the hot-path process.
- One new runtime dependency (transformers.js) scoped to `@telos/server` only.
