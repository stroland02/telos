# Telos Activate — Implementation Plan

> Fresh session. Spec: `docs/superpowers/specs/2026-06-25-telos-activate-harness-engagement-design.md`. TDD, frequent commits.

**Goal:** `telos activate` engages the harness + installs a Claude Code statusline showing `◇ Telos engaged`.

**Global constraints:** Additive/isolated. The only file side effect is a safe
read-modify-write merge of `<repo>/.claude/settings.json` that preserves unknown
keys. `status --line` is fast (<100ms) and never throws.

---

### Task 1: harness activate module
**Files:** `packages/harness/src/activate.ts` + test; export from index.
- [ ] Test: `activate(dir)` creates `<dir>/.claude/settings.json` with a `statusLine`
  (type `command`, command contains `status --line`), preserving a pre-existing
  key; `deactivate(dir)` removes only the statusLine; re-activate is idempotent.
- [ ] Test: `statusLineText({ agents: 8, graph: true, live: true })` →
  `◇ Telos engaged · 8 agents · graph ✓ · live`; missing fields → `◇ Telos`.
- [ ] Implement `activate`/`deactivate`/`activationState`/`statusLineText` (pure
  except the JSON merge). Export. Build harness; run tests; commit.

### Task 2: CLI `activate` / `deactivate` / `status --line`
**Files:** `packages/cli/src/main.ts` (+ main.test).
- [ ] Add `runStatusLine(path)` → string (reads graph presence + `buildHarnessStatus`
  caps + best-effort server ping with short timeout). Test it returns a `◇ Telos` line.
- [ ] Commands: `activate [path]` (calls harness.activate, prints what was written +
  missing-install commands from `buildSetupPlan`), `deactivate [path]`,
  `status --line` (prints `runStatusLine`). Register; "is registered" tests.
- [ ] Build CLI; smoke `telos activate <tmp>` writes settings.json; commit.

### Task 3: server endpoint + web Activate toggle
**Files:** `packages/server/src/server.ts` (+ test), `apps/web` client/rail.
- [ ] `POST /api/activate` → runs activate/deactivate for `provider.repoRoot`,
  returns `activationState`. Test returns the state shape.
- [ ] Web: `client.activate(deactivate?)`, an **Activate** toggle in the rail that
  reflects engaged state (statusline present). Mirror types. Web test for the toggle.
- [ ] Build; full gate; commit.

### Task 4: verify against Claude Code docs + live smoke
- [ ] Confirm the `statusLine` settings.json shape via the Claude Code docs
  (use the claude-code-guide agent or WebFetch). Adjust if needed.
- [ ] `telos activate .` in this repo, open a Claude Code session here, confirm the
  statusline renders `◇ Telos engaged …`. `telos deactivate .` removes it.
- [ ] Final gate green; commit; update memory.
