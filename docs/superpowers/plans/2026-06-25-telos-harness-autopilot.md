# Telos Harness Autopilot — Implementation Plan

> Fresh session. Spec: `docs/superpowers/specs/2026-06-25-telos-harness-autopilot-design.md`. TDD, frequent commits.

**Goal:** Select harnesses (persisted) + a UserPromptSubmit hook that routes every prompt to the right curated capability.

**Global constraints:** Additive/isolated. Settings-file writes preserve existing
keys/hooks. `route --hook` is fast (<100ms) and never throws (empty output ⇒ never
blocks a prompt). Plugin enablement is guided (managed-only auto-enable).

---

### Task 1: harness config (selection, persisted)
**Files:** `packages/harness/src/config.ts` (+ test); export.
- [ ] Test: `readConfig(dir)` defaults to `{ enabled: [] }`; `writeConfig`/`setEnabled`
  round-trip to `.telos/harness.config.json`; enable/disable mutate the set.
- [ ] Implement; export. Build; commit.

### Task 2: routeForHook
**Files:** `packages/harness/src/router.ts` (or `hook.ts`) + test.
- [ ] Test: `routeForHook("optimize the slow query", ["ecc"])` returns a string
  containing the perf/db capability id; unknown/empty prompt → `""`; sources filter
  applies (a disabled source's intents don't appear).
- [ ] Implement: `routePrompt` filtered to enabled sources → a one-line
  `Telos: for this task use a, b.` (or "" if none). Export. Commit.

### Task 3: extend activate with the UserPromptSubmit hook
**Files:** `packages/harness/src/activate.ts` (+ test).
- [ ] Test: `activate(dir, {hookCommand})` writes BOTH `statusLine` and a
  `hooks.UserPromptSubmit[].hooks[]` command, preserving a pre-existing unrelated
  hook; `deactivate` removes only Telos's statusLine + UserPromptSubmit entry.
- [ ] Implement the merge (identify Telos's hook by a `route --hook` marker in the
  command). `statusLineText` gains an optional `harnesses` count. Commit.

### Task 4: CLI — `route --hook`, `harness --enable/--disable`
**Files:** `packages/cli/src/main.ts` (+ test).
- [ ] `telos route --hook`: read stdin JSON (`{ prompt }`), print `routeForHook`
  using the repo's `harness.config.json` enabled set. Test: piping a prompt prints a line.
- [ ] `telos harness --enable <list>`/`--disable <list>`: mutate config, print active set + any `/plugin` enable commands for newly-selected harnesses. Test registered + mutation.
- [ ] `activate` passes `hookCommand = node <self> route --hook`. Build CLI; smoke
  `echo '{"prompt":"optimize slow query"}' | telos route --hook`. Commit.

### Task 5: web — per-harness toggles
**Files:** `packages/server/src/server.ts` (+ test), `apps/web` HarnessPanel/client.
- [ ] `POST /api/harness/select` (`{ source, enabled }`) → updates config, returns it;
  `GET /api/harness` extended with the enabled set. Test the route.
- [ ] HarnessPanel: a toggle per installed harness (calls the endpoint); shows enabled
  state + the `/plugin` command when a selected harness isn't installed. Web test.
- [ ] Build; full gate; commit.

### Task 6: verify + final gate
- [ ] Verify the exact `UserPromptSubmit` hook stdin/stdout contract against the
  Claude Code hooks docs (`code.claude.com/docs/en/hooks`); adjust `route --hook`
  parsing/output if needed.
- [ ] `telos activate .`, open a Claude Code session here, submit a prompt, confirm
  Telos injects the routing line + the statusline shows the harness count.
- [ ] Full gate green; commit; update memory.
