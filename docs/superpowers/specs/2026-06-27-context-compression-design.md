# Focused Context Compression — Design (AS-BUILT)

**Date:** 2026-06-27
**Status:** SHIPPED.
**Phase:** LLM phase, Feature C. Builds on the slice-1 featurizer and Feature B (`semanticAsk`).

## Goal

Make the graph-as-memory context brief **task-aware**: given a focus query,
compress the brief to the slice of the codebase relevant to that task — fewer
tokens AND more on-target than the generic structural brief.

## The signal (the design question, answered)

Compress against an **optional `focus` query** (the current task/prompt). No focus
→ unchanged structural brief (backward compatible).

## Mode: Focused-replace (decided)

With a focus, keep a minimal structural header (totals + layers) but REPLACE the
generic entry-points/hotspots/summaries with the focus-relevant node slice.
Smaller and more relevant — truest to "compression".

## Architecture

`@telos/harness/src/contextCompress.ts`:
- `buildFocusedContextPack(graph, { limit, focus })` → `FocusedContextPack`
  (extends the engine `ContextPack` with `focus` + `relevant`). Uses the engine
  `buildContextPack` for the structural backbone and `semanticAsk` (Feature B) to
  rank the relevant nodes.
- `renderFocusedContextPack(pack)` → focus header + "Relevant to your task" slice;
  delegates to the engine renderer when there is no focus.
- In harness so it can reuse `semanticAsk` + the engine pack builder without a
  circular dependency.

`@telos/server`:
- `GraphProvider.getContext(limit?, focus?)`; `graphService.getContext` uses the
  focused builder/renderer.
- `GET /api/context?focus=<task>` — the web Context panel gains task-aware
  compression; the no-focus call is unchanged.

## Evidence

On the real 725-node graph, focus "how does semantic routing pick a workflow
template": brief shrank ~710 → ~404 tokens (**43%**) and surfaced exactly
`WorkflowTemplate`, `selectTemplate`, `planWorkflow`.

## Testing

`contextCompress.test.ts` — no-focus returns full structural; focus drops generic
lists and ranks the on-target node first; structural header retained; renderer
names the task + relevant node and omits generic sections. Server suite green (38).

## Constraints

No new deps; in-process; no parallel-session files; nothing pushed.
