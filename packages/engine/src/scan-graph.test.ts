import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanGraph } from "./pipeline.js";

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe("scanGraph", () => {
  it("returns a graph WITHOUT writing .telos/graph.db", async () => {
    dir = mkdtempSync(join(tmpdir(), "telos-scan-"));
    writeFileSync(join(dir, "a.ts"), "export function hello() { return 1; }\n");
    const graph = await scanGraph(dir);
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, ".telos", "graph.db"))).toBe(false);
  });
});
