# Telos UI — Design & Hardening Eval Rubric

Score each axis 0–10 against **live-browser evidence** (screenshot + console + interaction), then weight. Pass threshold: **7.5**.

### Design Quality (weight: 0.35)
Cohesive dark "Code Sentinel" theme; layer palette reads as a deliberate accent system (not random color); strong visual hierarchy (map advances, chrome recedes); refined typography rhythm; depth/elevation; the map looks calm, premium, and instantly legible at first glance. Penalize: muddy contrast, one-note color, cramped/misaligned layout, default-React-Flow blandness.

### Originality (weight: 0.30)
A distinctive, memorable detail done with restraint (the "constellation"/sentinel motif, importance-scaled nodes, an elegant legend, a signature focus/hover treatment). Penalize: generic dashboard look, nothing that says "this tool, not a template."

### Craft (weight: 0.25)
Pixel-level polish and correctness: alignment, spacing on the 8pt grid, no overflow/clipping, panel/top-bar layering correct, tokens (no stray hex), focus rings, smooth high-signal motion, reduced-motion respected, responsive >=1024px. Penalize: visual bugs, jank, console errors/warnings.

### Functionality (weight: 0.10)
It operates: overview renders; drill layer->module->file->symbol; breadcrumb stays in sync; search returns + selects symbols; detail panel opens (callers/callees) and closes (Esc/x). Penalize: broken drill, dead search, panel that won't close, JS errors.

## Per-iteration output (Evaluator)
- Axis scores + weighted total.
- Top 3 concrete defects (with the evidence: screenshot region / console line / interaction).
- The SINGLE highest-leverage improvement for the next Generator pass.
- Verdict: PASS (>=7.5) or ITERATE.

## Per-iteration output (Generator)
- The one improvement implemented (file + token/component change), kept within guardrails (suite green, tokens-as-truth, honesty, 127.0.0.1).
- Rebuild + restart + re-capture, then hand to Evaluator.
