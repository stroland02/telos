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
    cap("ecc:doc-updater", "ecc"),
    cap("ecc:build-error-resolver", "ecc"),
    cap("ecc:go-build-resolver", "ecc"),
    cap("ecc:rust-build-resolver", "ecc"),
    cap("ecc:strategic-compact", "ecc"),
    cap("ecc:go-test", "ecc"),
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

  // ── Routing-quality hardening (audit remediation) ──────────────────────────
  it("routes write-tests to the test template, docs to the docs template", () => {
    expect(planWorkflow("write unit tests for the graph store", ROSTER, ALL).template).toBe("test");
    expect(planWorkflow("update the readme with the new commands", ROSTER, ALL).template).toBe("docs");
  });

  it("does NOT classify meta/QA prompts as feature-build (substring-collision guard)", () => {
    expect(planWorkflow("let's keep building upon the tests and audit things", ROSTER, ALL).template).not.toBe("feature-build");
    expect(planWorkflow("a serious quality audit testing phase", ROSTER, ALL).template).not.toBe("feature-build");
    // "implement all" / "implement authentication" must NOT match the "implement a " trigger
    expect(planWorkflow("implement all different testing strategies", ROSTER, ALL).template).not.toBe("feature-build");
    expect(planWorkflow("explain how we implement authentication", ROSTER, ALL).template).not.toBe("feature-build");
    // concrete build requests still work
    expect(planWorkflow("build a new settings page", ROSTER, ALL).template).toBe("feature-build");
    expect(planWorkflow("add a new dashboard feature with a chart", ROSTER, ALL).template).toBe("feature-build");
    expect(planWorkflow("implement a dark-mode toggle", ROSTER, ALL).template).toBe("feature-build");
  });

  it("routes testing/QA work to the test template (incl. 'implement testing strategies')", () => {
    expect(planWorkflow("implement all different testing strategies", ROSTER, ALL).template).toBe("test");
    expect(planWorkflow("add integration test coverage", ROSTER, ALL).template).toBe("test");
  });

  it("stays SILENT (empty plan) when nothing confident matches — no token-wasting garbage", () => {
    for (const q of ["how do I run the dev server?", "what does the resolver actually do?", "rename the variable userId to accountId"]) {
      const plan = planWorkflow(q, ROSTER, ALL);
      expect(plan.steps.flatMap((s) => s.agents)).toEqual([]); // injects nothing
    }
  });

  it("fallback only ever surfaces curated capabilities, never arbitrary roster skills", () => {
    // "optimize" hits the perf template; a vague prompt with a curated keyword
    // ("security") routes to the curated agent, not a random roster entry.
    const plan = planWorkflow("think about the security of this", ROSTER, ALL);
    const ids = plan.steps.flatMap((s) => s.agents.map((a) => a.id));
    expect(ids.every((id) => id.startsWith("superpowers:") || id.startsWith("ecc:") || id.startsWith("headroom:"))).toBe(true);
    expect(ids).not.toContain("ecc:gget");
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

  // ── #1 build/compile routing ───────────────────────────────────────────────
  it("routes a build/compile failure to the build-fix template, not the debugger", () => {
    const plan = planWorkflow("the build fails with a type error in the server", ROSTER, ALL);
    expect(plan.template).toBe("build-fix");
    expect(plan.steps[0].agents.map((a) => a.id)).toContain("ecc:build-error-resolver");
  });

  it("resolves build-resolver to the stack-specific resolver, falling back to the generic one", () => {
    const go = resolveRole("build-resolver", ROSTER, ALL, { languages: ["go"], layers: [], changedFiles: [] });
    expect(go!.id).toBe("ecc:go-build-resolver");
    const ts = resolveRole("build-resolver", ROSTER, ALL, { languages: ["typescript"], layers: [], changedFiles: [] });
    expect(ts!.id).toBe("ecc:build-error-resolver"); // no TS-specific resolver → generic
  });

  it("a plain runtime bug (no build/compile words) still routes to bugfix", () => {
    expect(planWorkflow("the parser keeps crashing with an error", ROSTER, ALL).template).toBe("bugfix");
  });

  it("resolves tester to the language test skill when present, else generic TDD", () => {
    const go = resolveRole("tester", ROSTER, ALL, { languages: ["go"], layers: [], changedFiles: [] });
    expect(go!.id).toBe("ecc:go-test");
    const py = resolveRole("tester", ROSTER, ALL, { languages: ["python"], layers: [], changedFiles: [] });
    expect(py!.id).toBe("superpowers:test-driven-development"); // no ecc:python test skill → generic
  });

  // ── #2 compressor no longer dead-ends on missing headroom ──────────────────
  it("resolves compressor to an ECC context skill when headroom is absent", () => {
    const noHeadroom = ["ecc", "superpowers"]; // headroom not enabled
    const c = resolveRole("compressor", ROSTER, noHeadroom, { languages: ["typescript"], layers: [], changedFiles: [] });
    expect(c!.id).toBe("ecc:strategic-compact");
  });

  it("the context-heavy template produces a non-empty plan without headroom", () => {
    const plan = planWorkflow("the context is too long, compress the context", ROSTER, ["ecc"]);
    expect(plan.template).toBe("context-heavy");
    expect(plan.steps.flatMap((s) => s.agents).length).toBeGreaterThan(0);
  });
});
