import { describe, it, expect } from "vitest";
import { TelosGraph, TelosNode } from "../schema.js";
import { buildNodeIndex } from "./match.js";
import { parseFoldedStacks, ProfileBuffer } from "./profile.js";

function node(id: string, qn: string): TelosNode {
  return {
    id, kind: "function", name: qn, qualifiedName: qn, language: "ts", path: "a.ts",
    lineStart: 1, lineEnd: 5, layer: "service", fanIn: 0, fanOut: 0, lines: 5, complexity: 0, summary: null,
  };
}
const graph: TelosGraph = {
  nodes: [node("M", "main"), node("H", "handle"), node("P", "process"), node("S", "save")],
  edges: [],
};
const index = buildNodeIndex(graph);

describe("parseFoldedStacks", () => {
  it("parses collapsed stacks and skips bad lines", () => {
    const text = "main;handle;process 5\nmain;handle;save 3\n\nbroken_no_count\nmain 2\n";
    const samples = parseFoldedStacks(text);
    expect(samples).toHaveLength(3);
    expect(samples[0]).toEqual({ frames: ["main", "handle", "process"], count: 5 });
    expect(samples[2]).toEqual({ frames: ["main"], count: 2 });
  });
});

describe("ProfileBuffer", () => {
  it("computes self (leaf) and total (anywhere) samples per node", () => {
    const buf = new ProfileBuffer();
    buf.record(parseFoldedStacks("main;handle;process 5\nmain;handle;save 3\nmain 2"), index);
    const snap = buf.snapshot();
    expect(snap.totalSamples).toBe(10);

    const byId = Object.fromEntries(snap.nodes.map((n) => [n.nodeId, n]));
    expect(byId["M"]).toMatchObject({ self: 2, total: 10 }); // main is leaf only in "main 2"; in every stack
    expect(byId["H"]).toMatchObject({ self: 0, total: 8 });  // never a leaf; in two stacks (5+3)
    expect(byId["P"]).toMatchObject({ self: 5, total: 5 });
    expect(byId["S"]).toMatchObject({ self: 3, total: 3 });
    // sorted by total desc → main first
    expect(snap.nodes[0].nodeId).toBe("M");
  });

  it("tallies unmatched leaf samples and accumulates across records", () => {
    const buf = new ProfileBuffer();
    buf.record(parseFoldedStacks("unknownLeaf 4"), index);
    buf.record(parseFoldedStacks("main;process 1"), index);
    const snap = buf.snapshot();
    expect(snap.unmatched).toBe(4);
    expect(snap.totalSamples).toBe(5);
    expect(snap.nodes.find((n) => n.nodeId === "P")!.self).toBe(1);
  });
});
