import { describe, it, expect } from "vitest";
import { runResolve } from "./resolve.js";
import { stubReviewDriver } from "./driver.js";
import { parseFindings } from "./claude-driver.js";
import { TelosGraph, TelosNode } from "@telos/engine";

function node(p: Partial<TelosNode> & { id: string }): TelosNode {
  return {
    id: p.id, kind: p.kind ?? "function", name: p.id, qualifiedName: p.qualifiedName ?? p.id,
    language: "typescript", path: p.path ?? `src/${p.id}.ts`, lineStart: 1, lineEnd: 10,
    layer: "service", fanIn: p.fanIn ?? 0, fanOut: 0, lines: 10, complexity: p.complexity ?? 1, summary: null,
  };
}

const graph: TelosGraph = {
  nodes: [
    node({ id: "f1", kind: "file", path: "src/a.ts" }),
    node({ id: "hot", qualifiedName: "a.hot", complexity: 20 }),
    node({ id: "mid", qualifiedName: "a.mid", complexity: 8 }),
    node({ id: "low", qualifiedName: "a.low", complexity: 1 }),
  ],
  edges: [],
};

describe("runResolve", () => {
  it("reviews the top-N symbols by complexity and collects findings", async () => {
    const seen: string[] = [];
    const state = await runResolve({ graph, driver: stubReviewDriver, repoDir: ".", limit: 2, onFinding: (f) => { seen.push(f.nodeId); } });
    expect(state.scanned).toBe(2);               // limited to 2
    expect(state.findings).toHaveLength(2);
    expect(state.findings[0].nodeId).toBe("hot"); // highest complexity first
    expect(state.findings[0].severity).toBe("warn");
    expect(seen).toContain("hot");
    expect(state.done).toBe(true);
  });

  it("skips file/module nodes (symbols only)", async () => {
    const state = await runResolve({ graph, driver: stubReviewDriver, repoDir: ".", limit: 10 });
    expect(state.findings.some((f) => f.nodeId === "f1")).toBe(false);
  });
});

describe("parseFindings", () => {
  const n = { id: "x", qualifiedName: "m.x", path: "m/x.ts", lineStart: 1, lineEnd: 5 };
  it("extracts a JSON array from agent text", () => {
    const out = parseFindings('Here are issues: [{"severity":"error","title":"NPE","detail":"d","suggestion":"s"}] done', n, "ecc:typescript-reviewer");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ nodeId: "x", file: "m/x.ts", severity: "error", title: "NPE", agent: "ecc:typescript-reviewer" });
  });
  it("returns [] on no array / bad json", () => {
    expect(parseFindings("no findings", n, "cap")).toEqual([]);
    expect(parseFindings("[not json", n, "cap")).toEqual([]);
  });
  it("defaults an unknown severity to warn", () => {
    const out = parseFindings('[{"title":"t"}]', n, "cap");
    expect(out[0].severity).toBe("warn");
  });
});
