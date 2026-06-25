# Telos Control Rail — Design Spec

**Date:** 2026-06-24
**Status:** Approved (design confirmed by user)
**Author:** Sebastian Roland + Claude

---

## 1. Summary

A persistent left **Control Rail** in the web UI — Telos's "mission control."
Today you land directly on the map and features are scattered across top-bar
toggles (● Live, ▷ Replay, 🔥 Hot, ▤ Procs, ⚙ Harness, ✦ Ask) with no single
place showing what Telos can do or its current state. The rail consolidates
every feature into one always-visible surface that shows **live status** and
**launches/toggles** each feature. No long-running actions are triggered from the
rail (enrich/scan/forge-runs stay CLI); it shows their status + a command hint.

## 2. Layout

`App` becomes a flex row: `[ ControlRail | (top bar + MapView + overlays) ]`.
- Rail ≈ 200px, dark, token-styled; collapsible to a ~48px icon strip (a chevron
  toggle; collapsed state persists in `localStorage`).
- The top bar keeps only search / density / theme / fit-view. **All feature
  toggle buttons move out of the top bar into the rail** (single source of
  control — no duplicate toggles).
- The map and all existing overlay panels (AskPanel, ProcessPanel, HarnessPanel,
  …) are unchanged; the rail just drives the same state.

## 3. Rail contents

Grouped entries; each = icon + label + a live **status badge** + a click action
(toggle an overlay or open an existing panel):

- **View**: Map (active indicator). *(future views slot here)*
- **Live signals**: ● Live `calls in window` · ▷ Replay · 🔥 Hot `hottest node` ·
  ▤ Procs `# processes`.
- **Agent**: ✦ Ask · ⚙ Harness `N caps · drift ok|drift` · ✦ Context *(opens the
  new ContextPanel)* · MCP *(info row: "telos mcp — stdio, read-only")*.
- **Build**: ⚒ Forge `idle | turn N · $cost` (from the existing forge SSE).
- **Status footer**: `N nodes · M edges · langs` and enrichment `X/Y summaries`.

A badge that can't load shows `—` (never blocks the rail).

## 4. Components & data flow

- **`ControlRail.tsx`** — pure presentational. Props: the current toggle/open
  states + their setters (already in `App`), and a `status` object. Renders the
  grouped entries; click handlers call the existing setters. No data fetching of
  its own.
- **`useTelosStatus(api): TelosStatus`** — assembles the status object from
  **existing** client reads/streams: `overview()` (graph stats + languages +
  enriched count), `harnessStatus()` (caps + drift), `traceState()`/`subscribeTrace`
  (live calls), `processes()` (count), and the forge SSE (active run). Each field
  fails independently to a null/`—`. Polls light reads on an interval (e.g. 5s)
  and layers SSE for live ones; unsubscribes on unmount.
- **`App.tsx`** — relayout to the flex row; remove the top-bar toggle buttons;
  render `<ControlRail .../>` with the existing state + `useTelosStatus`.
- **Context surface (new, small):**
  - Server `GET /api/context` → `renderContextPack(buildContextPack(graph))` over
    the served graph (engine fns already exist; GraphService already holds the graph).
  - Client `contextPack(): Promise<string>` (markdown).
  - `ContextPanel.tsx` — modal like the others (Esc/backdrop close), renders the
    brief as preformatted markdown text. Opened from the rail's Context entry.

## 5. Control depth

**Status + launch only.** The rail launches features (open panels, toggle
overlays) and shows status. It does NOT run enrich/scan/forge — those remain CLI;
the rail shows their *status* and the command to run (e.g. Forge idle → tooltip
"run `telos forge \"<intent>\"`"). No new action endpoints; the only new endpoint
is the read-only `/api/context`.

## 6. Testing

- `ControlRail.test.tsx`: renders grouped entries from a stub status; clicking the
  Live entry calls `setLiveOpen(true)`; a failed status field renders `—`.
- `useTelosStatus.test.ts`: assembles a `TelosStatus` from stubbed api reads;
  one failing read doesn't break the others.
- Server `/api/context` route test: returns non-empty markdown for a fixture graph.
- `ContextPanel.test.tsx`: renders the brief; closed renders nothing.
- App test updated for the relayout (toggles now in the rail).

## 7. Out of scope / sequencing

- No long-running actions (enrich/scan/forge) triggered from the UI.
- No new views beyond Map (the rail leaves a slot for them).
- Independent of npm packaging; should land **before the marketing push** since
  it's the tool's face. Build as its own focused session.
