import { describe, it, expect } from "vitest";
import { createNodeId } from "./schema.js";

describe("createNodeId", () => {
  it("is deterministic for the same inputs", () => {
    expect(createNodeId("src/a.ts", "foo")).toBe(createNodeId("src/a.ts", "foo"));
  });
  it("differs when path or qualified name differs", () => {
    expect(createNodeId("src/a.ts", "foo")).not.toBe(createNodeId("src/b.ts", "foo"));
    expect(createNodeId("src/a.ts", "foo")).not.toBe(createNodeId("src/a.ts", "bar"));
  });
  it("returns a 40-char hex sha1", () => {
    expect(createNodeId("src/a.ts", "foo")).toMatch(/^[0-9a-f]{40}$/);
  });
});
