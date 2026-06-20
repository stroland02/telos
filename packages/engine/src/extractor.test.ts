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

describe("extractFile (Python)", () => {
  it("extracts a python function node", () => {
    const source = "def foo():\n    bar()\n";
    const tree = parser.parse(source, "python");
    const { nodes } = extractFile({ tree, source, relPath: "src/a.py", language: "python" });
    expect(nodes.find((n) => n.kind === "function")?.name).toBe("foo");
  });
});
