# Telos Ultimate Harness — Implementation Plan

> TDD, frequent commits. Build **B (Graph-as-Memory) then A (Harness Cockpit)**.

**Goal:** A token-budgeted graph context pack for agents (B) and a legible
harness status cockpit (A).

**Global constraints:** Additive/isolated — no engine-pipeline, served-db, or
existing-command changes. Web bundle mirrors types (no node-only imports). All
gates green (typecheck/lint/test) before push.

---

## Group B — Graph-as-Memory

### Task B1: engine context pack
- Create `packages/engine/src/context.ts` + `context.test.ts`.
- [ ] Test: `buildContextPack` on a small fixture graph → totals (nodes/edges/
  files/languages), per-layer counts, entryPoints top-by-fanIn, hotspots
  top-by-complexity, summaries only for enriched nodes, `limit` caps lists;
  `renderContextPack` includes the node/edge totals.
- [ ] Run → fail. Implement `context.ts` (pure). Run → pass.
- [ ] Export from `index.ts`: `buildContextPack`, `renderContextPack`, types.
- [ ] Build engine; commit.

### Task B2: `telos context` CLI
- Modify `packages/cli/src/main.ts`; add `runContext` + test in `main.test.ts`.
- [ ] Test: `runContext({ path, limit })` returns a `ContextPack` with totals>0
  on the repo fixture (or a tmp scanned dir).
- [ ] Implement `runContext` (scanGraph → buildContextPack) + `context [path]`
  command (`--limit`, `--json`); markdown via `renderContextPack` else JSON.
- [ ] Build CLI; run cli tests; commit.

### Task B3: MCP `telos_context`
- Modify the MCP tool-registration file (where `telos_tour`/`telos_recommend`
  are registered) + its test.
- [ ] Test: calling the `telos_context` handler returns non-empty text.
- [ ] Register tool: builds pack from the loaded graph, returns
  `renderContextPack`. Build mcp; run mcp tests; commit.

## Group A — Harness Cockpit

### Task A1: harness status
- Create `packages/harness/src/status.ts` + `status.test.ts`; export from index.
- [ ] Test: `buildHarnessStatus` → per-source nodeCapabilities counts, totals,
  `lock.present` false when lock null, drift "ok" vs "drift" via diffLock.
- [ ] Implement (pure); export; build harness; run harness tests; commit.

### Task A2: `telos harness` CLI
- Modify `packages/cli/src/main.ts`.
- [ ] Add `harness` command (`--json`): read `.telos/harness.lock` (parseLock if
  present else null), `buildHarnessStatus(DEFAULT_CATALOG, PROMPT_CATALOG,
  HARNESS_INSTALLS)`, print table or JSON.
- [ ] Build CLI; smoke-run `telos harness`; commit.

### Task A3: server `/api/harness`
- Modify `packages/server/src/server.ts` (+ graphService if needed) + test.
- [ ] Test: `GET /api/harness` returns `{ installed, totals, drift, lock }`.
- [ ] Implement route (read lock from served repo root). Build server; run server
  tests; commit.

### Task A4: web Harness panel
- Create `apps/web/src/components/HarnessPanel.tsx` (+ test); add
  `client.harnessStatus()` + `HarnessStatus` type (mirrored); top-bar toggle in
  `App.tsx`.
- [ ] Test: panel renders installed rows + drift badge from a stubbed status;
  client test for `harnessStatus()`.
- [ ] Implement; run web tests; commit.

## Final gate
- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm -r --workspace-concurrency=1 exec vitest run` — all green.
- [ ] Update memory + spec status. Push all commits.
