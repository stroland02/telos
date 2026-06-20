# Telos, the Code Sentinel — Design Spec

**Date:** 2026-06-19
**Status:** Approved (MVP / v1 scope)
**Author:** Sebastian Roland + Claude (brainstorming session)

---

## 1. Summary

Telos is a **local-first tool that scans any codebase and renders a sleek, navigable
visual map of its software architecture** — how the system is structured, how its parts
relate, and where responsibilities live. It is designed to help engineers understand and
maintain unfamiliar or large codebases rapidly, through a modern visual interface.

The v1 (this spec) scope is **universal static analysis + visualization**: no LLM, no
runtime monitoring. The architecture is deliberately built so that two future phases drop
in cleanly:

- **Phase 2 — Sentinel goes live:** OpenTelemetry runtime ingest animates real traffic,
  latency, and errors on the static map. *(The flagship differentiator.)*
- **Phase 3 — Semantic brain:** an LLM enrichment pass adds summaries, accurate
  architectural layers/business domains, guided tours, and "where does X happen?" Q&A.

Each phase is its own spec → plan → build cycle. **This spec covers v1 only.**

### Goals

- Scan *any* codebase (polyglot, any of 305+ languages) and produce a structural graph.
- Render that graph as a **semantic-zoom** visual map that stays fluid on huge repos.
- Be **local-first**: private, fast, zero external dependencies, single portable graph file.
- Make adding a new language a **data change, not a code change**.

### Non-Goals (v1)

- LLM-based semantic understanding (Phase 3).
- Live runtime / OpenTelemetry monitoring (Phase 2).
- Hosted SaaS / multi-user / auth (form factor is local web app + CLI).
- IDE extension (browser dashboard only for v1).
- Perfect resolution of dynamic dispatch / reflection / DI (known static-analysis limit;
  edges are marked `resolved: false` when uncertain rather than guessed).

---

## 2. Form Factor & User Flow

Local CLI that indexes a repo and serves a browser dashboard.

```
$ telos scan ./my-repo     # parse + build the graph (local, fast, private)
$ telos serve              # opens browser → the living map
$ telos add-language <id>  # scaffold a new language mapping
```

Artifacts live in a `.telos/` directory inside the scanned repo (`.telos/graph.db`),
which is portable and shareable.

---

## 3. High-Level Architecture

An 8-stage pipeline. **Stages 1–6 are language-agnostic** — they never know which language
they are processing. Only Stage 3's per-language query files are language-specific.

```
┌─────────────┐   ┌──────────────┐   ┌───────────────┐   ┌────────────┐
│ 1. Walker   │ → │ 2. Parser    │ → │ 3. Extractor  │ → │ 4. Resolver│
│ find files, │   │ tree-sitter  │   │ UAST mapping  │   │ cross-file │
│ detect lang │   │ WASM → AST   │   │ (.scm queries)│   │ edges,     │
│ respect     │   │              │   │ → universal   │   │ layer      │
│ .gitignore  │   │              │   │   schema      │   │ grouping   │
└─────────────┘   └──────────────┘   └───────────────┘   └─────┬──────┘
                                                               ↓
┌─────────────┐   ┌──────────────┐   ┌───────────────┐   ┌────────────┐
│ 8. Web UI   │ ← │ 7. API server│ ← │ 6. Aggregator │ ← │ 5. Graph   │
│ sleek map,  │   │ local HTTP   │   │ hierarchy +   │   │ store      │
│ semantic    │   │ graph queries│   │ layout +      │   │ SQLite+FTS │
│ zoom        │   │              │   │ metrics       │   │ + watcher  │
└─────────────┘   └──────────────┘   └───────────────┘   └────────────┘
```

### Stage responsibilities

1. **Walker** — recursively find source files. Respect `.gitignore`, skip build artifacts,
   `node_modules`, vendored deps, binary and >1 MB files. Detect language by extension.
   *Depends on:* filesystem. *Output:* list of `{path, language}`.
2. **Parser** — load the correct tree-sitter WASM grammar and parse each file to an AST.
   *Depends on:* `web-tree-sitter`, grammar `.wasm`. *Output:* AST per file.
