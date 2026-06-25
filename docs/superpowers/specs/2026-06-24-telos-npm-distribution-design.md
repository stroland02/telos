# Telos npm Distribution — Design Spec

**Date:** 2026-06-24
**Status:** Approved (user chose npm publish; name `telos` confirmed available)
**Author:** Sebastian Roland + Claude

---

## 1. Goal

Make Telos installable in one command: `npm i -g telos` (or `npx telos`), so a
developer gets the `telos` CLI — scan, serve (the visual map), MCP, context,
harness, the overlays — with zero monorepo checkout.

## 2. Distribution shape

**One unscoped published package: `telos`** (verified available on npm).
The pnpm workspace stays as the dev layout; publishing produces a single
self-contained package — we do NOT publish the six `@telos/*` packages.

### What ships in the tarball (`files`)
- `dist/` — the bundled CLI (entry `dist/main.js`, shebang, `bin: { telos }`)
- `grammars/` — `tree-sitter-*.wasm` (loaded at runtime by web-tree-sitter)
- `languages/` — every `lang.json` + `extract.scm` + `layer-hints.json`
- `web/` — the built `apps/web/dist` SPA that `telos serve` serves
- `README.md`, `LICENSE`

### Bundling
Bundle the CLI + the pure-TS workspace deps (`@telos/engine|server|mcp|harness|forge`)
into `dist/` with **tsup/esbuild** (esm, target node20). Keep as **external**
real npm `dependencies` (declared in the published package.json), because they
are native or load their own assets:
- `better-sqlite3` (native addon — cannot be bundled)
- `web-tree-sitter` (loads `.wasm` at runtime)
- `fastify`, `@fastify/static`, `commander`, `open`,
  `@modelcontextprotocol/sdk` (heavy / have their own resolution)

## 3. The main risk: asset path resolution

Today the engine/server resolve assets via `import.meta.url` relative paths
(`../../grammars`, `../../languages`, the web `dist`). After bundling into a flat
`dist/main.js`, those relative offsets change. **The plan must add a single
`assetRoot` resolver** (package root, found from the bundle location) and route
all three asset lookups (grammars, languages, web dist) through it. This is the
one place that needs care and an explicit smoke test.

## 4. Verification (must pass before publish)
- `npm pack` → install the tarball in a clean temp dir (no workspace).
- From there: `telos --help`, `telos scan <small fixture>` (writes graph.db),
  `telos context` (renders), `telos serve` → GET `/api/health` + `/api/overview`
  → confirm the **web SPA loads** (the asset-path risk).
- CI gate unchanged; add a `pack-smoke` job later if desired.

## 5. What needs the user (credentials)
- An **npm account** + `npm login` (2FA token at publish). Like the GitHub
  `workflow` scope, the actual `npm publish` is the user's keystroke; everything
  up to and including `npm pack` verification is automatable.
- Decide the initial **version** (suggest `0.1.0`) and license (suggest MIT).

## 6. Out of scope
- Publishing the individual `@telos/*` packages.
- Homebrew / Scoop / standalone binaries (later, if demand).
- Auto-publish from CI (manual first release; automate once stable).
