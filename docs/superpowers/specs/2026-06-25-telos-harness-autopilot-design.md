# Telos Harness Autopilot — Always-On, Auto-Routed Harnesses

**Date:** 2026-06-25
**Status:** Approved (design + mechanism verified against Claude Code docs)
**Author:** Sebastian Roland + Claude

---

## 1. Summary

Make the curated harness **always-on and self-routing** while you develop: select
which harnesses are active, and from then on every prompt is automatically
steered to the right skill/agent — persisted per repo so it survives leaving and
returning. Builds directly on `telos activate` (statusline) + the existing
capability router.

## 2. Verified Claude Code mechanisms (this drove the design)

Confirmed against `code.claude.com/docs/en/settings`:

- **`enabledPlugins` is MANAGED-settings-only** (enterprise/admin policy) — Telos
  **cannot** auto-enable plugins from a project's `.claude/settings.json` for a
  normal install. → Plugin enablement is **guided** (Telos records the selection
  and shows the `/plugin` enable command for each selected harness).
- **`UserPromptSubmit` hook IS supported** in project `.claude/settings.json`, and
  a hook's stdout is injected as context for that prompt. → This is the per-prompt
  routing engine, fully buildable.
- **`statusLine`** is supported (already shipped).

**Consequence:** enabling a harness (one-time `/plugin` action, guided) turns on
*all* its skills/agents — the model then picks per prompt, and Telos's hook makes
that routing explicit and biased toward the curated capability.

## 3. The three parts

### A. Per-harness selection (persisted)
- `.telos/harness.config.json`: `{ enabled: ("ecc"|"superpowers"|"headroom")[] }`.
- CLI `telos harness --enable <list>` / `--disable <list>` updates it.
- Rail: per-harness on/off toggles in the Harness panel.
- On enable: if the plugin isn't installed/enabled, print the `/plugin` command
  (from `HARNESS_INSTALLS`). Selection is the source of truth; enablement is guided.

### B. Per-prompt routing hook (the engine)
- `telos activate` installs a `UserPromptSubmit` hook into `.claude/settings.json`
  (preserving existing hooks):
  ```json
  "hooks": { "UserPromptSubmit": [ { "hooks": [
    { "type": "command", "command": "node <self> route --hook" } ] } ] }
  ```
- **`telos route --hook`** reads the hook's stdin JSON, extracts the prompt, runs
  `routePrompt(prompt, PROMPT_CATALOG)` filtered to the **enabled** harnesses, and
  prints a short context line to stdout, e.g.:
  `Telos: for this task use ecc:security-reviewer, ecc:test-runner.`
  Fast (<100ms), never throws (prints nothing on error so it never blocks a prompt).
- This makes "Telos figures out which capabilities per prompt" real and visible.

### C. Persistence + lifecycle
- All state is files: `.telos/harness.config.json` (selection) + `.claude/settings.json`
  (statusline + UserPromptSubmit hook). Both are read at Claude Code startup, so
  **leave-and-return just works** — no re-engagement.
- `telos activate` = install statusline + routing hook. `telos deactivate` = remove
  both (only the entries Telos added). Engage once per repo; persistent thereafter.
- Statusline reflects the active-harness count: `◇ Telos engaged · 2 harnesses · N agents · graph ✓`.

## 4. Honest limits
- **Mid-session toggling is not possible** — settings/hooks are read at session
  start. Selecting harnesses takes effect on the next chat (or `/reload`).
- **Plugin install/enable stays a one-time manual `/plugin` step** (managed-only
  auto-enable). Telos guides it; everything after is automatic.
- The hook only *nudges* (injects a suggestion); it cannot force the model to use a
  skill. Combined with the model's own routing, this is the strongest available lever.

## 5. Components (additive, isolated)
- harness: `harnessConfig` read/write (`.telos/harness.config.json`); extend
  `activate` to also install the `UserPromptSubmit` hook; `statusLineText` gains a
  harness count.
- engine/harness: `routeForHook(prompt, enabledSources)` → the context string.
- CLI: `telos harness --enable/--disable`; `telos route --hook` (stdin→stdout).
- web: per-harness toggles in HarnessPanel + `POST /api/harness/select`.

## 6. Testing
- `harnessConfig` round-trips; `--enable`/`--disable` mutate it.
- `routeForHook("optimize the slow query", ["ecc"])` → contains the perf/db reviewer;
  empty/unknown prompt → empty string (never blocks).
- `activate` installs both statusline + UserPromptSubmit hook, preserving existing
  hooks; `deactivate` removes only Telos's.
- web: toggling a harness persists + updates the statusline count.

## 7. Out of scope
- Auto-installing/enabling plugins (managed-only; guided instead).
- Mid-session enable/disable.
- A VS Code surface (CLI statusline + rail only).
