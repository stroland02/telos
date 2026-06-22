import { describe, it, expect } from "vitest";
import { TelosNode } from "@telos/engine";
import { matchesNode, CapabilityMatch } from "./capability.js";

function node(over: Partial<TelosNode> = {}): TelosNode {
  return {
    id: "x", kind: "function", name: "handler", qualifiedName: "app/handler",
    language: "typescript", path: "src/app/handler.ts", lineStart: 1, lineEnd: 9,
    layer: "service", fanIn: 0, fanOut: 0, lines: 9, complexity: 1, summary: null, ...over,
  };
}

describe("matchesNode", () => {
  it("matches on layer", () => {
    expect(matchesNode(node({ layer: "data" }), { layers: ["data"] })).toBe(true);
    expect(matchesNode(node({ layer: "ui" }), { layers: ["data"] })).toBe(false);
  });
  it("matches language case-insensitively", () => {
    expect(matchesNode(node({ language: "Python" }), { languages: ["python"] })).toBe(true);
  });
  it("matches path substring case-insensitively", () => {
    expect(matchesNode(node({ path: "src/Components/Button.tsx" }), { pathIncludes: [".tsx"] })).toBe(true);
    expect(matchesNode(node({ path: "src/util.ts" }), { pathIncludes: [".tsx"] })).toBe(false);
  });
  it("matches name/qualifiedName substring", () => {
    expect(matchesNode(node({ name: "verifyAuthToken" }), { nameIncludes: ["auth"] })).toBe(true);
  });
  it("requires ALL present criteria (AND)", () => {
    const m: CapabilityMatch = { languages: ["python"], pathIncludes: ["models"] };
    expect(matchesNode(node({ language: "python", path: "app/models.py" }), m)).toBe(true);
    expect(matchesNode(node({ language: "python", path: "app/views.py" }), m)).toBe(false);
  });
  it("empty match never matches", () => {
    expect(matchesNode(node(), {})).toBe(false);
  });
});
