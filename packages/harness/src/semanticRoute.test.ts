import { describe, it, expect } from "vitest";
import { selectTemplateSemantic } from "./semanticRoute.js";

const ALL = ["ecc", "superpowers", "headroom"];

// Precision regression: the labeled prompts include the real-world misroutes the
// keyword router got wrong. Semantic routing must fix them.
const cases: [string, string][] = [
  ["build a new dashboard feature for the order flow", "feature-build"],
  ["add a payment endpoint to the checkout api", "feature-build"],
  ["implement all the SDLC tests including unit and system tests", "test"],
  ["write unit tests for the parser", "test"],
  ["this code is really slow, optimize the database query", "perf"],
  ["fix the memory leak in the worker", "perf"],
  ["review this pull request before merging", "review"],
  ["fix the crash when the user logs in", "bugfix"],
  ["update the readme with setup instructions", "docs"],
  ["compress the context, it has too many tokens", "context-heavy"],
];

describe("semantic routing precision", () => {
  for (const [prompt, expected] of cases) {
    it(`routes "${prompt.slice(0, 32)}…" → ${expected}`, () => {
      expect(selectTemplateSemantic(prompt, ALL)?.id).toBe(expected);
    });
  }

  it("stays silent on meta/off-topic prompts instead of forcing a weak match", () => {
    // The keyword router sent "begin the llm phase" to review; semantic routing
    // now recognizes it matches no intent confidently and stays silent.
    expect(selectTemplateSemantic("begin the llm phase", ALL)).toBeNull();
    expect(selectTemplateSemantic("what is the weather today", ALL)).toBeNull();
  });

  it("does NOT misroute 'implement all' to feature-build (substring collision)", () => {
    expect(selectTemplateSemantic("implement all the SDLC tests", ALL)?.id).toBe("test");
  });
});
