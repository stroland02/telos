import { describe, it, expect } from "vitest";
import { TelosNode } from "@telos/engine";
import { Capability } from "./capability.js";
import { recommendFor, specificity, recommendForNodes } from "./recommend.js";

function node(over: Partial<TelosNode> = {}): TelosNode {
  return {
    id: "x", kind: "function", name: "f", qualifiedName: "app/f",
    language: "python", path: "app/models.py", lineStart: 1, lineEnd: 9,
    layer: "data", fanIn: 0, fanOut: 0, lines: 9, complexity: 1, summary: null, ...over,
  };
}

const CATALOG: Capability[] = [
  { id: "ecc:python-reviewer", kind: "agent", source: "ecc", title: "Python review", match: { languages: ["python"] } },
  { id: "ecc:django-reviewer", kind: "agent", source: "ecc", title: "Django review", match: { languages: ["python"], pathIncludes: ["models", "views"] } },
  { id: "ecc:react-reviewer", kind: "agent", source: "ecc", title: "React review", match: { pathIncludes: [".tsx"] } },
];

describe("specificity", () => {
  it("counts present criterion types", () => {
    expect(specificity({ languages: ["python"] })).toBe(1);
    expect(specificity({ languages: ["python"], pathIncludes: ["models"] })).toBe(2);
  });
});

describe("recommendFor", () => {
  it("returns matches ranked most-specific first", () => {
    const ids = recommendFor(node(), CATALOG).map((c) => c.id);
    expect(ids).toEqual(["ecc:django-reviewer", "ecc:python-reviewer"]);
  });
  it("excludes non-matching capabilities", () => {
    const ids = recommendFor(node({ language: "go", path: "main.go", layer: "service" }), CATALOG).map((c) => c.id);
    expect(ids).toEqual([]);
  });
});

describe("recommendForNodes", () => {
  it("aggregates matches across nodes with counts", () => {
    const nodes: TelosNode[] = [
      node({ id: "1", language: "python", path: "app/models.py" }),
      node({ id: "2", language: "python", path: "app/service.py", layer: "service" }),
    ];
    const ranked = recommendForNodes(nodes, CATALOG);
    const python = ranked.find((r) => r.capability.id === "ecc:python-reviewer");
    const django = ranked.find((r) => r.capability.id === "ecc:django-reviewer");
    expect(python?.matchCount).toBe(2);   // both python files
    expect(django?.matchCount).toBe(1);   // only models.py
    // sorted by matchCount desc, so python (2) comes before django (1)
    expect(ranked[0].capability.id).toBe("ecc:python-reviewer");
  });
});
