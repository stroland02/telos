# Telos npm Distribution — Implementation Plan

> Execute in a FRESH session. Spec: `docs/superpowers/specs/2026-06-24-telos-npm-distribution-design.md`.
> TDD where testable; the asset-path work is verified by a packed-tarball smoke, not a unit test.

**Goal:** `npm i -g telos` installs a working `telos` CLI (scan/serve/mcp/context/harness/overlays).

**Global constraints:** One unscoped package `telos`, v0.1.0, MIT. Keep the pnpm
workspace as the dev layout. Native/heavy deps stay external (`better-sqlite3`,
`web-tree-sitter`, `fastify`, `@fastify/static`, `commander`, `open`,
`@modelcontextprotocol/sdk`). All existing gates stay green.

---

### Task 1: single asset-root resolver (THE risk — do first)

**Problem:** engine/server resolve `grammars/`, `languages/`, and the web `dist`
via `import.meta.url` relative offsets that break once bundled into a flat
`dist/main.js`.

**Files:** `packages/engine/src/assets.ts` (new) + test; update the 3 call sites.

- [ ] Create `assetRoot(): string` — resolves the package root by walking up from
  `import.meta.url` to the dir containing `grammars/` (and honoring an
  optional `TELOS_ASSET_ROOT` env override for the bundled layout).
- [ ] Add `grammarsDir()`, and have `registry.ts` `LANGUAGES_DIR` + the parser's
  grammar load + the server's web-static dir all derive from it.
- [ ] Test: `assetRoot()` finds the dir containing `grammars/`; env override wins.
- [ ] Run engine + server suites — still green (paths unchanged in dev layout).
- [ ] Commit.

### Task 2: tsup bundle for the CLI

**Files:** `packages/cli/tsup.config.ts` (new), `packages/cli/package.json` (scripts).

- [ ] Add tsup (dev dep). Config: entry `src/main.ts`, format esm, target node20,
  `banner: { js: "#!/usr/bin/env node" }`, `external: [better-sqlite3,
  web-tree-sitter, fastify, @fastify/static, commander, open,
  @modelcontextprotocol/sdk]`, bundle the `@telos/*` workspace deps in.
- [ ] `pnpm --filter @telos/cli bundle` → `dist/main.js` runs `node dist/main.js --help`.
- [ ] Commit.

### Task 3: the publishable `telos` package

**Files:** `publish/` (new dir) OR repurpose `packages/cli` as the publish unit —
choose at execution; spec assumes a dedicated publish manifest.

- [ ] `package.json`: `name: "telos"`, `version: "0.1.0"`, `license: "MIT"`,
  `bin: { telos: "dist/main.js" }`, `type: "module"`, `engines.node >=20`,
  `dependencies` = the externals above (real versions from the lockfile),
  `files: ["dist", "grammars", "languages", "web", "README.md", "LICENSE"]`.
- [ ] `prepack` script: build all workspace packages → build `apps/web`
  (`vite build`) → bundle CLI (Task 2) → copy `grammars/`, `languages/`,
  `apps/web/dist` → `web/` into the publish dir.
- [ ] Commit.

### Task 4: packed-tarball smoke (the real verification)

- [ ] `npm pack` in the publish dir → `telos-0.1.0.tgz`.
- [ ] In a clean temp dir (outside the workspace): `npm i -g ./telos-0.1.0.tgz`
  (or local install), then:
  - `telos --help` lists all commands
  - `telos scan <a tiny sample repo>` writes `.telos/graph.db`
  - `telos context` renders the brief
  - `telos serve` → `curl /api/health` 200, `/api/overview` 200, and the
    **web SPA HTML loads** (confirms the Task-1 asset-root works bundled)
- [ ] If serve can't find `web/` or grammars → fix the asset-root (Task 1) and re-pack.
- [ ] Commit once green.

### Task 5: README + LICENSE (publish-facing)

- [ ] `README.md`: one-paragraph pitch, install (`npm i -g telos`), the 3-command
  quickstart (`telos scan . && telos serve`), the agent story (`telos mcp` +
  `telos context`), a screenshot/GIF placeholder.
- [ ] `LICENSE`: MIT, author Sebastian Roland.
- [ ] Commit.

### Hand-off to publish (USER action)
- `npm login` (the user's account + 2FA). Then `npm publish` from the publish dir.
- Tag a GitHub release `v0.1.0` after the npm publish succeeds (optional).

### Then → marketing (separate effort)
README-as-landing-page, a demo GIF of the map, a launch post. Use the marketing
skill set. Gated on a verified `npm pack`.
