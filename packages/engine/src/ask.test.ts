import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "./schema.js";
import { askGraph } from "./ask.js";

function node(id: string, name: string, path: string, summary: string | null, fanIn = 0): TelosNode {
  return {
    id, kind: "function", name, qualifiedName: name, language: "ts", path,
    lineStart: 1, lineEnd: 2, layer: "service", fanIn, fanOut: 0, lines: 2, complexity: 0, summary,
  };
}

const graph: TelosGraph = {
  nodes: [
    node("a", "authenticateUser", "src/auth/login.ts", "Validates user credentials and issues a token.", 5),
    node("b", "renderChart", "src/ui/chart.ts", "Draws a chart.", 1),
    node("c", "hashPassword", "src/auth/crypto.ts", "Hashes a password.", 2),
  ],
  edges: [],
};

describe("askGraph", () => {
  it("ranks the most relevant node first for a natural-language question", () => {
    const answers = askGraph(graph, "where does user authentication happen?");
    expect(answers[0].node.id).toBe("a");
    expect(answers[0].score).toBeGreaterThan(0);
  });

  it("returns only matching nodes and respects the limit", () => {
    const answers = askGraph(graph, "password", { limit: 1 });
    expect(answers).toHaveLength(1);
    expect(answers[0].node.id).toBe("c");
  });

  it("returns empty for a question with no overlap", () => {
    expect(askGraph(graph, "kubernetes deployment yaml")).toEqual([]);
  });

  it("matches camelCase identifiers and plurals (saveOrder ~ 'orders')", () => {
    const g: TelosGraph = {
      nodes: [node("s", "saveOrder", "src/orderService.ts", null, 3), node("u", "renderChart", "src/ui.ts", null, 1)],
      edges: [],
    };
    const answers = askGraph(g, "where are orders saved");
    expect(answers[0].node.id).toBe("s");
  });
});
