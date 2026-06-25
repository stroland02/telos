# Telos Activate — Harness Engagement + CLI Indicator

**Date:** 2026-06-25
**Status:** Approved (design confirmed by user)
**Author:** Sebastian Roland + Claude

---

## 1. Summary

One command (and a rail button) that **engages the curated harness for a project**
and makes that engagement **visible in the Claude Code CLI**. Today Telos only
*recommends* harness capabilities; `telos activate` turns that into a one-click
"Telos is on" — it bootstraps the harness and installs a **statusline** so the
terminal shows a live `◇ Telos engaged` indicator driven by Telos's real state.

**Hard reality (drives the design):** Telos runs as a separate process from the
user's Claude Code session, so it cannot flip an in-session switch. It engages by
**writing the project's `.claude/settings.json`** (which Claude Code reads) and by
**bootstrapping `.telos/harness.lock`** — both local-first file operations.

## 2. What `telos activate [path]` does

1. **Bootstrap the harness** — ensure `.telos/harness.lock` exists (reuse
   `runDoctor`); for any of ECC / Superpowers / Headroom not yet installed, print
   the exact enable commands (reuse `buildSetupPlan` / `HARNESS_INSTALLS`).
2. **Install the statusline** — merge a `statusLine` entry into
   `<repo>/.claude/settings.json` (create the file/dir if absent; preserve any
   existing keys). The statusline runs `telos status --line`.
3. Print a confirmation: what was written, the install commands for any missing
   harness, and how to undo (`telos deactivate`).

`telos deactivate [path]` removes only the `statusLine` entry Telos added (leaves
other settings untouched).

## 3. The indicator: `telos status --line`

A command that prints **one line** for the Claude Code statusline, reflecting
Telos's actual state for the repo it runs in:

```
◇ Telos engaged · 8 agents · graph ✓ · live
```

- `8 agents` = node-context capability count from the catalog (cockpit total).
- `graph ✓` / `graph —` = whether `<repo>/.telos/graph.db` exists.
- `live` = whether a Telos server is reachable (best-effort, short timeout; omit
  if not running — never blocks the prompt).

`status --line` reads the Claude Code status JSON on stdin if present (for the
cwd), is fast (<100 ms target), and never throws (prints a minimal `◇ Telos` on
any error). **The exact `.claude/settings.json` `statusLine` shape is the one
external contract — verify against the Claude Code docs during implementation
(`{ "type": "command", "command": "..." }`).**

## 4. Web surface

- Server `POST /api/activate` (body `{ deactivate?: boolean }`) → runs
  activate/deactivate for `provider.repoRoot`, returns the resulting
  `activationState` (statusline present?, harness bootstrapped?, missing installs).
- Rail **Activate** toggle (View or a new "Harness" affordance): shows engaged /
  not-engaged; clicking calls the endpoint. Reuses the existing harness status.

## 5. Components (isolated, additive)

- harness `activate.ts`: `activate(repoRoot)`, `deactivate(repoRoot)`,
  `activationState(repoRoot)`, `statusLineText(state)` — pure where possible;
  the settings-file merge is the only side effect, with a read-modify-write that
  preserves unknown keys. Tested against a temp dir.
- CLI: `telos activate|deactivate [path]`, `telos status --line`.
- server `/api/activate` + `activationState` on the provider.
- web Activate toggle.

## 6. Testing
- `activate` writes a `statusLine` into a temp `.claude/settings.json`, preserving
  pre-existing keys; `deactivate` removes only it; idempotent (re-activate is safe).
- `statusLineText` renders the engaged string from a state object; degrades to
  `◇ Telos` on missing fields.
- server `/api/activate` returns the state; web toggle reflects engaged state.

## 7. Out of scope
- A VS Code extension status-bar item (CLI statusline only this slice).
- Force-enabling already-installed plugins via an unverified settings key — if
  Claude Code exposes a supported `enabledPlugins`-style key, wire it in a
  follow-up; this slice guarantees the statusline + bootstrap + guided install.
