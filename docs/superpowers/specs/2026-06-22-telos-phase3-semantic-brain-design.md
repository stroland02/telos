# Telos Phase 3 — Semantic Brain — Design Spec

**Date:** 2026-06-22
**Status:** Approved (autonomous build — provider-agnostic first sub-project)
**Author:** Sebastian Roland + Claude (brainstorming session)
**Parent spec:** [`2026-06-19-telos-code-sentinel-design.md`](./2026-06-19-telos-code-sentinel-design.md) §8 (Phase 3 row), §4 (the reserved `summary`/`layer` fields)

---

## 1. Summary

Phase 3 turns the static graph into a **semantic brain**: it fills the `summary` field the
v1 schema already reserved, refines architectural `layer`, and builds human-facing
understanding aids (guided tours, "where does X happen?" answers).

The defining design decision — and the reason this is safe to build autonomously — is that
Phase 3 is an **enrichment *pipeline* with a pluggable `Enricher`, not a hardwired LLM
call.** This mirrors Telos's core invariant ("adding a language is a *data* change, not a
*code* change"):

- The **default enricher is deterministic** — it derives a `summary` and a refined `layer`
  from structural facts already in the graph (kind, language, fan-in/out, call neighbors,
  path). It needs **no API key, incurs no cost, and is fully TDD-testable** with golden
  assertions.
- A real LLM becomes a **drop-in adapter** (`LlmEnricher implements Enricher`) added later
  as its own spec cycle — no engine rewrite, no fabricated provider/key/cost decisions made
  autonomously.

This keeps Phase 3 isolated and drift-resilient by construction, the same way the Phase 1.5
harness fusion was: the core has zero hard dependency on any LLM vendor.

### Goals

- Populate `node.summary` for every node from structural facts (deterministic baseline).
- Make the `Enricher` boundary so clean that swapping the deterministic enricher for an LLM
  one is a one-file adapter + a flag — no changes to the pipeline, store, server, or web.
- Ship near-term human-value features that ride on the enriched graph: a dependency-ordered
  guided tour and a "where does X happen?" answer over the graph.
- Persist enrichment back into `.telos/graph.db` without re-scanning.

### Non-Goals (this sub-project)

