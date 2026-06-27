# Live-Reload Loop + Visible Telos — Design

**Date:** 2026-06-27
**Status:** Approved (design); implementing.

## Goal

Make Telos a continuous, observable feedback loop while developing Telos itself:
1. **Auto-update loop** — editing Telos source takes effect on the *next* prompt
   with no manual rebuild/reinstall.
2. **Visible Telos** — the per-prompt orchestration plan is plainly visible in
   two deterministic surfaces: a bold in-chat banner and the live web dashboard.

## Why

The orchestration hook already fires on every prompt (`telos-hook` →
`cli/dist/hook.js` → `@telos/harness`), and the global bin is a live symlink into
this workspace. But:
- The hook runs **compiled `dist/`**, so source edits need a `pnpm build` before
  they take effect — a manual step every iteration.
- The injected plan renders as a dim hook annotation, so it is easy to miss; the
  only obviously-visible signal today is the statusline ("engage bar").

Both are net-new gaps, not regressions.

## Non-Goals (YAGNI)

- No model-dependent "assistant echoes the plan" behavior (rejected: not
  deterministic).
- No hook-side self-healing rebuild (rejected: reintroduces per-prompt latency).
- No new runtime dependencies; no engine import in the hot path.
- No changes to routing/classification logic (that is the separate LLM phase).

## Architecture

```
prompt → telos-hook → planWorkflow()
                       ├─ renderPlan()    → BOLD banner injected in chat   (surface 1)
                       └─ recordActivity() → .telos/activity.jsonl
                                              → server GET /api/harness/activity
                                              → web HarnessPanel (polls)    (surface 2)
```

The spine is unchanged; this work lights up the two surfaces and removes the
manual rebuild between source edits and the next prompt.

## Components

### 1. `telos dev` watch loop (auto-update)

Both `@telos/harness` and `@telos/cli` compile with plain `tsc -p tsconfig.json`
(no project-reference graph). The hook runs `cli/dist/hook.js`, which imports
`@telos/harness` → `harness/dist/index.js`. A `tsc --watch` on both packages
keeps `dist/` continuously fresh; the symlinked global bin and the workspace
package resolution pick up the new output on the next prompt automatically.

- `packages/harness/package.json`: add
  `"dev": "tsc -p tsconfig.json --watch --preserveWatchOutput"`.
- `packages/cli/package.json`: same `dev` script.
- root `package.json`: add
  `"dev": "pnpm -r --parallel --filter @telos/harness --filter @telos/cli run dev"`.
- Optional thin `telos dev` CLI verb that execs the root `pnpm dev` (matches the
  mental model; keeps the engine out of the watcher).

**Loop:** run `pnpm dev` once per session → save any source file → `tsc`
re-emits `dist/` sub-second → next prompt's hook runs fresh code. The roster is
already mtime-cached and auto-rescans; product-context refreshes on `telos scan`.

**Caveat (documented):** `dist` writes are not atomic. A prompt landing during a
re-emit could read a partial file; the hook already fails safe (never blocks the
prompt), so the worst case is a single prompt with no banner.

### 2. Bolder in-chat banner (renderPlan)

Replace the dim two-liner with an unmistakable bordered block, still compact
(injected on every matching prompt):

```
╭─ ⟢ TELOS ACTIVE · feature-build ─────────────
│ product: typescript/python · layers: ui,api
│ 1. ⇉ parallel  ecc:typescript-reviewer, ecc:security-reviewer
│ 2. ecc:code-reviewer — final pass
╰─ → dispatch these as subagents
```

- Preserves the **empty-string-on-no-match** contract (silent when unsure).
- Preserves the single-agent `— why` annotation and the `⇉ parallel` marker.

### 3. Live web dashboard (verify + auto-refresh)

The activity feed is already built (`GET /api/harness/activity` → `HarnessPanel`
ActivitySection with tally + leaderboard + relative timestamps). Verify it polls
so new prompts appear without a manual reload; if it only fetches once, add a
lightweight interval poll while the panel is mounted. Web is Vite — its own HMR
already covers code edits during development.

## Testing

- `renderPlan`: update format assertions; keep empty-on-no-match; keep the perf
  guard (`planWorkflow` + `renderPlan` < 5ms over a 400-cap roster).
- web: assert ActivitySection refreshes on poll (fake timers).
- dev loop: assert the `dev` scripts exist and are wired (watchers themselves are
  not unit-testable); document the manual verification (start `pnpm dev`, edit a
  trigger word, confirm the next prompt reflects it).

## Constraints

- No parallel-session-owned files touched; nothing pushed.
- No new runtime dependencies.
- Hook stays engine-free and within its latency budget.
