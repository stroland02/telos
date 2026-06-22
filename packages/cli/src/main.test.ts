import { describe, it, expect } from "vitest";
import { runScan, buildProgram } from "./main.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../engine/fixtures/scan-sample");

describe("runScan", () => {
  it("returns a summary with positive node count", async () => {
    const summary = await runScan(repo);
    expect(summary.nodeCount).toBeGreaterThan(0);
    expect(summary.edgeCount).toBeGreaterThan(0);
    expect(summary.dbPath).toMatch(/graph\.db$/);
  });
});

describe("telos mcp command", () => {
  it("is registered", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toContain("mcp");
  });
});

describe("telos doctor command", () => {
  it("is registered", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toContain("doctor");
  });
});

describe("telos route command", () => {
  it("is registered", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toContain("route");
  });
});
