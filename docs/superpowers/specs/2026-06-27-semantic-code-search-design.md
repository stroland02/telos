# Semantic Code Search — Design (AS-BUILT)

**Date:** 2026-06-27
**Status:** SHIPPED.
**Phase:** LLM phase, Feature B. Builds on the slice-1 featurizer.

## Goal

Upgrade the graph "ask / where-is-X" search from keyword-only to a hybrid that
understands meaning *and* pinpoints exact identifiers — reusing the tiny
in-process featurizer (no model, no deps).

## Mode: Hybrid (decided)

Code search has two query modes: conceptual ("where is auth handled?") and exact
identifier ("find parseOtlpTraces"). Pure n-gram semantics is weak on exact
symbols, so we **blend**: `score = semWeight·cosine + kwWeight·keywordHitRatio +
centralityBonus`.

## Architecture

- `@telos/harness/src/semanticAsk.ts` (NEW):
  - `buildSemanticIndex(graph)` — featurize each node's `name + qualifiedName +
    path + summary`, with camelCase/snake split (`parseOtlpTraces` → "parse otlp
    traces"). Cached per graph object (`WeakMap`) — built once per session.
  - `semanticAsk(graph, question, opts)` — featurize query, blend semantic +
    keyword + fan-in, drop nodes below the noise floor (`sem < 0.15 && kw === 0`),
    rank, slice to `limit`.
  - Lives in harness (which depends on engine) so it can read `TelosGraph` and
    reuse `featurize`/`cosine` without a circular dep.
- `@telos/server/src/graphService.ts` — `getAnswers` now calls `semanticAsk`
  instead of keyword `askGraph`. The `/api/ask` endpoint and its web "ask" UI
  light up for free. Engine's `askGraph` stays for MCP/keyword consumers.

## Behavior notes (honest)

- It is **search**, not routing: it returns best-effort ranked candidates rather
  than going silent. Off-topic queries surface only weak matches (top < 0.4),
  while real queries produce a strong top hit (≥ 0.4) — verified in tests.
- The lexical featurizer is strong when the query shares some words with the code
  (the common case) and weaker on purely-conceptual, zero-overlap queries — the
  expected tradeoff of the tiny model; the `EmbeddingProvider` swap point remains.

## Testing

`semanticAsk.test.ts` — conceptual match, exact-identifier pinpoint, camelCase
boundary match, empty query → none, off-topic → no strong hit, real query → strong
hit. Server `/api/ask` suite stays green (38).

## Constraints

No new deps; in-process; no parallel-session files; nothing pushed.
