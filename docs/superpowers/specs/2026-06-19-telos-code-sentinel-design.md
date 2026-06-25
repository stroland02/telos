# Telos, the Code Sentinel — Design Spec

**Date:** 2026-06-19
**Status:** Approved (MVP / v1 scope) — **language scope amended 2026-06-24, see below**
**Author:** Sebastian Roland + Claude (brainstorming session)

---

## Implementation Status (amended 2026-06-24)

The original §6 promised "~12 language mappings" in v1. **As built, the engine
ships two language families: TypeScript/JavaScript and Python.** This was a
deliberate narrowing — depth over breadth — and is now the *official* v1 scope:

- **Shipped languages:** TypeScript, JavaScript (TS grammar), Python. Each is a
  `languages/<id>/` folder (`extract.scm` + `layer-hints.json`) plus a grammar
  `.wasm` under `packages/engine/grammars/` and an entry in
  `packages/engine/src/languages/registry.ts`.
- **The extensibility on-ramp** (`telos add-language`) is the path to the
  remaining languages (Go, Rust, Java, C#, Ruby, PHP, C/C++, Swift, Kotlin).
  Each is added incrementally as a folder + grammar, not a rewrite.
- **Known gap vs. the original "data change, not a code change" promise:** the
  registry maps (`EXTENSION_LANGUAGE`, `LANGUAGE_GRAMMAR`) are currently
  hand-edited, so adding a language touches one small code file in addition to
  the data folder. Making the registry auto-discover `languages/` folders is the
  work that fully realizes the original invariant; `telos add-language`
  scaffolds the folder and prints the remaining wiring steps.

Everything downstream of extraction (resolver, store, aggregator, API, web, MCP,
overlays) is already language-agnostic, so new languages light up the whole
product with no further work. The §6/§8 text below is the original design intent;
this section is the source of truth for current coverage.

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

> **Amended 2026-06-24:** v1 ships **3** of these (TS, JS, Python); the rest are the
> `telos add-language` backlog. See "Implementation Status" at the top of this doc.

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
| **Phase 1.5 — Telos for Agents (MCP) + Harness Fusion** | Expose `graph.db` as an MCP server (`explore`/`callers`/`callees`/`impact`/`affected`) so AI agents stop blindly grepping — the *measurable* cost-saving pillar. Plus the orchestrate-and-curate harness fusion that bundles ECC + Superpowers for the installing developer. **Full design: [`2026-06-21-telos-agent-layer-and-harness-fusion-design.md`](./2026-06-21-telos-agent-layer-and-harness-fusion-design.md).** | Same `graph.db` artifact CodeGraph serves; thin adapter, zero new engine work |
| **Phase 2 — Sentinel goes live** | OpenTelemetry ingest → animate real traffic/latency/errors on the map; process-level monitoring (see §8.1) | API server + node IDs map cleanly to OTel span names |
| **Phase 3 — Semantic brain** | LLM pass fills `summary`, accurate layers/domains, dependency-ordered guided tours, business-domain view, "where does X happen?" Q&A (features named from Understand-Anything) | `layer`/`summary` fields already in schema |
| **Phase 3-lite (optional, near-term)** | Non-LLM human-value wins: dependency-order tour scaffold, diff/impact view, shareable graph export | Aggregator already computes dependency order + metrics |
| **Phase 4 — Telos Forge (beta vision)** | Visual-first construction: build software by composing the architecture map; round-trip to code (see §8.2) | Universal bidirectional graph is the same model; nodes/edges become editable authoring primitives |

### 8.1 Phase 2 Deep-Dive — Live Monitoring Strategy (reference capture)

*Forward-looking notes for Phase 2; not part of the v1 build. Captured here so v1
decisions stay compatible with them.*

The flagship "Sentinel goes live" experience combines two complementary signal sources,
both animated on top of the static architecture map:

**A. Application-level observability (cross-platform, language-agnostic).**
The app emits **OpenTelemetry** traces/metrics/logs; Telos ingests them and lights up the
graph: edges pulse with live call traffic, nodes heat-map by latency/throughput, errors
flash on the responsible node, and a trace can be "played back" as a path through the map.
Strategies drawn from current developer tooling:

- **Distributed tracing** (Jaeger / Grafana Tempo style) — follow one request across
  services; map each span to a graph node via span name → `qualified_name`.
- **Continuous profiling + flame graphs** (Pyroscope, py-spy style) — overlay "hot path"
  intensity on the call graph so the most-executed code is visually obvious.
- **APM live resource views** (Datadog style) — real-time CPU/memory/throughput per
  service/node, plus live container/process panes.
- **Metrics + logs** (Prometheus/Grafana Mimir + Loki style) — time-series per node;
  click a node to see its recent logs.

**B. Process / OS-level monitoring ("advanced Task Manager" class — the "pro tools" the
user described).** For locally-running systems, complement traces with OS-level process
telemetry, modeled on:

- **Sysinternals Process Explorer** — hierarchical **process tree** (not a flat list),
  per-process CPU/memory, open **handles** and **DLLs**, color-coding by state. Telos maps
  running processes/services back to the codebase modules that produced them.
- **Sysinternals Process Monitor** — real-time file/registry/process/thread activity with
  full thread stacks and non-destructive filtering.
- **System Informer** (ex-Process Hacker) — live CPU/memory/I/O/GPU, thread & handle
  detail, **open-source** (BSD/MIT components) — the **reference implementation Telos
  should learn from / interop with** for the advanced process overlay.
- **Process Lasso** — process priority/affinity control, ProBalance, watchdog (free for
  personal use; closed source — design inspiration only).
- **Task Manager DeLuxe** — CPU/disk/RAM/GPU graphs, Autoruns, I/O tracking (free).

Of these, **System Informer is the only fully open-source option**, so it is the primary
OSS opportunity for the Phase 2 process overlay; the others are design references.

**Windows-native instrumentation worth implementing** (for deep local monitoring on
Windows hosts):

- **ETW (Event Tracing for Windows)** — low-overhead kernel/user event stream.
- **Windows Performance Toolkit (WPA/xperf)** and **PerfView** — CPU sampling, stacks,
  ETW capture and analysis.
- **PerfMon performance counters** — per-process/per-thread resource counters.

**Design implication for v1 (kept compatible now):** the universal node `id` and
`qualified_name` are the join keys for *both* OTel span names and process/thread stack
frames, so no schema change is needed when Phase 2 lands. The local API server is the
natural ingest endpoint for these live feeds.

### 8.2 Phase 4 Deep-Dive — Telos Forge: visual-first construction (beta vision)

*Far-horizon vision captured for future brainstorming only. NOT specced, NOT scheduled,
and explicitly out of scope for v1–v3. Recorded here so today's data model stays
philosophically compatible with it.*

The thesis: once Telos can faithfully *render* any system as a universal graph, the same
graph can become the surface on which systems are *authored*. Instead of writing code and
reading it back as a diagram, the developer **constructs the diagram and Telos materializes
the code** — a visual, node-and-flow way of building software, the way this very project is
being designed (architecture-first, then implementation).

Sketch of what that could mean:

- **Bidirectional graph.** Today the pipeline is code → graph. Phase 4 adds graph → code:
  editing a node/edge on the canvas generates or rewrites the corresponding source, and
  code edits continue to reflect back into the canvas. The universal node `id` /
  `qualifiedName` are the anchor for round-tripping.
- **Composable building blocks.** Drag components, services, data stores, and flows onto
  the map; wire them together; pick implementations per node (language, framework). Telos
  scaffolds files, signatures, and wiring from the visual structure.
- **Intent over syntax.** The developer expresses *what connects to what* and *what each
  unit does*; generation (likely LLM-assisted, building on Phase 3) fills in idiomatic
  code, with the human reviewing/refining at the node level.
- **Live + visual + authored, unified.** Combined with Phase 2, you would *watch* the
  system you visually *built* run in real time on the same canvas.

Open questions for the future brainstorm (deliberately unanswered now): how to keep
generated and hand-written code reconciled without churn; how much is generated vs.
templated vs. hand-authored; the granularity of visual primitives; and guardrails so the
visual layer never hides critical behavior. These are Phase 4's problems, not v1's — listed
so the eventual design starts from an honest problem statement.

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

### Telos sub-specs (later phases)

- Phase 1.5 — Agent layer (MCP) + Harness fusion — [`2026-06-21-telos-agent-layer-and-harness-fusion-design.md`](./2026-06-21-telos-agent-layer-and-harness-fusion-design.md)
- Industry-standard OSS adoption sweep — [`2026-06-21-telos-industry-standard-oss-adoption.md`](./2026-06-21-telos-industry-standard-oss-adoption.md)

### External

- CodeGraph — https://github.com/colbymchenry/codegraph
- Understand-Anything — https://github.com/Egonex-AI/Understand-Anything
- CodeViz — https://www.codeviz.ai/
- ECC harness — https://github.com/affaan-m/ECC · Superpowers — https://github.com/obra/superpowers · Headroom — https://github.com/chopratejas/headroom
- tree-sitter-language-pack (306 langs) — https://github.com/kreuzberg-dev/tree-sitter-language-pack
- Codebase-Memory (arXiv) — https://arxiv.org/html/2603.27277v1
- YASA Unified AST (arXiv) — https://arxiv.org/html/2601.17390v2
- Polyglot AST research — https://inria.hal.science/hal-04077663/document

### Phase 2 monitoring references

- Sysinternals Process Explorer — https://learn.microsoft.com/en-us/sysinternals/downloads/process-explorer
- Sysinternals Process Monitor — https://learn.microsoft.com/en-us/sysinternals/downloads/procmon
- System Informer (ex-Process Hacker) — https://en.wikipedia.org/wiki/Process_Explorer
- OpenTelemetry — https://opentelemetry.io/
- Pyroscope continuous profiling — https://uptrace.dev/tools/continuous-profiling-tools
- Observability platforms 2026 overview — https://guptadeepak.com/tools/top-5-observability-platforms-2026/
