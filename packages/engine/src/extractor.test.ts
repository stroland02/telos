import { describe, it, expect, beforeAll } from "vitest";
import { Parser } from "./parser.js";
import { extractFile } from "./extractor.js";

let parser: Parser;
beforeAll(async () => { parser = await Parser.create(); });

describe("extractFile (TypeScript)", () => {
  it("extracts a file node, a function node, and a contains edge", () => {
    const source = "function foo() { bar(); }";
    const tree = parser.parse(source, "typescript");
    const { nodes, edges } = extractFile({ tree, source, relPath: "src/a.ts", language: "typescript" });
    const kinds = nodes.map((n) => n.kind).sort();
    expect(kinds).toContain("file");
    expect(kinds).toContain("function");
    expect(nodes.find((n) => n.kind === "function")?.name).toBe("foo");
    expect(edges.some((e) => e.kind === "contains")).toBe(true);
    // intra-file call recorded but not yet resolved
    expect(edges.some((e) => e.kind === "calls" && e.resolved === false)).toBe(true);
  });
});

describe("extractFile complexity + lines", () => {
  it("computes cyclomatic complexity from branches and lines from the definition", () => {
    const source = [
      "function simple() { return 1; }",
      "function branchy(x) {",
      "  if (x > 0) { return 1; }",
      "  for (let i = 0; i < x; i++) { doIt(); }",
      "  return x && x > 2 ? 1 : 0;",
      "}",
    ].join("\n");
    const tree = parser.parse(source, "typescript");
    const { nodes } = extractFile({ tree, source, relPath: "src/a.ts", language: "typescript" });
    const simple = nodes.find((n) => n.name === "simple")!;
    const branchy = nodes.find((n) => n.name === "branchy")!;
    expect(simple.complexity).toBe(1); // no branches => base complexity 1
    expect(branchy.complexity).toBeGreaterThan(3); // if + for + && + ternary
    expect(branchy.lines).toBeGreaterThan(1); // whole definition, not just the name line
  });
});

describe("extractFile (Python)", () => {
  it("extracts a python function node", () => {
    const source = "def foo():\n    bar()\n";
    const tree = parser.parse(source, "python");
    const { nodes } = extractFile({ tree, source, relPath: "src/a.py", language: "python" });
    expect(nodes.find((n) => n.kind === "function")?.name).toBe("foo");
  });
});
