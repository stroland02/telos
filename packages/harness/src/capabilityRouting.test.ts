import { describe, it, expect } from "vitest";
import { selectSpecialists, augmentWithSpecialists } from "./capabilityRouting.js";
import type { HarnessRoster } from "./discover.js";
import type { OrchestrationPlan } from "./workflows.js";

const roster = {
  capabilities: [
    { id: "ecc:a11y-architect", kind: "agent", source: "ecc", title: "Accessibility architect", description: "WCAG accessibility screen reader aria compliance for inclusive UI design", triggers: ["accessibility", "wcag", "aria"] },
    { id: "ecc:security-reviewer", kind: "agent", source: "ecc", title: "Security reviewer", description: "finds vulnerabilities sql injection xss owasp auth issues", triggers: ["security", "vulnerability"] },
    { id: "ecc:rust-reviewer", kind: "agent", source: "ecc", title: "Rust reviewer", description: "ownership borrow checker lifetimes idiomatic rust safety", triggers: ["rust"] },
    { id: "ecc:doc-updater", kind: "agent", source: "ecc", title: "Doc updater", description: "update readme changelog documentation", triggers: ["docs"] },
  ],
  sources: [],
  scannedAt: 1,
} as unknown as HarnessRoster;

const ALL = ["ecc"];

describe("selectSpecialists", () => {
  it("ranks the matching specialist top for a domain prompt", () => {
    const picks = selectSpecialists("make this component WCAG accessible with aria and screen reader support", roster, ALL);
    expect(picks[0]?.id).toBe("ecc:a11y-architect");
  });

  it("surfaces nothing for an off-topic prompt", () => {
    expect(selectSpecialists("what is the weather today", roster, ALL)).toEqual([]);
  });

  it("returns nothing on an empty prompt", () => {
    expect(selectSpecialists("   ", roster, ALL)).toEqual([]);
  });
});

describe("augmentWithSpecialists", () => {
  const basePlan: OrchestrationPlan = {
    intent: "review", template: "review",
    steps: [{ phase: "review", parallel: true, agents: [{ id: "ecc:code-reviewer", why: "final gate" }] }],
    rationale: "Review",
  };

  it("appends a deduped specialists step for a matching prompt", () => {
    const out = augmentWithSpecialists(basePlan, "audit this for WCAG accessibility and aria", roster, ALL);
    const specialists = out.steps.find((s) => s.phase === "specialists");
    expect(specialists).toBeTruthy();
    expect(specialists!.agents.some((a) => a.id === "ecc:a11y-architect")).toBe(true);
  });

  it("never duplicates an agent the plan already names", () => {
    const plan: OrchestrationPlan = {
      ...basePlan,
      steps: [{ phase: "review", parallel: true, agents: [{ id: "ecc:security-reviewer", why: "security review" }] }],
    };
    const out = augmentWithSpecialists(plan, "find the sql injection vulnerability and security issues", roster, ALL);
    const ids = out.steps.flatMap((s) => s.agents.map((a) => a.id));
    expect(ids.filter((id) => id === "ecc:security-reviewer").length).toBe(1);
  });

  it("leaves an empty (silent) plan untouched", () => {
    const empty: OrchestrationPlan = { intent: "assist", template: null, steps: [], rationale: "no match" };
    expect(augmentWithSpecialists(empty, "make this WCAG accessible", roster, ALL)).toEqual(empty);
  });

  it("adds no step when nothing clears the threshold", () => {
    const out = augmentWithSpecialists(basePlan, "what is the weather today", roster, ALL);
    expect(out.steps.find((s) => s.phase === "specialists")).toBeUndefined();
  });
});
