import { describe, it, expect } from "vitest";
import { readStdinPattern, formatGrepAssist } from "./grepAssist.js";
import type { TelosNode } from "@telos/engine";

const node = (over: Partial<TelosNode>): TelosNode => ({
  id: "x", kind: "function", name: "n", qualifiedName: "pkg/f.ts:doThing",
  path: "pkg/f.ts", lineStart: 12, lineEnd: 20, language: "typescript", layer: "service",
  ...over,
} as TelosNode);

describe("readStdinPattern", () => {
  it("extracts the Grep pattern", () => {
    expect(readStdinPattern(JSON.stringify({ tool_input: { pattern: "doThing" } }))).toBe("doThing");
  });
  it("falls back to a Glob query and trims", () => {
    expect(readStdinPattern(JSON.stringify({ tool_input: { query: "  foo  " } }))).toBe("foo");
  });
  it("returns null on malformed / empty input", () => {
    expect(readStdinPattern("not json")).toBeNull();
    expect(readStdinPattern(JSON.stringify({ tool_input: {} }))).toBeNull();
    expect(readStdinPattern(JSON.stringify({ tool_input: { pattern: "  " } }))).toBeNull();
  });
});

describe("formatGrepAssist", () => {
  it("returns null when there are no matches (so grep runs normally)", () => {
    expect(formatGrepAssist([], "doThing")).toBeNull();
  });
  it("lists matches with location and steers toward telos_* tools", () => {
    const out = formatGrepAssist([node({}), node({ qualifiedName: "pkg/g.ts:other", path: "pkg/g.ts", lineStart: 3 })], "doThing")!;
    expect(out).toContain('matched "doThing"');
    expect(out).toContain("telos_explore");
    expect(out).toContain("pkg/f.ts:12");
    expect(out).toContain("pkg/g.ts:3");
  });
  it("caps the number of rows", () => {
    const many = Array.from({ length: 20 }, (_, i) => node({ qualifiedName: `q${i}`, lineStart: i + 1 }));
    const out = formatGrepAssist(many, "q", 5)!;
    expect(out.split("•").length - 1).toBe(5);
    expect(out).toContain("20 symbols");
  });
});
