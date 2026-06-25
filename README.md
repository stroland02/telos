<div align="center">

# ◇ Telos

### The Code Sentinel — scan any codebase into a living architecture map.

*Local-first. Visual-first. Agent-cheap. Live.*

[![CI](https://github.com/stroland02/telos/actions/workflows/ci.yml/badge.svg)](https://github.com/stroland02/telos/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-43853d.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-f69220.svg)](https://pnpm.io/)

<img src="docs/demo.gif" alt="Telos — scanning a codebase into a live architecture map" width="820"/>

</div>

---

## What is Telos?

Telos scans **any codebase** into one **universal architecture graph** and renders it as a sleek,
semantic-zoom map — how the system is structured, how its parts relate, and where responsibilities
live. It runs **entirely on your machine**: private, fast, zero external dependencies, a single
portable graph file (`.telos/graph.db`).

The same graph is consumed **many ways**:

- 🗺️ **A human map** — a dark, Google-Maps-style semantic-zoom view (layers → modules → files → symbols).
- 🤖 **Agent memory (MCP)** — expose the graph to AI agents so they stop blindly `grep`-ing — they
  query callers/callees/impact and read a token-budgeted architecture brief instead.
- 📡 **A live overlay** — pipe in OpenTelemetry traces/metrics/logs/profiles (and OS processes) to
  animate real traffic, latency, and hot paths on the static map.
- 🛠️ **A build surface (Forge)** — run a bounded agentic build loop on an isolated branch and watch
  each iteration's diff reflect onto the map.

> **Why it's different:** CodeGraph is agent-only with no visualization; Understand-Anything is
> viz + LLM but not live. **Telos is visual-first, agent-cheap, and live — on one graph.**

## ✨ Features

- **Universal static analysis** — tree-sitter parsing → a language-agnostic graph (TypeScript,
  JavaScript, Python today; `telos add-language` is the on-ramp for more).
- **Semantic-zoom map** — never renders more than ~1k nodes at once, so it stays fluid on huge repos.
- **Local & portable** — SQLite + FTS5, one `.telos/graph.db` file, no servers, no accounts.
- **Agent layer (MCP)** — 9 tools: `explore`, `callers`, `callees`, `impact`, `affected`, `ask`,
  `tour`, `recommend`, `context`.
- **Live runtime overlay** — OTLP traces / metrics / logs / profiles + an OS process view.
- **Semantic brain** — heuristic or local-LLM (Ollama) enrichment fills summaries, layers, and a
  dependency-ordered tour.
- **Harness cockpit** — orchestrate + curate ECC / Superpowers / Headroom, with drift detection.
- **Mission-control sidebar** — search, view controls, every feature, and live status in one rail.

## 🚀 Quick start

**Requirements:** Node ≥ 20, [pnpm](https://pnpm.io/) 9.

```bash
# 1. Get it
git clone https://github.com/stroland02/telos.git
cd telos

# 2. Install + build
pnpm install
pnpm build

# 3. Scan a codebase (here, Telos itself) and open the map
pnpm telos scan .
pnpm telos serve .          # → http://127.0.0.1:5180
```

That's it — `serve` opens the living map in your browser. Point `scan` at any repo:
`pnpm telos scan /path/to/your-project`.

## 🧭 Commands

| Command | What it does |
|---|---|
| `telos scan <path>` | Parse a codebase into `.telos/graph.db` |
| `telos serve [path]` | Serve the architecture map (browser UI) |
| `telos context [path]` | Print the token-budgeted architecture brief (graph-as-memory) |
| `telos mcp` | Serve the graph to AI agents over MCP (stdio) |
| `telos enrich [path] [--llm]` | Fill node summaries (heuristic, or local LLM via Ollama) |
| `telos tour [path]` | Dependency-ordered walkthrough of the codebase |
| `telos ask "<question>"` | "Where does X happen?" over the graph |
| `telos trace --demo` | Emit synthetic OTel traffic to a running server (demo the live overlay) |
| `telos top [--demo]` | Push a local process snapshot to the map |
| `telos harness [path]` | Show installed harnesses, capabilities, and drift |
| `telos forge "<intent>"` | Run a bounded agentic build loop on an isolated branch |
| `telos add-language <id>` | Scaffold a new language mapping |

Run `pnpm telos --help` for the full list.

## 🤖 For AI agents (MCP)

Point any MCP-capable client at Telos so your agent reads the architecture instead of grepping:

```bash
pnpm telos scan .
pnpm telos mcp            # stdio MCP server over .telos/graph.db
```

Start with **`telos_context`** — a single, token-budgeted brief (layers, entry points, hotspots,
key summaries) that warm-starts the agent — then drill in with `callers` / `callees` / `impact`.

## 🏗️ Architecture

An 8-stage pipeline; stages 1–6 are **language-agnostic** — only the per-language `extract.scm`
query files are language-specific. Adding a language is a *data* change, not a code change.

```
walk → parse (tree-sitter) → extract (UAST) → resolve → store (SQLite+FTS5) → aggregate → API → web
```

**Monorepo layout:**

```
packages/
  engine/   # scan pipeline: walker, parser, extractor, resolver, store, aggregator, enrich, trace
  server/   # Fastify API (graph queries + live ingest endpoints)
  cli/      # the `telos` command
  mcp/      # Model Context Protocol server over the graph
  harness/  # ECC/Superpowers/Headroom curation + drift detection
  forge/    # agentic build-loop driver
apps/
  web/      # React + React Flow semantic-zoom map (the Control Rail UI)
```

## 🗺️ Roadmap

- ✅ **v1** — universal static graph + semantic-zoom map
- ✅ **Phase 1.5** — MCP agent layer + harness fusion
- ✅ **Phase 2** — live OTel overlay (traces/metrics/logs/profiles) + OS processes
- ✅ **Phase 3** — semantic brain (enrich/tour/ask) + local-LLM enrichment
- ✅ **Phase 4 (slice 1)** — Telos Forge build loop
- 🔜 **Distribution** — `npm i -g telos`
- 🔜 **More languages** — Go, Rust, Java, … via `telos add-language`

## 🛠️ Development

```bash
pnpm build       # build all packages (tsc + vite)
pnpm test        # full workspace test suite
pnpm typecheck   # tsc --noEmit across packages
pnpm lint        # eslint
```

CI runs build → typecheck → lint → test on every push.

## 📄 License

[MIT](./LICENSE) © Sebastian Roland
