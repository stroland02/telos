# Telos Control Rail — Implementation Plan

> Execute in its own session. Spec: `docs/superpowers/specs/2026-06-24-telos-control-rail-design.md`.
> TDD, frequent commits. React + Vitest + Testing Library.

**Goal:** A persistent left Control Rail that shows live status of, and launches,
every Telos feature.

**Global constraints:** Status + launch only (no enrich/scan/forge actions from
the UI). Web bundle mirrors types (no node-only imports). Reuse existing
panels/overlays + client methods. All gates green.

---

### Task 1: read-only context surface (server + client + panel)

**Files:** `packages/server/src/server.ts` (+ test), `apps/web/src/api/client.ts`
(+ types), `apps/web/src/components/ContextPanel.tsx` (+ test).

- [ ] Server test: `GET /api/context` returns 200 with non-empty markdown for a
  fixture graph (use the existing `server-routes.test.ts` `service()` helper).
- [ ] Implement route: `return { brief: renderContextPack(buildContextPack(provider.getGraph?() ?? graph)) }` — read the served graph from GraphService (add a small `graph` getter if not exposed). Import `buildContextPack, renderContextPack` from `@telos/engine`.
- [ ] Client: add `contextPack(): Promise<string>` to `TelosApi` + factory
  (`(await get<{brief:string}>("/api/context")).brief`).
- [ ] `ContextPanel.tsx`: modal like ProcessPanel (Esc/backdrop close, focus on
  open); renders the brief in a `<pre>`; closed → null. Test: renders brief text;
  closed renders nothing. Run web + server tests. Commit.

### Task 2: `useTelosStatus` hook

**Files:** `apps/web/src/graph/useTelosStatus.ts` (+ test), `apps/web/src/api/types.ts`.

- [ ] Define `TelosStatus` (mirror): `{ graph: {nodes,edges,languages,enriched} | null; harness: {caps,drift} | null; live: {calls} | null; procs: number | null; forge: {turn,costUsd} | null }`.
- [ ] Test: `useTelosStatus(api)` with stubbed `overview/harnessStatus/traceState/processes` resolves a populated status; a rejecting `harnessStatus` leaves `harness: null` but other fields populate.
- [ ] Implement: on mount, fetch the light reads (Promise.allSettled), set fields
  independently; poll every 5s; subscribe to forge SSE for `forge`. Clean up timer
  + unsub on unmount. Commit.

### Task 3: `ControlRail` component

**Files:** `apps/web/src/components/ControlRail.tsx` (+ test).

- [ ] Test: given a stub `status` + setters, renders the grouped entries (View /
  Live signals / Agent / Build / Status footer); clicking the "Live" entry calls
  `onToggleLive`; a null status field renders `—`; collapse button toggles a
  `collapsed` callback.
- [ ] Implement: pure presentational. Props = `{ status, active: {...open flags},
  on: { toggleLive, openReplay, toggleHot, openProcs, openAsk, openHarness,
  openContext, ... }, collapsed, onCollapsedChange }`. Token-styled, no hex.
  Persist collapsed in `localStorage` at the call site (App), not here. Commit.

### Task 4: App relayout + wire the rail

**Files:** `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`.

- [ ] Wrap the app in a flex row `[ ControlRail | main ]`; `main` holds the
  existing top bar (minus the feature toggles) + MapView + overlays.
- [ ] Remove the feature-toggle buttons from the top bar; pass their setters as
  the rail's `on` handlers and their open-state as `active`.
- [ ] Add `harnessOpen`-style state for `contextOpen`; render `<ContextPanel>`.
- [ ] `useTelosStatus(api)` → rail `status`. Persist rail collapsed in localStorage.
- [ ] Update `App.test.tsx`: the toggles now live in the rail (query by their
  rail labels); add `contextPack` to the api stub. Run full web suite. Commit.

### Final gate
- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm -r --workspace-concurrency=1 exec vitest run` — green.
- [ ] Smoke: `telos serve`, confirm the rail renders with live badges and each
  entry opens/toggles its feature. Commit. Update memory.
