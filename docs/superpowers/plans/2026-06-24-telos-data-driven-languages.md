# Data-Driven Language Registry + `telos add-language` — Implementation Plan

> **For agentic workers:** TDD, frequent commits. Steps use checkbox syntax.

**Goal:** Replace hand-edited registry maps with auto-discovered `lang.json`
manifests, and add `telos add-language` to scaffold a language folder.

**Architecture:** `registry.ts` reads every `languages/*/lang.json` at module
load and builds the same-shaped exports it has today, so the 4 consumers
(walker/parser/extractor/resolver) are untouched. CLI gets a scaffold command.

**Tech Stack:** TypeScript ESM, Node fs (sync), commander, vitest.

## Global Constraints

- Public registry exports keep their exact current shapes/types.
- Behavior-preserving: existing engine suites pass unchanged.
- Malformed `lang.json` throws with the path; missing manifest = skip folder.
- Scaffold refuses to clobber an existing folder.

---

### Task 1: Manifests + discovery (engine)

**Files:**
- Create: `packages/engine/languages/typescript/lang.json`,
  `languages/javascript/lang.json`, `languages/python/lang.json`
- Modify: `packages/engine/src/languages/registry.ts`
- Test: `packages/engine/src/languages/registry.test.ts`

- [ ] **Step 1:** Write the 3 `lang.json` files (per spec §3).
- [ ] **Step 2:** Write `registry.test.ts`: discovers 3 languages; ext maps
  (`.tsx`→typescript, `.js`→javascript, `.py`→python); `extractQueryPath("javascript")`
  ends with `typescript/extract.scm`; malformed manifest throws with path.
- [ ] **Step 3:** Run it — expect FAIL (discoverLanguages undefined).
- [ ] **Step 4:** Rewrite `registry.ts` to discover + build maps; keep
  `EXTENSION_LANGUAGE`/`LANGUAGE_GRAMMAR`/`SUPPORTED_EXTENSIONS`/`extractQueryPath`
  exports; add `LangManifest`, `discoverLanguages`, `LANGUAGE_MANIFESTS`.
- [ ] **Step 5:** Run `registry.test.ts` + the full engine suite — all green.
- [ ] **Step 6:** Commit.

### Task 2: Export discovery from engine index

**Files:** Modify `packages/engine/src/index.ts`

- [ ] **Step 1:** Add `export { discoverLanguages, LANGUAGE_MANIFESTS } from "./languages/registry.js"; export type { LangManifest } from "./languages/registry.js";`
- [ ] **Step 2:** `pnpm --filter @telos/engine build` — green. Commit.

### Task 3: `add-language` scaffold (CLI)

**Files:**
- Create: `packages/cli/src/add-language.ts`
- Test: `packages/cli/src/add-language.test.ts`
- Modify: `packages/cli/src/main.ts`

**Interfaces:**
- Produces: `addLanguage(opts: { id: string; extensions: string[]; grammar?: string; aliasOf?: string; dir: string }): { created: string[] }` — writes `lang.json` (+ `extract.scm`, `layer-hints.json` unless `aliasOf`); throws if `<dir>/<id>` exists.

- [ ] **Step 1:** Write `add-language.test.ts`: against a temp `--dir`, creates
  `<id>/lang.json` with the right extensions+grammar; creates `extract.scm` stub;
  second call throws; with `aliasOf` no `.scm` is written.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement `add-language.ts` (mkdir, refuse-if-exists, write files,
  return created paths).
- [ ] **Step 4:** Run the test — green.
- [ ] **Step 5:** Register `program.command("add-language <id>")` in `main.ts`
  with `--ext`, `--grammar`, `--alias-of`, `--dir` (default = engine languages dir);
  prints created files + manual next-steps.
- [ ] **Step 6:** Build CLI + run cli suite — green. Commit.

### Task 4: Full-suite gate

- [ ] **Step 1:** `pnpm build && pnpm typecheck && pnpm lint && pnpm -r --workspace-concurrency=1 exec vitest run` — all green.
- [ ] **Step 2:** Smoke: `telos add-language ruby --ext .rb --dir <tmp>` creates a
  discoverable folder; re-run refuses. Commit if anything changed.
