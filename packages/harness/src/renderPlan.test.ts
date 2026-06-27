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
    expect(out).toContain("1. superpowers:brainstorming — design before code");
    expect(out).toContain("⇉ parallel: ecc:typescript-reviewer, ecc:security-reviewer");
    expect(out).toContain("→ dispatch these as subagents.");
    // bordered banner: top + bottom rule frame the block
    expect(out.startsWith("╭─")).toBe(true);
    expect(out).toContain("╰─");
  });

  it("returns an empty string when the plan has no agents", () => {
    expect(renderPlan({ intent: "assist", template: null, steps: [], rationale: "" })).toBe("");
  });
});
