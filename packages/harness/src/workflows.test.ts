import { describe, it, expect } from "vitest";
import { planWorkflow, resolveRole, WORKFLOW_TEMPLATES } from "./workflows.js";
import type { DiscoveredCapability, HarnessRoster } from "./discover.js";

const cap = (id: string, source: string): DiscoveredCapability => ({
  id, kind: "agent", source, title: id, description: id, triggers: [id.split(":")[1]],
});

// A roster containing every agent the templates can resolve to.
const ROSTER: HarnessRoster = {
  capabilities: [
    cap("superpowers:brainstorming", "superpowers"),
    cap("superpowers:writing-plans", "superpowers"),
    cap("superpowers:test-driven-development", "superpowers"),
    cap("superpowers:systematic-debugging", "superpowers"),
    cap("ecc:security-reviewer", "ecc"),
    cap("ecc:code-reviewer", "ecc"),
    cap("ecc:typescript-reviewer", "ecc"),
    cap("ecc:python-reviewer", "ecc"),
    cap("ecc:performance-optimizer", "ecc"),
    cap("ecc:database-reviewer", "ecc"),
  ],
  sources: [],
  scannedAt: 0,
};
const ALL = ["superpowers", "ecc", "headroom"];

describe("planWorkflow", () => {
  it("routes a feature prompt to the feature-build template starting with the designer", () => {
    const plan = planWorkflow("build a new feature for the dashboard", ROSTER, ALL);
    expect(plan.template).toBe("feature-build");
    expect(plan.intent).toBe("feature build");
    expect(plan.steps[0].agents[0].id).toBe("superpowers:brainstorming");
  });

  it("routes a bug prompt to the bugfix template with the debugger first", () => {
    const plan = planWorkflow("the parser keeps crashing with an error", ROSTER, ALL);
    expect(plan.template).toBe("bugfix");
    expect(plan.steps[0].agents.map((a) => a.id)).toContain("superpowers:systematic-debugging");
  });

  it("resolves language-reviewer from the product languages", () => {
    const ts = resolveRole("language-reviewer", ROSTER, ALL, { languages: ["typescript"], layers: [], changedFiles: [] });
    expect(ts!.id).toBe("ecc:typescript-reviewer");
    const py = resolveRole("language-reviewer", ROSTER, ALL, { languages: ["python"], layers: [], changedFiles: [] });
    expect(py!.id).toBe("ecc:python-reviewer");
  });

  it("falls back to flat routing with template null when no template matches", () => {
    const plan = planWorkflow("explain how the authentication token works", ROSTER, ALL);
    expect(plan.template).toBeNull();
    expect(plan.intent).toBe("assist");
  });

  it("drops roles whose source is disabled", () => {
    // Only superpowers enabled → review step (all ecc) disappears, design/plan/test remain.
    const plan = planWorkflow("build a new feature", ROSTER, ["superpowers"]);
    const ids = plan.steps.flatMap((s) => s.agents.map((a) => a.id));
    expect(ids).toContain("superpowers:brainstorming");
    expect(ids.every((id) => id.startsWith("superpowers:"))).toBe(true);
  });

  it("every template trigger list is non-empty", () => {
    expect(WORKFLOW_TEMPLATES.every((t) => t.triggers.length > 0)).toBe(true);
  });
});
