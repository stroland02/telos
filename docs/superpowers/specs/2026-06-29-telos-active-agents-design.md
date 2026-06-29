# Telos — Recency-Windowed "Active Agents" (Design)

**Date:** 2026-06-29
**Status:** Approved, building.
**Scope:** how agent usage is *windowed and labeled* — data layer + statusline +
panel. No routing/scoring change.

## Problem

The statusline read `used / curated` (e.g. `26/22`) — nonsensical since Phase 3
lets the router pull specialists from the full ~352 pool *beyond* the curated 22,
so `used` can exceed `curated`. The count is also conversation-specific (it
reflects what *this* build routed) and never "cleans up": an agent used once for
a finished task lingered in the rolling 20-prompt window.

## Honest constraint

Telos only observes which agents it **routed** per prompt (`activity.jsonl`). It
cannot see whether a subagent was dispatched, is still working, or finished. So
"active" is approximated by **recency of routing**, not literal process liveness.

## Decisions (user-approved)

- **Statusline shows an absolute:** `N agents active` (no denominator).
- **"Active" = recency window:** an agent is active if routed within the last
  `activeWindow` (6) routed prompts **and** newer than `activeMinutes` (30 min).
  Everything else routed this session is **retired**.
- **Panel** distinguishes **active now (●)** vs **retired/idle (○)**.

Why both prompt-count *and* time: the count window tracks the current task (an
agent used throughout a build stays active; one from a finished task ages out
after ~6 newer prompts), while the time cutoff handles a **pause / new chat** —
after a gap the stale set falls away so the number reflects *this* conversation.

## Design

### 1. Data — `packages/harness/src/activity.ts`

`computeUsage(telosDir, window=20, activeWindow=6, activeMinutes=30, now=Date.now())`:
- `cutoff = now - activeMinutes*60000`; `activeIds` = distinct agents in the last
  `activeWindow` routed entries with `ts >= cutoff`.
- `UsageStats` gains `activeCount: number`; each `agents[]` entry gains
  `active: boolean` (= `activeIds.has(id)`). `agents[]` still spans the wider
  `window` so the panel can show the retired set. `now` is injectable for tests.

### 2. Statusline — `activate.ts` + `cli/main.ts`

- `statusLineText` renders `${agents} agents active` (drop the `/total` form;
  `agentsTotal` no longer used in the headline).
- `runStatusLine` passes `usage.activeCount` as the agent number.

### 3. Panel — `apps/web` (`types.ts` + `HarnessPanel.tsx`)

- `UsageStats` type gains `activeCount` and per-agent `active`.
- Header: `{activeCount} active · {installed} installed` (curated demoted to a
  quieter detail line; the "from full roster" note stays).
- Expanded roster markers: `● active` when `active`, else `○ idle` — wording
  "active now" vs "retired".

### 4. Tests

- **activity:** `activeCount` counts only last-`activeWindow` + within-time
  agents; an old agent (beyond window or older than `activeMinutes`) is
  `active:false` and excluded from `activeCount`; injected `now`.
- **statusline:** renders `N agents active`, no `/`.
- **panel:** header shows `{activeCount} active`; an agent with `active:false`
  renders as retired.

## Isolation / out of scope

- Additive: only the usage window + labels change. Routing, templates, the Phase
  3 gate, history, and orch handoff are untouched.
- `activeWindow`/`activeMinutes` are constants this round (could become config
  tunables later, like `specialistMin`). No Stop/SessionEnd hook — the time
  cutoff already gives the "new chat resets it" behavior.
