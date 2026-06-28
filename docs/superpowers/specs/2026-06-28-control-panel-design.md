# Telos Control Panel — Design

**Date:** 2026-06-28
**Status:** Approved for planning
**Scope:** Web UI — consolidate background-visibility into the Harness panel. (Easy-setup is a separate, later effort.)

## Goal

Make everything Telos does in the background **legible in one place**. Fold all
harness/agent/tokenization visibility into the existing **Harness panel** (the
`⚙ Harness` sidebar button) so it becomes the single control panel:

- An **Activate toggle switch** in the panel header (replaces the standalone
  sidebar `⚡ Activate` item).
- The existing per-harness on/off list.
- Four tabs surfacing what Telos does each prompt: **Routing · Context · MCP · Impact**.

## Background: how Telos runs

Telos is not a daemon. It runs as three independent processes that never call
each other directly:

| Process              | When it runs        | Today                                  |
|----------------------|---------------------|----------------------------------------|
| `telos route --hook` | per prompt          | appends `.telos/activity.jsonl`        |
| `telos mcp`          | per Claude session  | answers graph queries (no logging)     |
| `telos serve`        | on demand           | serves the web UI + REST API           |

Because they can't call each other, they coordinate through **append-only JSONL
files under `.telos/`** that the web server reads. This is the pattern
`activity.jsonl` already uses; the design extends it rather than inventing a new
transport.

```
per prompt   → telos route --hook  → appends .telos/activity.jsonl     (EXISTS; extend)
per query    → telos mcp tool call  → appends .telos/mcp-activity.jsonl (NEW)
on demand    → telos serve          → reads both + runs measure()
web UI       → polls /api/harness/* every 4s (existing poll, extended)
```

**MCP capture decision:** JSONL file, not POST-to-server. The web server is
usually not running when the MCP server is; a file log survives that, a POST
channel would silently drop nearly every query.

## Data sources

### 1. Routing (reuse)
`.telos/activity.jsonl` already records, per routed prompt:
`{ ts, promptSnippet, intent, agents, sources }` (`packages/harness/src/activity.ts`,
written from the hook at `packages/cli/src/main.ts:738`). The **Routing tab** is
today's Activity feed (recent orchestrations + agent tally), unchanged.

### 2. Context injected (extend)
The hook already renders the injected plan block (`renderPlan`,
`main.ts:739`). Extend `ActivityEntry` with two fields:

- `injectedTokens: number` — estimated tokens of the rendered block, using the
  engine's existing chars/4 heuristic (keep consistent with `measureSavings`).
- `block: string` — the actual injected text, truncated (e.g. first ~2 KB) so the
  log stays small.

The **Context tab** shows, per prompt, exactly what Telos silently added to the
agent's context window and how many tokens it cost. Both fields are optional on
the type so old log lines and the minimal provider still parse.

### 3. MCP queries (new)
Add `.telos/mcp-activity.jsonl`. Wrap the 9 tool handlers in
`packages/mcp/src/server.ts` with a logger that appends, per call:
`{ ts, tool, argsSummary, resultTokens }` where:

- `tool` — e.g. `telos_explore`.
- `argsSummary` — a short, safe string form of the args (e.g. the query/symbol),
  truncated. No raw payloads.
- `resultTokens` — chars/4 estimate of the JSON result the agent received.

The MCP process derives the `.telos` dir from the `dbPath` it is already given in
`loadContext` (`packages/mcp/src/load.ts`). Logging is best-effort and must never
throw inside a tool handler (same guarantee as `recordActivity`).

The **MCP tab** is a live-ish stream (4s poll) of every graph query the agent made
instead of cold-reading files — the clearest "Telos is actively helping" signal.

## Token impact (headline — kept honest)

The pinned panel header shows two **measured** numbers; no invented arithmetic.

- **↓ injected** — sum of `injectedTokens` over recent prompts (what Telos adds).
- **↑ saved** — from the existing `measure()` / `GET /api/measure`: warm-start
  brief tokens vs. cold-read baseline. Already built and honest.

The **Impact tab** breaks this down:
- injected-tokens-per-prompt (simple sparkline, last N prompts),
- MCP query count + on-demand tokens served (sum of `resultTokens`),
- the `measure` ratio (brief vs cold read).

**Explicitly not** computing a per-query "tokens saved" number — that would be a
guess. Only real served/avoided figures are shown.

## Server changes

Follow the existing optional-provider-method pattern in
`packages/server/src/server.ts`:

- `GET /api/harness/mcp-activity` → new optional `getMcpActivity?(limit?)` on
  `GraphProvider`; reads `.telos/mcp-activity.jsonl`. Returns `{ entries, totals }`.
- `GET /api/harness/activity` → unchanged route; entries gain the two new optional
  fields automatically (same shape, extended type).
- `GET /api/measure` and `POST /api/activate` already exist; the panel calls them.

`GraphService` (`packages/server/src/graphService.ts`) implements the new method
by reading the JSONL from its `repoRoot`.

## UI changes

### `apps/web/src/components/HarnessPanel.tsx`
- **Header (pinned):** Telos **toggle switch** wired to `api.activate(deactivate)`
  + `api.activationState()`, the existing Refresh button, and the
  ↓injected / ↑saved impact summary.
- **Harness on/off table:** unchanged (already present).
- **Tab strip:** a `SegmentedControl` selecting `Routing | Context | MCP | Impact`,
  each rendering its own tab body. Routing reuses the current `ActivitySection`.

### `apps/web/src/components/ui` (new primitive)
- `Switch.tsx` — accessible toggle (`role="switch"`, `aria-checked`, keyboard
  operable), token-styled, no hard-coded hex. Exported from `ui/index.ts`.

### `apps/web/src/components/ControlRail.tsx`
- Delete the `⚡ Activate` `Item` (line 96) and the `engaged` / `onActivate` props
  it consumed; engagement now lives only inside the panel. `⚙ Harness` stays.
- Update `App.tsx` (and any wiring) to drop the removed props and pass
  engagement state into `HarnessPanel` instead.

### Client (`apps/web/src/api/client.ts` + `types.ts`)
- Add `mcpActivity(): Promise<McpActivityFeed>` calling the new route.
- Extend `ActivityEntry` type with optional `injectedTokens?` and `block?`.
- Add `McpActivityFeed` / `McpActivityEntry` types.

### Polling
Keep the existing 4s activity poll; extend it to also fetch mcp-activity while the
panel is open. Full harness status and `measure` stay manual-refresh (heavier).

## Testing (Vitest, matches repo)

- **harness/activity:** extended entry shape round-trips; malformed lines skipped.
- **mcp logger:** append + read round-trip; truncation; best-effort (never throws);
  derives `.telos` from dbPath.
- **server:** new `/api/harness/mcp-activity` route with a stub provider; missing
  method → empty feed.
- **HarnessPanel:** tab switching renders the right body; header toggle calls
  `api.activate`; impact numbers render from `measure` + activity.
- **ControlRail:** no longer renders an Activate item; Harness item still present.

## Out of scope (YAGNI)

- No SSE for harness signals — 4s poll is sufficient.
- No historical charts beyond a single sparkline.
- No MCP-query-to-node map overlay.
- Setup automation (`telos init`) — separate, later effort.
```
