# Telos UI — Continuous Design & Hardening Loop (GAN design mode)

**Target under test:** the running Telos web UI at `http://127.0.0.1:5180` (engine stage 8 — the React Flow semantic-zoom architecture map), serving a real scan of Telos's own repo (161 nodes / 238 edges).

**Binding references:**
- Design direction: `docs/superpowers/specs/2026-06-20-telos-ui-design-direction.md` (dark "Code Sentinel" language, tokens, a11y).
- Functional spec: `docs/superpowers/specs/2026-06-19-telos-code-sentinel-design.md` §5 (semantic zoom).

## The brief
Continuously improve the Telos UI so it is **(1) industrial/practical** for understanding real codebases fast, and **(2) visually sleek, modern, sophisticated, and cohesively color-themed** — the kind of tool an engineer enjoys using. Each loop iteration must **drive the live UI in a real browser**, find issues/bugs, fix the highest-impact ones, and raise the design score — without breaking the verified test suite or the invariants (single nav state, honesty/no-fabricated-edges, local-first, tokens-as-truth).

## Per-iteration phases (MANDATORY ORDER)
**0. Re-anchor to goals (anti-hallucination — do this FIRST every iteration).** Re-read this spec's "Stage-appropriate goals" + the functional spec's §1 intent ("help engineers understand/maintain codebases fast"). Write one line: "This iteration serves goal X." If a proposed change does NOT map to a stated goal/purpose, DROP it — do not invent scope. The loop improves the agreed product; it does not redefine it.
1. **Observe — drive the live UI** (chrome-devtools MCP): load `:5180`, screenshot the overview, take the a11y snapshot, read the console for errors/warnings, click a layer to drill, open the detail panel, type in search. Capture evidence.
2. **Evaluate** the current state against `eval-rubric.md`; list concrete defects + pick the SINGLE highest-leverage improvement that maps to a goal.
3. **Research BEFORE changing (MANDATORY).** Before implementing, research the industry standard for that specific fix/quality bar — WebSearch/WebFetch (e.g. data-viz node-importance encoding, graph-UI patterns, WCAG, the reference sites' techniques) and note 1–3 concrete standards/sources that will guide the change. Reference-site quality is the bar; do NOT clone any of them — stay distinctive (rubric Originality). No change ships without this research note.
4. **Implement** the one improvement grounded in that research, within the guardrails (suite green, tokens-as-truth, honesty, 127.0.0.1).
5. **Verify** — rebuild `apps/web`, restart the server, re-capture (screenshot + console), confirm no regression and the score rose. Commit.
6. Repeat until weighted score >= pass-threshold or max iterations. Each iteration: one researched, goal-anchored, verified improvement.

## Stage-appropriate goals review (is it operating properly / what should exist now)
v1 (Plans 1-3) is shipped. At THIS stage the loop should verify/secure these and surface gaps:
- **Operates properly:** overview renders; drill layer->module->file->symbol works; breadcrumb stays in sync; search returns symbols; detail panel opens with callers/callees and closes (Esc/x); no console errors; reduced-motion respected.
- **Industrial/practical gaps to consider (in scope for this loop if cheap, else log):** node size encoded by importance (fan-in/out); edge weight -> stroke width + hover-path highlight; legend for layer colors; loading/empty/error states visible; keyboard nav + real Ctrl/Cmd-K focus; "reset to overview" affordance; readable handling of the `unknown`-heavy layer case (layer-hints data tweak so Telos classifies its own packages).
- **Appearance goals:** cohesive dark theme with the layer palette as the accent system; depth/elevation; refined typography rhythm; tasteful motion on drill/zoom; the map reads as a calm, premium instrument at first glance.
- **Out of scope (future phases, do NOT build here):** OTel live monitoring (Phase 2), LLM summaries/semantic layers (Phase 3), visual-first authoring (Phase 4).

## Reference-derived feature backlog (from the Understand-Anything live demo — https://understand-anything.com/demo/)
Standing practice: study competitor/reference demos in-browser for feature/UX ideas, then **triage against the goals** — implement only what fits v1 (static, no LLM), and route LLM-dependent features to the Phase 3 roadmap below. Match reference *quality*, never clone the look (stay distinctive — rubric Originality).

**v1-feasible (static, no LLM) — add these to the loop, one per iteration, after the current backlog:**
- **Mini-map** — React Flow `<MiniMap>`, token-styled, for orientation on big graphs.
- **Layer filter toggles** — show/hide layers (the demo's CODE/CONFIG/DOCS/INFRA/DATA chips); pure UI over existing layer data.
- **Find path between two nodes** — pick source + target, BFS over edges, highlight the path (the demo's "Path / P"). Static, high "industrial" value.
- **Keyboard-shortcuts overlay** — `?` opens a token-styled cheat-sheet (⌘K, Esc, drill, etc.).
- **Export** — download the current view as PNG and/or the graph JSON (the demo's "Export / E").
- **Persona/density modes** — Overview / Learn / Deep-Dive as a *metadata-density* toggle (how much chip/detail shows); no LLM, just progressive disclosure.
- **Dependency-ordered tour scaffold** — a structural walk that pans the camera through nodes in topological order with a step list (the demo's "Project Tour"); the per-step PROSE is Phase 3, the ordering + camera + step UI are v1.
- **Complexity indicator** — surface the existing `node.complexity` metric as a small badge (the demo's simple/moderate/complex tag), static.
- **Theme toggle** — light/dark via token swap (tokens already support it).

**Phase 3 roadmap (LLM — capture, do NOT build in this loop):** plain-English node summaries, semantic search, guided-tour prose, business-domain view (domains/flows/steps), and a "where does X happen?" chat. These fill the reserved `summary` field and need the LLM brain — they are Telos Phase 3, not v1.

## Guardrails (every iteration)
- Keep the full suite green (`pnpm -r build` + package vitest) and `tsc` clean before committing an iteration.
- No hard-coded hex in components — extend `tokens.css`.
- Don't fabricate edges the API didn't return. Keep server bound to 127.0.0.1.
- Commit each accepted improvement with a clear message; never leave a stray server (kill by PID via PowerShell, not Git-Bash `$!`).
