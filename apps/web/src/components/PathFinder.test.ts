import { describe, it, expect } from "vitest";
import { bfsPath } from "./PathFinder";

const edges = [
  { source: "a", target: "b" },
  { source: "b", target: "c" },
  { source: "a", target: "d" },
  { source: "d", target: "c" },
];

describe("bfsPath", () => {
  it("returns direct path a→b", () => {
    expect(bfsPath("a", "b", edges)).toEqual(["a", "b"]);
  });

  it("returns shortest path a→c (2 hops, not 3)", () => {
    const p = bfsPath("a", "c", edges);
    expect(p).not.toBeNull();
    expect(p!.length).toBe(3); // a→b→c or a→d→c
    expect(p![0]).toBe("a");
    expect(p![2]).toBe("c");
  });

  it("returns [a] for same source and target", () => {
    expect(bfsPath("a", "a", edges)).toEqual(["a"]);
  });

  it("returns null when no path exists (reversed direction)", () => {
    expect(bfsPath("c", "a", edges)).toBeNull();
  });
});