3. **Extractor** — run the language's `extract.scm` tree-sitter query against the AST to map
   language-specific nodes onto the **universal schema** (symbols + intra-file edges).
   *Depends on:* the per-language query file. *Output:* universal nodes + raw edges.
4. **Resolver** — resolve cross-file references: imports → source files, calls →
   definitions, inheritance chains. Assign heuristic architectural `layer`. Mark edges
   `resolved: true/false`. *Output:* fully-linked universal graph.
5. **Graph store** — persist nodes/edges in SQLite (+ FTS5 for search). A file watcher
   fingerprints files and triggers incremental re-index of only changed files.
6. **Aggregator** — build the navigable hierarchy (layer → module/folder → file → symbol),
   compute layout positions and metrics (fan-in/out, complexity) for each zoom level.
7. **API server** — local HTTP (Fastify) exposing graph queries the frontend needs
   (subgraph by zoom level, node detail, search).
8. **Web UI** — React + React Flow semantic-zoom map.

**Extensibility is the core invariant:** adding a language touches only Stage 3 (a new
folder of data). Everything else is untouched.

### Incremental updates

The watcher (chokidar) hashes files; on change it re-runs stages 2–6 for affected files
only, so re-scans are near-instant.

---

## 4. Universal Data Model

All stages after parsing speak this one schema, regardless of source language.

### Nodes (symbols)

| Field | Description |
|---|---|
| `id` | Stable hash of (path + fully-qualified name) |
| `kind` | `module` \| `file` \| `class` \| `function` \| `method` \| `interface` \| `variable` |
| `name` | Short name |
| `qualified_name` | Fully-qualified name |
| `language` | `python`, `typescript`, … (label only; no logic branches on it) |
| `path` | File path |
| `line_start`, `line_end` | Location |
| `layer` | `api` \| `service` \| `data` \| `ui` \| `infra` \| `util` (heuristic in v1) |
| `fan_in`, `fan_out` | Edge counts |
| `lines`, `complexity` | Metrics |
| `summary` | `null` in v1 — **reserved for Phase 3 LLM enrichment** |

### Edges (relationships)

| Field | Description |
|---|---|
| `source_id` → `target_id` | Endpoints |
| `kind` | `calls` \| `imports` \| `inherits` \| `implements` \| `contains` \| `references` |
| `resolved` | `true`/`false` — was the target confidently resolved? |

### Storage

- **SQLite** via `better-sqlite3`, with **FTS5** for instant fuzzy symbol search.
- Single file: `.telos/graph.db`. Zero-config, local, portable, shareable.

### Heuristic layer assignment (v1)

Path/name patterns + fan-in/out, e.g. `*/controllers/*` & `*Controller` → `api`;
`*Service` → `service`; `*/models/*`, `*/repositories/*` → `data`; `*.tsx`, `*/components/*`
→ `ui`; `*/utils/*` → `util`. Per-language overrides via optional `layer-hints.json`.
The `layer` and `summary` fields already exist in the schema, so the Phase 3 LLM pass
*enriches* without any migration.

---

## 5. Visualization (Semantic Zoom)

The hard problem: real repos have 10k–100k+ symbols; you cannot render them all. Solution
is **semantic zoom**, like Google Maps:

- **Zoomed out:** architectural **layers/domains** as large clusters (~a dozen shapes).
- **Mid zoom:** **modules / folders** within a layer.
- **Zoomed in:** **files**, then individual **functions/classes** with call edges.

Only what is on screen at the current zoom level is rendered, so it stays fluid at any repo
size. Visual encoding: node size = importance (fan-in/out), edges = calls/imports, color =
layer/language. Clicking a node opens a side panel with source, callers, callees, metrics
(and, later, summary).

**Rendering tech:** **React + React Flow** with custom nodes for the polished semantic-zoom
experience. Because of aggregation we never render more than ~1k nodes at once, so React
Flow's node-count ceiling never bites. A WebGL deep-dive layer (Sigma.js/Cosmograph) is a
possible later addition but is **out of scope for v1**.

---

## 6. Tech Stack

