# Telos — Industry-Standard OSS Adoption Sweep — Design Note

**Date:** 2026-06-21
**Status:** Reference capture (sweep result) — adoption items flow into their named phases
**Author:** Sebastian Roland + Claude (research session)
**Parent spec:** [`2026-06-19-telos-code-sentinel-design.md`](./2026-06-19-telos-code-sentinel-design.md)

---

## 1. Purpose

A full sweep of the codebase + plans against the industry-standard open-source landscape,
to professionalize Telos's structure with proven building blocks instead of bespoke code.
Each adoption item names the phase it belongs to, so nothing is implemented prematurely.

*Method note:* the CTO Club code-visualization roundup (a requested source) returned HTTP
403 to automated fetch; this sweep is compiled from the established OSS landscape and the
other verified references (CodeViz, CodeGraph, Understand-Anything). Re-fetch by hand if a
canonical citation is needed.

---

## 2. What we already use (already industry-standard — keep)

| Concern | Library | Verdict |
|---|---|---|
| Graph rendering | **React Flow** (`@xyflow/react` v12) | Standard; keep for the semantic-zoom map |
| Layout | **Dagre** (`@dagrejs/dagre`) | Good to ~1k nodes; see ELK below for scale |
| Syntax highlight | **Shiki** (github-dark) | VS Code's highlighter; keep |
| Parsing | **tree-sitter** (WASM) | Canonical; keep |
| Storage / search | **better-sqlite3 + FTS5** | Local-first standard; keep |
| API | **Fastify** | Keep |
| Build | **Vite** | Keep |

Telos's foundation is already on the right standards. The sweep's value is in the
*additions* below.

---

## 3. Highest-value adoptions (by phase)

### 3.1 Engine accuracy & interoperability

| Item | What it gives us | License | Phase |
|---|---|---|---|
| **SCIP / LSIF** (Sourcegraph code-intelligence index) | Makes Telos's index *interoperable* with the broader code-intel ecosystem; the single most professionalizing move | Apache-2.0 | **Phase 1.5** (alongside MCP — same index, standard format) |
| **stack-graphs / tree-sitter-graph** (GitHub) | Precise cross-file name resolution; directly attacks the `resolved:false` accuracy risk in the parent spec §9 | MIT/Apache | **Phase 2-adjacent / resolver hardening** (incremental; raises edge precision) |
| **dependency-cruiser / Madge** | Battle-tested JS/TS dependency extraction to cross-check our resolver on JS/TS repos | MIT | **Resolver test harness** (validation, not runtime) |

### 3.2 Visualization at scale

| Item | What it gives us | License | Phase |
|---|---|---|---|
| **elkjs (Eclipse Layout Kernel)** | Better large-hierarchy layout than Dagre when clusters get big | EPL-2.0 | **Phase 3 / scale work** (swap-in behind the existing layout interface) |
| **Sigma.js / Cytoscape.js / Cosmograph** | WebGL deep-dive renderer for huge graphs (already noted as a v1 deep-dive option) | MIT/LGPL | **Deep-dive layer** (optional, post-v1) |

### 3.3 Architecture standards (from the CodeViz learning)

| Item | What it gives us | License | Phase |
|---|---|---|---|
| **C4 model / Structurizr** | Industry-standard framing for architectural layer/domain views; aligns our Phase 3 layer/domain output with what teams already expect | MIT (Structurizr Lite) | **Phase 3** (semantic layer/domain view adopts C4 vocabulary) |

### 3.4 Live monitoring (from the XDA power-tools learning)

| Item | What it gives us | License | Phase |
|---|---|---|---|
| **System Informer** (ex-Process Hacker) | The only fully **open-source** "advanced Task Manager" — reference impl to learn from / interop with for the process overlay | MIT/BSD components | **Phase 2** (process/OS-level overlay, parent spec §8.1) |
| **OpenTelemetry** | Already the planned standard for app-level runtime ingest | Apache-2.0 | **Phase 2** |
| **ETW / PerfView** | Windows kernel/user event capture for deep local monitoring | MIT (PerfView) | **Phase 2** (Windows hosts) |

### 3.5 Authoring (far-horizon)

| Item | What it gives us | License | Phase |
|---|---|---|---|
| **Monaco editor** | In-canvas code editing / IntelliSense | MIT | **Phase 4 (Forge) / Telos IDE** |

---

## 4. Licensing posture

All adoption candidates are permissive (MIT / Apache-2.0 / BSD / EPL-2.0 / LGPL). None are
copyleft-viral for our use. EPL-2.0 (elkjs) and LGPL (some renderers) are file/library-level
and compatible with a normal dependency relationship. We preserve each project's
LICENSE/NOTICE per its terms.

---

## 5. Non-goals of this sweep

- Not replacing anything that already works (React Flow, Dagre at current scale, Shiki).
- Not adopting heavyweight platforms (full Sourcegraph, CodeQL infra) — we adopt their
  *formats/algorithms* (SCIP, stack-graphs), not their servers.
- Nothing here changes v1; every item lands in a named later phase behind an existing
  interface.

---

## 6. References

- CodeViz — https://www.codeviz.ai/ (C4/UML, living docs — standards inspiration)
- SCIP — https://github.com/sourcegraph/scip
- stack-graphs — https://github.com/github/stack-graphs
- elkjs — https://github.com/kieler/elkjs
- Sigma.js — https://www.sigmajs.org/ · Cytoscape.js — https://js.cytoscape.org/
- C4 model — https://c4model.com/ · Structurizr — https://structurizr.com/
- System Informer — https://systeminformer.sourceforge.io/
- PerfView — https://github.com/microsoft/perfview
- OpenTelemetry — https://opentelemetry.io/
