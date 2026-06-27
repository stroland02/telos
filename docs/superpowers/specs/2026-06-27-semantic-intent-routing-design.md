# Semantic Intent Routing — Design (AS-BUILT)

**Date:** 2026-06-27
**Status:** SHIPPED. This document reflects what was actually built.
**Phase:** LLM phase, slice 1 (routing first; other LLM applications are separate slices).

## Goal

Replace brittle keyword/substring routing with semantic similarity, so prompts
route to the right workflow + agents by *meaning* — using a tiny, local, offline,
zero-cost model that honors a strict footprint and latency budget.

## Motivation

`router.ts`/`workflows.ts` selected templates by keyword/substring overlap. This
collides: "begin LLM phase" routed to `review`; "implement all" matched
"implement a "; "aria" matched "variable". Every fix was manual trigger-tuning.
Semantic similarity ranks by intent, not surface tokens, and generalizes without
hand-maintained trigger lists.

## Revision history (important)

The original design proposed a transformers.js MiniLM model resident in a
`telos serve` sidecar, called by the hook over `POST /api/route`. **That was
rejected during implementation:** installing `@xenova/transformers` pulled in
`onnxruntime-node` (92MB) + `sharp` (50MB) + `onnxruntime-web` (66MB) ≈ **280MB**,
~7× over the ≤40MB footprint budget, violating the "users must not download
gigabytes" constraint. We pivoted to a **tiny in-process model** (below). Because
that model loads in well under a millisecond, the server sidecar and
`POST /api/route` became unnecessary and were **not built** — routing runs
in-process inside the hook.

## Architecture (as built)

```
prompt → telos-hook (one fast Node process)
           ├─ semanticRoute(prompt, roster, enabled, ctx)   ← PRIMARY
           │     featurize(prompt) → cosine vs intent centroids → planFromTemplate
           ├─ falls back to keyword planWorkflow() when below the confidence threshold
           └─ renderPlan() banner + recordActivity()
```

No network, no sidecar, no model download. Everything is in `@telos/harness`
(pure, engine-free) and invoked by the lightweight `@telos/cli` hook.

### Components

1. **`@telos/harness/src/textVector.ts`** — the "model". `featurize(text)` hashes
   word unigrams + bigrams + character trigrams (stopword-filtered) into a
   512-dim L2-normalized vector via FNV-1a feature hashing. `centroid(vectors)`
   averages + renormalizes. No weights file, no deps.

2. **`@telos/harness/src/intentExamples.ts`** — `TEMPLATE_EXAMPLES`: curated
   example phrasings per workflow intent (the "training set"). `intentCentroids(
   enabledSources)` returns one memoized centroid `SemTarget` per enabled
   template.

3. **`@telos/harness/src/semantic.ts`** — `cosine`, `scoreSemantic` (threshold +
   cap). Pure, reusable by any future embedding backend.

4. **`@telos/harness/src/semanticRoute.ts`** — `selectTemplateSemantic` and
   `semanticRoute`; `SEMANTIC_MIN = 0.30`.

5. **`@telos/harness/src/workflows.ts`** — `planFromTemplate` resolves a chosen
   template's roles to concrete agents (shared by keyword and semantic paths).

6. **`@telos/cli/src/hook.ts`** — `semanticRoute(...) ?? planWorkflow(...)`.

`routeTargets.ts` (cache + `EmbeddingProvider` interface) was built as the swap
point for a future heavier backend; it is **not used** by the hashing model.

## SRS — Software Requirements Specification

### Functional
- FR1: Select a workflow template by semantic similarity of the prompt to
  per-intent centroids.
- FR2: Below the confidence threshold (`SEMANTIC_MIN`), select nothing — the
  caller falls back to keyword routing, which itself stays silent on a no-match.
- FR3: The selected plan renders identically regardless of which path chose it.
- FR4: Adding a phrasing to `TEMPLATE_EXAMPLES` teaches a new way to express an
  intent without code changes elsewhere.

### Non-functional
- NFR1 (footprint): no model download; the "model" is code (<100KB), comfortably
  within the ≤40MB budget. (transformers.js's 280MB is the rejected baseline.)
- NFR2 (latency): featurize + score is sub-millisecond; no measurable add to the
  ~150ms hook.
- NFR3 (offline): no network, ever; zero per-prompt cost.
- NFR4 (no regression): below threshold, behavior equals the prior keyword router.

## SysRS — System Requirements Specification

- Runtime: Node ≥ 20. No native deps, no wasm, no model files.
- Model: deterministic feature-hashing featurizer + in-repo example centroids.
- Storage: none required (centroids are computed/memoized per process).
- Degradation: any low-confidence prompt falls through to keyword routing; the
  hook never blocks or fails the prompt.
- Tuning: `SEMANTIC_MIN = 0.30`, chosen from the observed score distribution
  (real intents ≥ 0.41, off-topic/meta ≤ 0.19).

## Testing (as built)

- `textVector.test.ts` — determinism, unit-length, related>unrelated, morphology,
  centroid membership.
- `semanticRoute.test.ts` — precision regression over 10 labeled intents + the
  real misroutes ("begin the llm phase" → silent; "implement all the SDLC tests"
  → test) + silence on off-topic prompts.
- `semantic.test.ts`, `routeTargets.test.ts` — pure scorer + cache units.

## Future slices (separate specs)

- Capability-level semantic routing (rank the full discovered roster, not just the
  7 templates).
- Semantic code search over the architecture graph.
- Context compression (semantic selection of the graph slice to feed context).
