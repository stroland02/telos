# Telos — orch-* Pipeline Handoff (Design)

**Date:** 2026-06-29
**Status:** Approved, ready for implementation plan
**Scope:** harness routing + plan rendering. One contained, additive change.

## Problem

Telos's plan today is "here are the agents to dispatch." ECC ships whole
orchestration *pipelines* as skills — `ecc:orch-add-feature`,
`ecc:orch-fix-defect`, `orch-change-feature`, `orch-refine-code`,
`orch-build-mvp` — each a full research → plan → TDD → review → gated-commit
loop. Telos reinvents a thinner version of these. When a prompt confidently
matches an intent that has a matching orch pipeline, Telos should **recommend
the harness's own battle-tested pipeline** as the lead action, while still
showing the constituent agents so the user can run it end-to-end *or* dispatch
manually.

## Honest constraint

The UserPromptSubmit hook injects **text** (`additionalContext`); it cannot
invoke a skill. So "handoff" = a recommendation rendered in the plan block,
never an automatic invocation. This is the same "nudge, not force" model as the
rest of Telos. The user (or Claude reading the block) chooses to run the skill.

## Decisions (user-approved)

- **Framing: lead + keep agents.** When an orch pipeline matches, the plan
  LEADS with `▶ Run [telos] <orch-id>` + a one-line pipeline summary, then
  `— or dispatch manually —` followed by today's numbered steps. Augments, does
  not replace.
- **Scope this round: the two existing templates.**
  - `feature-build` → `ecc:orch-add-feature`
  - `bugfix` → `ecc:orch-fix-defect`
  - `orch-refine-code` / `orch-change-feature` / `orch-build-mvp` (which would
    need new intent templates) are explicitly deferred.

## Design

### 1. Data — `packages/harness/src/workflows.ts`

- Add an optional field to `WorkflowTemplate`:
  ```ts
  orchestrator?: { id: string; pipeline: string }
  ```
  - `feature-build`: `{ id: "ecc:orch-add-feature", pipeline: "research → plan → TDD → review → gated commit" }`
  - `bugfix`: `{ id: "ecc:orch-fix-defect", pipeline: "reproduce → failing test → fix → review → gated commit" }`
- Add the same optional field to `OrchestrationPlan`.

### 2. Gating — inside `planFromTemplate`

`planFromTemplate` is shared by the keyword path (`planWorkflow`) and semantic
routing, so the logic lives there and both paths inherit it. After the steps are
built (and only if at least one step resolved — i.e. the plan is non-null):

- If `tpl.orchestrator` is set **and** a roster capability with that `id` exists
  **and** its source is in `enabledSources`, set `plan.orchestrator =
  tpl.orchestrator`. Otherwise leave it unset.

This means a repo without ECC installed (or with ECC disabled) never sees a dead
recommendation — the field simply isn't present and rendering is unchanged.

### 3. Render — `packages/harness/src/renderPlan.ts`

When `plan.orchestrator` is set, prepend a lead block before the numbered steps:

```
╭─ ⟢ TELOS ACTIVE · feature build · product: …
│ ▶ Run [telos] ecc:orch-add-feature
│   research → plan → TDD → review → gated commit
│ — or dispatch manually —
│ 1. [telos] superpowers:brainstorming — design before code
│ …
╰─ → dispatch these as subagents.
```

When `plan.orchestrator` is unset, render is **byte-for-byte unchanged** from
today (regression-locked by an existing renderPlan test).

### 4. Tests

- **workflows:** `planWorkflow("build a new …")` on a roster that includes
  `ecc:orch-add-feature` with ECC enabled → `plan.orchestrator?.id ===
  "ecc:orch-add-feature"`. Same for bugfix → `ecc:orch-fix-defect`.
- **workflows (gating):** orchestrator is **unset** when (a) the orch skill is
  absent from the roster, and (b) ECC is not in `enabledSources`.
- **workflows (no-op intents):** a `review`/`perf`/`docs` plan has no
  orchestrator (those templates define none).
- **renderPlan:** with an orchestrator set, the block contains
  `▶ Run [telos] ecc:orch-add-feature`, the pipeline summary, and
  `— or dispatch manually —`; without one, the block is identical to today.

## Isolation / out of scope

- Purely additive: one optional field threaded template → plan → render. No
  change to template selection, scoring, the Phase 3 specialist gate, or any
  intent other than feature-build/bugfix.
- Deferred: the three orch pipelines that need new intent templates
  (refine-code/change-feature/build-mvp); auto-invocation (impossible via hook);
  surfacing the handoff in the web panel.
