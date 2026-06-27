# Capability-Level Semantic Routing — Design

**Date:** 2026-06-27
**Status:** Approved (design); implementing.
**Phase:** LLM phase, slice 2. Builds on slice 1 (semantic intent routing).

## Goal

After the template plan is chosen, surface the most relevant *specific* agents
from the full discovered roster (~352 capabilities) that the template did not
already name — so e.g. "make this WCAG compliant" pulls in `ecc:a11y-architect`,
which no template lists.

## Mode: Augment (decided)

Non-regressive. The template workflow stays the backbone; capability routing
only ADDS an extra "specialists" step. If no template matched (plan is empty),
nothing is added — silence stays silence. Capability routing never overrides or
replaces the template.

## Architecture

```
plan = semanticRoute(prompt) ?? planWorkflow(prompt)      (slice 1, unchanged)
plan = augmentWithSpecialists(plan, prompt, roster, enabled)   (slice 2, NEW)
        └─ only when plan already has agents; appends a deduped specialists step
```

All in `@telos/harness` (pure); the hook calls it after routing.

### Components (new, in @telos/harness)

1. `capabilityVectors(roster, enabledSources)` — memoized `SemTarget[]`, one per
   enabled capability, `vec = featurize(title + " " + description + " " +
   triggers.join(" "))`. Memo key = enabledSources + `roster.scannedAt`, so it
   rebuilds when the roster changes. (featurizing ~352 short strings is a few ms;
   no disk cache needed — `routeTargets.ts`'s disk cache stays reserved for a
   heavier future backend.)

2. `selectSpecialists(prompt, roster, enabledSources, opts?)` →
   `{ id: string; score: number }[]`. Featurize prompt, `scoreSemantic` vs
   `capabilityVectors`, return top-N (default 3) above `SPECIALIST_MIN`.

3. `augmentWithSpecialists(plan, prompt, roster, enabledSources, opts?)` →
   `OrchestrationPlan`. If the plan has no agents, return it unchanged. Else
   compute specialists, drop any id already present in the plan, and if any
   remain append `{ phase: "specialists", parallel: true, agents: [{ id, why:
   "top semantic match for this prompt" }] }`.

### Hook wiring (@telos/cli/src/hook.ts)

```
const roster = loadRoster({ telosDir });
let plan = semanticRoute(prompt, roster, enabled, ctx) ?? planWorkflow(prompt, roster, enabled, ctx);
plan = augmentWithSpecialists(plan, prompt, roster, enabled);
```

## SRS

- FR1: When a plan has agents, append up to N (default 3) roster capabilities
  whose similarity to the prompt clears `SPECIALIST_MIN`, excluding already-named
  agents.
- FR2: When the plan is empty, add nothing (no resurrecting a silent no-match).
- FR3: Specialists render via the existing `renderPlan` (no banner change).
- NFR1: in-process, sub-10ms over the full roster; no deps, offline.
- NFR2: deterministic; memoized per roster version.

## Testing

- `selectSpecialists`: on a synthetic roster, a domain prompt ("make this
  accessible / WCAG") ranks the matching specialist top; an off-topic prompt
  clears nobody (empty).
- `augmentWithSpecialists`: appends a deduped specialists step; leaves an empty
  plan untouched; never duplicates an already-named agent.
- `SPECIALIST_MIN` tuned from a probe against the real roster (recorded in the
  test rationale).

## Constraints

- No parallel-session files; nothing pushed. No new deps. Hook stays engine-free.
