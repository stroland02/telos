import { describe, it, expect } from "vitest";
import { renderPlan } from "./renderPlan.js";
import type { OrchestrationPlan } from "./workflows.js";

const plan: OrchestrationPlan = {
  intent: "feature build",
  template: "feature-build",
  steps: [
    { phase: "design", parallel: false, agents: [{ id: "superpowers:brainstorming", why: "design before code" }] },
    {
      phase: "review",
      parallel: true,
      agents: [
        { id: "ecc:typescript-reviewer", why: "language-specific review" },
        { id: "ecc:security-reviewer", why: "security review" },
      ],
    },
  ],
  rationale: "Feature build",
};

describe("renderPlan", () => {
  it("renders a header, numbered steps, the parallel tag, agent ids, and dispatch", () => {
    const out = renderPlan(plan, { languages: ["typescript"], layers: ["web"], changedFiles: [] });
    expect(out).toContain("⟢ TELOS ACTIVE · feature build");
    expect(out).toContain("product: typescript (web)");
    expect(out).toContain("1. [telos] superpowers:brainstorming — design before code");
    expect(out).toContain("⇉ parallel: [telos] ecc:typescript-reviewer, [telos] ecc:security-reviewer");
    expect(out).toContain("→ dispatch these as subagents.");
    // bordered banner: top + bottom rule frame the block
    expect(out.startsWith("╭─")).toBe(true);
    expect(out).toContain("╰─");
  });

  it("returns an empty string when the plan has no agents", () => {
    expect(renderPlan({ intent: "assist", template: null, steps: [], rationale: "" })).toBe("");
  });

  // ── #4 orch-* handoff lead block ───────────────────────────────────────────
  it("leads with the orchestration pipeline when one is set, then offers the manual breakdown", () => {
    const out = renderPlan({ ...plan, orchestrator: { id: "ecc:orch-add-feature", pipeline: "research → plan → TDD → review → gated commit" } });
    expect(out).toContain("▶ Run [telos] ecc:orch-add-feature");
    expect(out).toContain("research → plan → TDD → review → gated commit");
    expect(out).toContain("— or dispatch manually —");
    // the manual steps still render below the handoff
    expect(out).toContain("1. [telos] superpowers:brainstorming — design before code");
    // and the handoff precedes the numbered steps
    expect(out.indexOf("▶ Run")).toBeLessThan(out.indexOf("1. [telos]"));
  });

  it("renders identically to today when no orchestrator is set", () => {
    const out = renderPlan(plan, { languages: ["typescript"], layers: ["web"], changedFiles: [] });
    expect(out).not.toContain("▶ Run");
    expect(out).not.toContain("or dispatch manually");
  });
});
