import { describe, it, expect } from "vitest";
import { routePrompt, PromptCapability, PROMPT_CATALOG, scoreCapability, routeRoster } from "./router.js";
import type { DiscoveredCapability, HarnessRoster } from "./discover.js";

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

import { routeForHook } from "./router.js";

describe("routeForHook", () => {
  it("nudges toward the matching capability, filtered to enabled sources", () => {
    const out = routeForHook("optimize the slow database query", ["ecc"]);
    expect(out).toMatch(/^Telos: for this task, use /);
    expect(out).toMatch(/ecc:/);
  });
  it("returns empty when no source is enabled or no match", () => {
    expect(routeForHook("optimize the slow query", [])).toBe("");
    expect(routeForHook("", ["ecc"])).toBe("");
    expect(routeForHook("xyzzy nothing matches here", ["ecc"])).toBe("");
  });
  it("excludes capabilities from disabled sources", () => {
    // headroom:compress triggers on "compress"; with only ecc enabled it must not appear
    expect(routeForHook("please compress the context", ["ecc"])).not.toMatch(/headroom/);
  });
});

const cap = (id: string, source: string, description: string, triggers: string[]): DiscoveredCapability => ({
  id, kind: "agent", source, title: id, description, triggers,
});
const ROSTER: HarnessRoster = {
  capabilities: [
    cap("ecc:react-reviewer", "ecc", "Review react component rendering and hooks", ["react", "component"]),
    cap("ecc:python-reviewer", "ecc", "Review python migration and schema", ["python", "migration"]),
  ],
  sources: [],
  scannedAt: 0,
};

describe("scoreCapability + routeRoster (H2)", () => {
  it("ranks the capability whose triggers/description match the prompt first", () => {
    const r = routeRoster("fix the react component render", ROSTER, ["ecc"]);
    expect(r[0].capability.id).toBe("ecc:react-reviewer");
  });

  it("lets product context flip the ranking", () => {
    const prompt = "review the migration";
    const ctx = { languages: ["python"], layers: [], changedFiles: [] };
    const withCtx = routeRoster(prompt, ROSTER, ["ecc"], ctx);
    expect(withCtx[0].capability.id).toBe("ecc:python-reviewer");
    // the +3 language boost is real
    const pyCap = ROSTER.capabilities[1];
    expect(scoreCapability(prompt, pyCap, ctx)).toBeGreaterThan(scoreCapability(prompt, pyCap));
  });

  it("excludes disabled sources and empty prompts", () => {
    expect(routeRoster("react", ROSTER, [])).toEqual([]);
    expect(routeRoster("", ROSTER, ["ecc"])).toEqual([]);
  });
});
