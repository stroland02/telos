import { describe, it, expect } from "vitest";
import { TelosNode } from "@telos/engine";
import { DEFAULT_CATALOG, recommend } from "./catalog.js";

function node(over: Partial<TelosNode> = {}): TelosNode {
  return {
    id: "x", kind: "function", name: "f", qualifiedName: "app/f",
    language: "typescript", path: "src/x.ts", lineStart: 1, lineEnd: 9,
    layer: "service", fanIn: 0, fanOut: 0, lines: 9, complexity: 1, summary: null, ...over,
  };
}

describe("DEFAULT_CATALOG", () => {
  it("every id is namespaced and every entry has a non-empty match", () => {
    for (const c of DEFAULT_CATALOG) {
      expect(c.id).toMatch(/^(ecc|superpowers|headroom):/);
      expect(Object.keys(c.match).length).toBeGreaterThan(0);
    }
  });
});

describe("recommend", () => {
  it("suggests react review for a .tsx component", () => {
    const ids = recommend(node({ path: "src/components/Button.tsx", language: "typescript" })).map((c) => c.id);
    expect(ids).toContain("ecc:react-reviewer");
  });
  it("suggests security review for an auth-named symbol", () => {
    const ids = recommend(node({ name: "validatePassword" })).map((c) => c.id);
    expect(ids).toContain("ecc:security-reviewer");
  });
  it("returns nothing for a node with no catalog signals", () => {
    // ruby isn't in DEFAULT_CATALOG, util layer + neutral name/path => no match
    const ids = recommend(node({ language: "ruby", path: "lib/util.rb", layer: "util", name: "noop" })).map((c) => c.id);
    expect(ids).toEqual([]);
  });
});
