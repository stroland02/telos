import { describe, it, expect } from "vitest";
import { planWorkflow } from "./workflows.js";
import { renderPlan } from "./renderPlan.js";
import type { DiscoveredCapability, HarnessRoster } from "./discover.js";

// Non-functional / performance guard: the per-prompt planning hot path runs on
// EVERY prompt via the UserPromptSubmit hook, so it must stay microsecond-cheap.
// (The ~1s end-to-end hook cost is Node startup + native-module loading, tracked
// separately; this guards the algorithm from quadratic/accidental regressions.)
function bigRoster(n: number): HarnessRoster {
  const caps: DiscoveredCapability[] = [];
  for (let i = 0; i < n; i++) {
    caps.push({ id: `ecc:cap-${i}`, kind: "agent", source: "ecc", title: `Cap ${i}`, description: `does thing number ${i} with code review`, triggers: [`cap${i}`, "review"] });
  }
  // include the agents the templates resolve to
  for (const id of ["superpowers:brainstorming", "superpowers:writing-plans", "superpowers:test-driven-development", "ecc:typescript-reviewer", "ecc:security-reviewer", "ecc:code-reviewer"]) {
    caps.push({ id, kind: "agent", source: id.split(":")[0], title: id, description: id, triggers: [id.split(":")[1]] });
  }
  return { capabilities: caps, sources: [], scannedAt: 0 };
}

describe("planning hot-path performance", () => {
  it("plans + renders in well under 5ms even over a 400-capability roster", () => {
    const roster = bigRoster(400);
    const enabled = ["ecc", "superpowers", "headroom"];
    const ctx = { languages: ["typescript"], layers: ["ui"], changedFiles: [] };
    // warm up
    planWorkflow("add a new feature", roster, enabled, ctx);

    const start = performance.now();
    const iters = 200;
    for (let i = 0; i < iters; i++) {
      const plan = planWorkflow("add a new dashboard feature with a chart", roster, enabled, ctx);
      renderPlan(plan, ctx);
    }
    const perCall = (performance.now() - start) / iters;
    expect(perCall).toBeLessThan(5); // generous ceiling; typically ~0.1ms
  });
});
