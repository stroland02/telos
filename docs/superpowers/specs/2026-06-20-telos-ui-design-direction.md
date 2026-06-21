# Telos — UI Design Direction

**Date:** 2026-06-20
**Status:** Approved direction for Plan 3 (Web UI)
**Companion to:** `2026-06-19-telos-code-sentinel-design.md` (functional spec, §5 Visualization) and `plans/2026-06-20-telos-web-ui.md` (implementation plan)

This document is the **visual and experiential brief** the Plan 3 implementer builds to. The functional plan says *what* renders; this says *how it should look and feel*. Priority, in order: **(1) instant comprehension, (2) calm/enjoyable feel, (3) visual polish.** The map is the product — never hide it behind chrome or marketing.

---

## 1. Design Direction (the five choices)

1. **Purpose:** Let an engineer understand an unfamiliar codebase's architecture in seconds, then navigate it fluidly — a daily-use instrument, not a landing page.
2. **Audience:** Software engineers scanning structure under time pressure. They need to find *the shape of the system* first, then drill to specifics. Optimize for repeated, fast scanning.
3. **Tone:** **Quiet techno-premium — "the Code Sentinel."** Dark-first, precise, vigilant, calm. A modern AI instrument (Darktrace/CrowdStrike restraint), not a neon "hacker cave." Developer-honest like ecc.tools; the data is the hero like Firecrawl.
4. **Memorable detail:** **The living map as a calm constellation.** Each node carries a soft layer-colored glow; the *active drill path* (breadcrumb trail) is the one highlighted thread through the system; the focused node gets a single, slow "sentinel" pulse. One idea, applied with restraint.
5. **Constraints:** React + `@xyflow/react` + Vite (Plan 3 stack). WCAG 2.2 AA contrast. 60fps pan/zoom on large graphs (semantic-zoom already caps on-screen nodes at ~1k). Responsive ≥ 1024px primary (desktop tool); graceful ≥ 768px. `prefers-reduced-motion` respected. CSS variables (design tokens) — no heavyweight UI framework.

**Domain fit:** This is a dense, scannable operations tool. Keep chrome minimal and quiet; spend the visual budget on the map and on legible node/edge encoding. Do **not** import a marketing-landing composition (no oversized hero copy, no decorative blobs, no purple gradients).

---

## 2. Color System

Dark-first, multi-dimensional. The **neutral slate** is the canvas/chrome; the **layer hues** are the only semantic color (they carry meaning — never recolor them decoratively); a single **sentinel accent** marks interactivity (focus, active, selection). Light theme is token-swappable but dark is the default and the one to polish first.

### Neutral canvas & chrome (dark)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0B0F14` | app background (deep slate, near-black, slightly blue) |
| `--surface` | `#121822` | top bar, detail panel, search field |
| `--surface-2` | `#1A2230` | hover/raised surfaces, result rows |
| `--border` | `#243044` | hairline separators (1px), node outlines |
| `--text` | `#E6EDF3` | primary text |
| `--text-muted` | `#90A0B3` | secondary text, metrics, paths |
| `--text-faint` | `#5A6B7E` | tertiary / disabled |

### Sentinel accent (interactivity only)
| Token | Hex | Use |
|---|---|---|
| `--accent` | `#22D3EE` | focus ring, active breadcrumb, selected node ring, search caret |
| `--accent-soft` | `rgba(34,211,238,0.14)` | focus/selection halo, active row background |