- Calling any real LLM / embedding provider (that is the future `LlmEnricher` spec — needs a
  provider, key, and cost model that are the user's decision).
- Business-domain clustering beyond the existing layer heuristic (LLM-era work).
- Vector/embedding search (the Q&A slice is keyword + structure ranked; semantic embeddings
  are a later enhancement, consistent with the Phase 3 semantic capability-router note).

---

## 2. Architecture

Three independently testable units, all in `packages/engine` (they operate on the universal
graph and persist through the existing store):

```
   loadGraph() ─► enrichGraph(graph, enricher) ─► applyEnrichment(updates) ─► graph.db
                          │
                          ├─ HeuristicEnricher  (default, deterministic, free)
                          └─ LlmEnricher        (future adapter — same interface)

   enriched graph ─► buildTour(graph)      ─► ordered stops   (guided tour)
   enriched graph ─► askGraph(graph, q)    ─► ranked answers  ("where does X happen?")
```

### 2.1 The `Enricher` boundary (`packages/engine/src/enrich.ts`)

```typescript
export interface NodeEnrichment {
  summary: string;          // human-readable one-liner
  layer?: Layer;            // optional refined layer (omitted = keep heuristic layer)
}

export interface EnrichContext {
  graph: TelosGraph;
  callers: TelosNode[];     // who calls this node (precomputed via query.ts)
  callees: TelosNode[];     // what this node calls
}

export interface Enricher {
  readonly name: string;                                  // e.g. "heuristic", "llm"
  enrich(node: TelosNode, ctx: EnrichContext): NodeEnrichment;
}

/** Pure: returns a new graph with summaries (and any refined layers) filled. */
export function enrichGraph(graph: TelosGraph, enricher: Enricher): TelosGraph;
```

- `enrichGraph` is **pure** (graph in → enriched graph out) — the unit test asserts on the
  returned graph with zero I/O.
- It builds each node's `EnrichContext` using the existing `callersOf`/`calleesOf` from
  `query.ts` (no duplication).

### 2.2 `HeuristicEnricher` (`packages/engine/src/enrichers/heuristic.ts`)

Deterministic. Produces a structural summary, e.g.:

> `function authenticate (typescript, api layer) — called by 3, calls 2, spans 18 lines.`

Rules are pure string composition over node fields + neighbor names; no randomness, so
golden tests are stable. May refine `layer` only in unambiguous structural cases (it does
NOT guess — when uncertain it omits `layer`, leaving the heuristic value).

### 2.3 Persistence (`GraphStore.applyEnrichment`)

```typescript
applyEnrichment(updates: { id: string; summary: string; layer?: Layer }[]): void
```

Updates only the `summary` (and `layer` when present) columns for the given ids inside one
transaction. Does **not** touch edges or FTS. Re-running is idempotent.

### 2.4 Guided tour (`buildTour`)

`buildTour(graph, opts?) -> TourStop[]` — orders the most important nodes in **dependency
order** (a node appears after the things it depends on), using the existing dependency edges
and fan-in/out for importance. Pure, no LLM. Each stop carries the node + its (now enriched)
summary so the tour reads as a narrated walk-through. This is the Phase 3-lite "dependency-
order tour scaffold" promised in the parent spec §8.

### 2.5 Graph Q&A (`askGraph`)

`askGraph(graph, question) -> Answer[]` — ranks nodes by relevance to a natural-language
question using keyword overlap against `name`/`qualifiedName`/`path`/`summary` plus a
structural boost (fan-in importance). Deterministic, no LLM — a "semantic-lite" answer that
the future `LlmEnricher`/embedding layer upgrades without changing callers.

---

## 3. Surfaces

| Surface | Addition |
|---|---|
| CLI | `telos enrich [path]` (run enricher, persist), `telos tour [path]` (print ordered stops), `telos ask "<question>" [path]` (print ranked answers) |
| Server | `GET /api/tour`, `GET /api/ask?q=`; node detail already carries `summary` |
| Web | DetailPanel renders `summary` (the slot the v1 spec reserved); tour/ask UI is a later slice, not in this sub-project |
| MCP | `telos_tour` and `telos_ask` tools can wrap the same engine functions (agents get the semantic brain too) — wired in a later slice if time allows |

The default `scan` does **not** auto-enrich (keeps scan fast and side-effect-light);
enrichment is an explicit `telos enrich` step, like a build artifact.

---

## 4. Testing

- TDD throughout. `enrichGraph` + `HeuristicEnricher`: golden assertions on summary strings
  for a fixture graph. `applyEnrichment`: open in-memory db, save, enrich, reload, assert
  summaries persisted and idempotent. `buildTour`: assert dependency-order invariant
  (no stop precedes something it depends on). `askGraph`: assert expected node ranks top for
  a known question. Server routes: supertest-style against a stub provider.
- The `LlmEnricher` is **not** built or tested here; a stub test documents that any object
  implementing `Enricher` is accepted by `enrichGraph`.

---

## 5. Build order (slices, each its own feature branch → auto-merge to master when green)

1. **Enrichment pipeline** — `Enricher`/`enrichGraph` + `HeuristicEnricher` + `applyEnrichment` + `telos enrich`. (core value)
2. **Surface the summary** — server node detail + web DetailPanel render `summary`.
3. **Guided tour** — `buildTour` + `telos tour` + `GET /api/tour`.
4. **Graph Q&A** — `askGraph` + `telos ask` + `GET /api/ask`.
5. *(future, not autonomous)* **`LlmEnricher` adapter** — real LLM summaries/layers/domains; its own spec, provider + key + cost are the user's decision. This sub-project's clean `Enricher` boundary is the drop-in point.

---

## 6. Isolation / drift-resilience invariant

Telos core never imports an LLM SDK. The semantic brain's only contract is the `Enricher`
interface. If a future LLM vendor changes or is unavailable, the deterministic enricher
still produces a complete graph — the system degrades to "structural summaries" rather than
breaking. This is the same guardrail the user required for the Phase 1.5 harness fusion,
applied to the semantic layer.
