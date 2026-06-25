# Telos Resolve — Implementation Plan

> Fresh session. Spec: `docs/superpowers/specs/2026-06-25-telos-resolve-scan-design.md`. TDD, frequent commits.

**Goal:** `telos resolve` runs curated agents over the graph (read-only) to find issues + resolutions, flagged on the map.

**Global constraints:** Additive/isolated/optional (no key ⇒ no-op, never fabricate).
Read-only driver (`Read/Grep/Glob` only). Bounded to top-N targets. Mirrors the
Forge channel/overlay patterns.

---

### Task 1: engine Finding types + `packages/resolve` scaffold
**Files:** engine `src/finding.ts` (+ export); new `packages/resolve` (package.json/tsconfig/vitest).
- [ ] Add `Severity`, `Finding`, `ResolveState` to engine; export. Test the types
  compile + a `severityRank` helper (error>warn>info) if useful.
- [ ] Scaffold `@telos/resolve` (deps `@telos/engine`, `@telos/harness`, optional SDK). Commit.

### Task 2: ReviewDriver + stub + claude driver
**Files:** `packages/resolve/src/driver.ts`, `claude-driver.ts` (+ tests).
- [ ] Test: `stubReviewDriver.review(args)` returns one deterministic Finding for the node.
- [ ] Implement `ReviewDriver` interface + `stubReviewDriver`.
- [ ] `claudeReviewDriver` — dynamic-import SDK (mirror forge claude-driver),
  `allowedTools:[Read,Grep,Glob]`, asks for findings JSON, parses to `Finding[]`,
  graceful → `[]` on any error. Test the JSON-parse + missing-SDK paths. Commit.

### Task 3: `runResolve` orchestrator
**Files:** `packages/resolve/src/resolve.ts` (+ test).
- [ ] Test: `runResolve({ graph, driver: stub, limit: 5, route })` reviews the top-5
  nodes by complexity/fanIn, emits `onFinding`, returns `ResolveState{findings,scanned,done}`.
- [ ] Implement: load/scan graph → rank targets → route via `recommend`/router →
  drive (bounded concurrency) → collect. Export from index. Commit.

### Task 4: server resolve channel
**Files:** `packages/server/src/server.ts` (+ graphService hub) + test.
- [ ] `POST /v1/resolve` (store + broadcast) + `GET /api/resolve/state` +
  `GET /api/resolve/stream` (SSE). Mirror the Forge hub/routes + forge.test.
- [ ] Commit.

### Task 5: web overlay + Resolutions panel
**Files:** `apps/web` types/client, `useResolveOverlay.ts`, MapView, TelosNode, `ResolutionsPanel.tsx`, rail entry (+ tests).
- [ ] `ResolveState`/`Finding` mirrored types; `client.resolveState()/subscribeResolve()`.
- [ ] `useResolveOverlay` (always-subscribe like forge); MapView injects
  `_findingSeverity`; TelosNode severity ring (error/warn/info).
- [ ] `ResolutionsPanel` (rail **⚠ Resolve** entry) lists findings by severity,
  click → openNode. Tests: panel renders findings from stub; node ring reflects severity.
- [ ] Build; full web gate; commit.

### Task 6: CLI `telos resolve` + final gate
**Files:** `packages/cli/src/main.ts` (+ test).
- [ ] `runResolveCli(opts)` picks stub|claude driver, runs `runResolve`, prints a
  findings summary, best-effort POSTs to a running server. `resolve [path]` command
  (`--driver --limit --url --path`). "is registered" + runResolveCli(stub) tests.
- [ ] Final gate: `pnpm build && typecheck && lint && test` green. Smoke
  `telos resolve --driver stub` flags a node on the live map. Commit; update memory.
