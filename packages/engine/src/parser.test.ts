import { describe, it, expect, beforeAll } from "vitest";
import { Parser } from "./parser.js";

let parser: Parser;
beforeAll(async () => { parser = await Parser.create(); });

describe("Parser", () => {
  it("parses TypeScript into a syntax tree", () => {
    const tree = parser.parse("function foo() { return 1; }", "typescript");
    expect(tree.rootNode.type).toBe("program");
    expect(tree.rootNode.descendantsOfType("function_declaration").length).toBe(1);
  });
  it("parses Python", () => {
    const tree = parser.parse("def foo():\n    return 1\n", "python");
    expect(tree.rootNode.descendantsOfType("function_definition").length).toBe(1);
  });
  it("throws on an unknown language", () => {
    expect(() => parser.parse("x", "cobol")).toThrow(/no grammar/i);
  });
});