### Layer palette (semantic — already in `layout.ts` `LAYER_COLORS`)
Keep these exact hues (they are the product's meaning-bearing color); on the dark canvas, render node bodies in the hue and node text in white. Provide a matching low-alpha "wash" token per layer for backgrounds/legends.
| Layer | Hex | Meaning |
|---|---|---|
| api | `#3B82F6` | entrypoints / controllers |
| service | `#8B5CF6` | business logic |
| data | `#10B981` | models / persistence |
| ui | `#EC4899` | components / views |
| infra | `#F59E0B` | wiring / config |
| util | `#6B7280` | helpers |
| unknown | `#94A3B8` | unclassified |

**Rules:** (a) palette stays multi-dimensional — chrome is slate, meaning is layer-hued, interaction is one cyan; never let one hue dominate. (b) Every text/background pair meets **AA (≥4.5:1 body, ≥3:1 large/UI)**; layer chips use white text (verify each hue passes at chip size, darken the chip body if not). (c) No gradients except an optional ≤6% vertical canvas vignette for depth.

---

## 3. Typography

Two families, loaded **locally/self-hosted** (local-first: no CDN/Google Fonts fetch).
- **UI sans:** `Inter` (fallback `system-ui, -apple-system, "Segoe UI", sans-serif`). All chrome, labels, headings.
- **Mono:** `"JetBrains Mono"` (fallback `ui-monospace, "Cascadia Code", "Courier New", monospace`). **All code identifiers, qualified names, file paths, and metric chips** — this is the Firecrawl/ECC "technical artifact" signal; it makes the tool read as precise.

### Type scale (contextual, not oversized — 1.25 ratio, 8pt-aligned)
| Token | px / line-height / weight | Use |
|---|---|---|
| `--t-wordmark` | 18 / 24 / 600 | "Telos" wordmark |
| `--t-h` | 16 / 22 / 600 | panel heading (node name) |
| `--t-body` | 14 / 20 / 400 | default UI text |
| `--t-label` | 13 / 18 / 500 | node label, breadcrumb |
| `--t-meta` | 12 / 16 / 400 mono | metrics, paths, chips |

No hero text. Truncate long labels with ellipsis + tooltip; paths wrap or middle-truncate, never overflow.

---

## 4. Spacing, Radius, Elevation, Motion (tokens)

- **Spacing:** 8pt grid — `--s-1:4px --s-2:8px --s-3:12px --s-4:16px --s-6:24px --s-8:32px`. Generous breathing room (Firecrawl lesson); panel padding `--s-4`.
- **Radius:** `--r-sm:6px` (chips/inputs), `--r-md:10px` (nodes/cards), `--r-lg:14px` (panel). One radius family; no card-inside-a-card.
- **Elevation:** flat by default. Detail panel: `box-shadow: -8px 0 24px rgba(0,0,0,.35)`. Nodes: 1px `--border` outline + soft layer glow `0 0 0 1px <layer> inset, 0 2px 10px rgba(<layer>,.25)`. Focused/selected node adds `0 0 0 2px var(--accent), 0 0 16px var(--accent-soft)`.
- **Motion (deliberate, high-signal only):** drill-in/out = 180ms ease for node fade + `fitView` camera ease; detail panel slide-in 160ms ease-out; hover lift 90ms; focused node "sentinel pulse" = a single 1.4s ease-in-out glow that does **not** loop more than twice. All transitions wrapped in `@media (prefers-reduced-motion: reduce){ *{transition:none!important; animation:none!important} }`. No decorative/ambient motion.

---

## 5. Layout & Key Screens

**First viewport = the map, populated.** No splash, no marketing. Bring-up shows the overview (layer constellation) immediately.

```
┌──────────────────────────────────────────────────────────────┐
│  ◇ Telos      Overview / api / src/api      [ search… ⌘K ]    │  ← slim top bar (--surface), 48px
├──────────────────────────────────────────────────────────────┤
│                                                                │
│                ●api ───4──▶ ●service                           │
│        the map (full-bleed, --bg, dotted background)           │   ┌─ detail panel ─┐
│                ●data        ●ui                                │   │ findUser        │
│                                                                │   │ src/services/…  │
│              [Controls ⊕ ⊖ ⤢]                                  │   │ fn · service ·… │
│                                                                │   │ Callers (1)     │
│                                                                │   │ Callees (0)     │
└──────────────────────────────────────────────────────────────┘   └─ slides from → ─┘
```

- **Top bar:** wordmark (a small ◇ "sentinel" diamond glyph + "Telos") · breadcrumb trail (active crumb in `--accent`) · search (right, with `⌘K`/`Ctrl-K` affordance). One row, quiet, `--surface`.
- **Canvas:** full-bleed, `--bg`, React Flow `Background` as faint dotted grid (`--border` at low alpha). `Controls` bottom-left, restyled to slate. `fitView` on every level change.
- **Nodes:** layer-colored body, white `--t-label` name, a **mono metric chip row** beneath: `12 sym` · `in 3 / out 5` rendered as small pill badges (Firecrawl `[…]` energy, tasteful). Cluster nodes read as solid; leaf symbols read lighter (thinner, lower elevation) to signal "end of drill."
- **Edges:** thin, `--text-faint`, weight encoded as stroke width (1–4px). Animated/`--accent` only along the active hovered path. No edges fabricated at file level (honesty invariant).
- **Detail panel:** slides from right (`--surface`, panel shadow), `--s-4` padding. Node name (`--t-h`), path (mono `--text-muted`), a metric line, then **Callers** and **Callees** lists. Close via `×` or `Esc`. No cards-in-cards — use hairline dividers.
- **Empty/loading/error:** skeleton shimmer on first load (respect reduced-motion → static); a calm centered message if the graph is empty ("Run `telos scan` to build the map"); inline `role="alert"` in a warning tone for fetch errors.

---

## 6. Methodologies & Standards (apply these while building)

- **Design tokens / single source of truth:** all of §2–§4 live as CSS custom properties in `apps/web/src/styles/tokens.css`, imported once in `main.tsx`. Components reference `var(--…)` only — no hard-coded hex. This is what keeps the direction coherent across states and makes a light theme a token swap.
- **Progressive disclosure (the core UX law here):** semantic zoom = show the *least* that answers "what is the shape of this system," reveal detail only on intent (click to drill, click leaf to open panel). This is the single biggest lever on "understand as fast as possible."
- **Gestalt & pre-attentive encoding:** group by layer color (similarity), cluster by proximity (dagre), size/glow by importance (fan-in/out) — so structure is read *before* labels.
- **Visual hierarchy:** one primary action per context; chrome recedes (muted), data advances (hued). Contrast guides the eye to the map, then to the focused node.
- **Accessibility (WCAG 2.2 AA, non-negotiable):** full keyboard nav (Tab to nodes, Enter to drill, Esc to close panel, `⌘/Ctrl-K` to search), visible `--accent` focus rings on every interactive element, `aria-label`s on icon buttons and the breadcrumb `nav`, `prefers-reduced-motion` honored, color never the *only* signal (layer also shown as text in the node + panel). Consider pairing the existing `ecc:accessibility` / `a11y-architect` skill during the build.
- **Component-driven / atomic:** small focused components (already the Plan 3 structure: `TelosNode`, `Breadcrumbs`, `SearchBox`, `DetailPanel`, `MapView`). One responsibility each; tokens for all visual values.
- **Performance budget:** virtualize via aggregation (already ≤~1k nodes/level); memoize `toFlowGraph`; avoid re-layout on hover; lazy-mount the detail panel. Target 60fps pan/zoom.
- **Motion with purpose (Material/Carbon principle):** every animation must clarify a state change (where did I go, what is selected). If it's only decorative, cut it.

**Anti-patterns to avoid (from the design skill + references):** purple gradients, decorative blobs, oversized vague hero text, cards-inside-cards, one-hue UIs, hiding the map behind marketing sections, describing features inside the UI when the controls already speak.

---

## 7. How this maps to the Plan 3 tasks

- **Task 2 (scaffold):** also create `apps/web/src/styles/tokens.css` with the §2–§4 tokens and import it in `main.tsx`; add a global reset (box-sizing, `--bg`/`--text` on `body`, self-hosted `@font-face` for Inter + JetBrains Mono).
- **Task 4 (`layout.ts`):** keep `LAYER_COLORS` exactly as the semantic palette (§2); add the per-layer glow/wash derivations there if convenient.
- **Task 6 (components):** style `TelosNode` / `Breadcrumbs` / `SearchBox` / `DetailPanel` / `MapView` strictly via tokens per §5; implement the metric chips, the active-crumb accent, the focus rings, the panel slide, and the reduced-motion guard. Restyle React Flow `Background` / `Controls` to the dark canvas.
- **Task 7 (serve):** the hosted build must ship the self-hosted fonts (no external font fetch — local-first).
- **Optional design QA pass:** after Task 6, run the `ecc:gan-design` or `ecc:make-interfaces-feel-better` loop, and an `ecc:accessibility` audit, against the running app before the final review.
- **File Explorer (shipped Plan 4):** collapsible sidebar + read-only Shiki viewer implemented. Future IDE phase roadmap: full Monaco editing, IntelliSense, multi-tab editor, git/branches panel, file editing/saving.

---

## 8. Future-phase inspiration — from *AI Engineering from Scratch* (Phase 3 LLM brain, not v1)

The course (503 lessons, 20 phases: math → tokenization → attention → agent loops → swarms) maps cleanly onto Telos's **Phase 3 — Semantic brain**. Capture for the eventual Phase 3 spec:

- **Embeddings + vector search over the graph (RAG):** embed each node's code/signature; power "find code like this" and semantic search beyond FTS. The universal node `id`/`qualifiedName` are the join keys.
- **Agent loops:** a "guided tour" agent that walks a newcomer through the architecture, and a "where does X happen?" Q&A agent that traverses the graph to answer in natural language.
- **Attention as explanation:** surface *why* the model grouped/summarized a region — attention over call paths to justify a suggested architectural layer or summary (fills the reserved `summary` field).
- **Evals:** an eval harness (the course's loss/eval emphasis) to measure summary accuracy and layer-classification quality before shipping enrichment — pairs with `ecc:eval-harness`.
- **Build-from-scratch ethos** matches Telos's "data-change-not-code-change" universal-AST philosophy: prefer transparent, inspectable mechanisms over opaque framework magic.

These are **Phase 3+ notes only** — out of scope for v1 (Plans 1–3). Recorded so the model stays compatible.

---

## Sources (design research)
- Firecrawl — https://www.firecrawl.dev/ (dark-first, accent + code artifacts, generous whitespace, status badges)
- ECC Tools — https://ecc.tools/ (developer-honest, concrete-metric credibility, high contrast)
- AI Engineering from Scratch — https://aiengineeringfromscratch.com/ (minimal text-forward; curriculum → Phase 3 ideas)
- Cipher Digital — https://cipherdigital.com/ (referenced as dark techno-sentinel security aesthetic; site blocked automated fetch, characterized via the security-website-design category: Darktrace/CrowdStrike-class controlled-neon restraint)
- Cybersecurity dark-aesthetic context — https://motiontactic.com/blog/21-cybersecurity-websites-for-design-inspiration/ , https://digi-tx.com/design/best-examples-cybersecurity-website-design/
