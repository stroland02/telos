import { describe, it, expect } from "vitest";
import { routePrompt, PromptCapability, PROMPT_CATALOG } from "./router.js";

const CAT: PromptCapability[] = [
  { id: "superpowers:brainstorming", kind: "skill", source: "superpowers", title: "Brainstorm", triggers: ["build", "create"] },
  { id: "superpowers:systematic-debugging", kind: "skill", source: "superpowers", title: "Debug", triggers: ["bug", "error", "failing"] },
];

describe("routePrompt", () => {
  it("matches triggers case-insensitively and ranks by hit count", () => {
    const r = routePrompt("There is a BUG causing a failing test", CAT);
    expect(r[0].capability.id).toBe("superpowers:systematic-debugging");
    expect(r[0].score).toBe(2); // "bug" + "failing"
  });
  it("returns only positive matches", () => {
    const r = routePrompt("let's build a new dashboard", CAT);
    expect(r.map((x) => x.capability.id)).toEqual(["superpowers:brainstorming"]);
  });
  it("returns nothing for an unrelated prompt", () => {
    expect(routePrompt("what is the weather", CAT)).toEqual([]);
  });
});

describe("PROMPT_CATALOG", () => {
  it("every entry is namespaced and has at least one trigger", () => {
    for (const c of PROMPT_CATALOG) {
      expect(c.id).toMatch(/^(ecc|superpowers|headroom):/);
      expect(c.triggers.length).toBeGreaterThan(0);
    }
  });
  it("routes a debugging prompt to systematic-debugging", () => {
    const ids = routePrompt("my server keeps failing with a stack trace", PROMPT_CATALOG).map((r) => r.capability.id);
    expect(ids).toContain("superpowers:systematic-debugging");
  });
  it("routes a performance+database prompt to both relevant reviewers", () => {
    const ids = routePrompt("optimize the slow database query", PROMPT_CATALOG).map((r) => r.capability.id);
    expect(ids).toContain("ecc:performance-optimizer");
    expect(ids).toContain("ecc:database-reviewer");
  });
  it("routes an accessibility prompt to the a11y architect", () => {
    const ids = routePrompt("add aria labels for screen reader accessibility", PROMPT_CATALOG).map((r) => r.capability.id);
    expect(ids).toContain("ecc:a11y-architect");
  });
  it("routes a refactor prompt to the refactor cleaner", () => {
    const ids = routePrompt("refactor this module to remove dead code", PROMPT_CATALOG).map((r) => r.capability.id);
    expect(ids).toContain("ecc:refactor-cleaner");
  });
  it("routes an end-to-end testing prompt to the e2e runner", () => {
    const ids = routePrompt("write a playwright end-to-end test for checkout", PROMPT_CATALOG).map((r) => r.capability.id);
    expect(ids).toContain("ecc:e2e-runner");
  });
});