One language end-to-end: **TypeScript**.

| Layer | Choice | Why |
|---|---|---|
| CLI + engine | Node + TypeScript (`commander`) | One language; strong tree-sitter bindings |
| Parsing | `web-tree-sitter` (WASM grammars) | 305+ languages, no native compile |
| Storage | `better-sqlite3` + FTS5 | Local, fast, single-file |
| Watcher | `chokidar` | Incremental re-index |
| API | `Fastify` | Lightweight local HTTP |
| Frontend | React + Vite + TypeScript | Modern, fast HMR |
| Rendering | React Flow + semantic zoom | Approved direction |
| Monorepo | pnpm workspace | Clear package boundaries |
| Tests | Vitest (unit/integration), Playwright (UI) | — |

### Monorepo layout

```
telos/
  packages/
    engine/        # stages 1–6: walker, parser, extractor, resolver, store, aggregator
    cli/           # commander CLI: scan, serve, add-language
    server/        # Fastify API (stage 7)
  apps/
    web/           # React + React Flow dashboard (stage 8)
  languages/       # per-language mapping data (the extensibility contract)
    typescript/
      grammar.wasm
      extract.scm
      layer-hints.json
    python/  go/  rust/  java/  csharp/  ruby/  php/  c/  cpp/  swift/  kotlin/
  fixtures/        # tiny sample repos per language for golden-file tests
```

### The extensibility contract

Adding a language is a **data change, not a code change**. Each language is one folder:

```
languages/<lang>/
  grammar.wasm          # from tree-sitter-language-pack
  extract.scm           # maps this language's AST nodes → universal kinds
  layer-hints.json      # optional path/name → layer rules
```

The engine auto-discovers these folders. **v1 ships ~12 mappings** (TS/JS, Python, Go,
Rust, Java, C#, Ruby, PHP, C/C++, Swift, Kotlin) — covering ~95% of real repos — plus a
`telos add-language` scaffold command for the rest.

---

## 7. Testing & Build

- **TDD throughout.** Each pipeline stage is independently testable with fixture repos.
- **Golden-file tests:** a tiny sample repo per language in `fixtures/`; assert the
  extracted universal graph matches a checked-in snapshot. This *proves* universal
  adaptivity and catches regressions when adding languages.
- **Vitest** for unit/integration; **Playwright** for the web UI (semantic zoom, search,
  node panels).
- **CI gate:** lint + typecheck + tests green before any merge.

---

## 8. Roadmap

| Phase | Scope | Enabled by v1 design |
|---|---|---|
| **v1 (this spec)** | Universal static graph + sleek semantic-zoom map, CLI + local web | — |
| **Phase 2 — Sentinel goes live** | OpenTelemetry ingest → animate real traffic/latency/errors on the map | API server + node IDs map cleanly to OTel span names |
| **Phase 3 — Semantic brain** | LLM pass fills `summary`, accurate layers/domains, guided tours, Q&A | `layer`/`summary` fields already in schema |

---

## 9. Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Cross-file resolution accuracy (dynamic dispatch, DI, reflection) | Mark uncertain edges `resolved: false`; never fabricate. LSP-based precision is a later enhancement. |
| Rendering performance on huge repos | Semantic-zoom aggregation: never render >~1k nodes at once. |
| Per-language query files drifting / breaking | Golden-file fixture tests per language in CI. |
| Grammar availability / loading | Use prebuilt WASM grammars from tree-sitter-language-pack. |
| Scope creep into Phase 2/3 | Schema reserves `layer`/`summary`; phases are separate spec cycles. |

---

## 10. References

- CodeGraph — https://github.com/colbymchenry/codegraph
- Understand-Anything — https://github.com/Egonex-AI/Understand-Anything
- tree-sitter-language-pack (306 langs) — https://github.com/kreuzberg-dev/tree-sitter-language-pack
- Codebase-Memory (arXiv) — https://arxiv.org/html/2603.27277v1
- YASA Unified AST (arXiv) — https://arxiv.org/html/2601.17390v2
- Polyglot AST research — https://inria.hal.science/hal-04077663/document
