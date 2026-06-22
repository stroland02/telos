import { describe, it, expect } from "vitest";
import { runScan, runEnrich, buildProgram } from "./main.js";
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

describe("telos setup command", () => {
  it("is registered", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toContain("setup");
  });
});

describe("telos enrich command", () => {
  it("is registered", () => {
    const names = buildProgram().commands.map((c) => c.name());
    expect(names).toContain("enrich");
  });
});

describe("runEnrich enricher selection", () => {
  it("completes via fallback on the LLM path when no server is running", async () => {
    await runScan(repo); // ensure a graph.db exists
    const r = await runEnrich(repo, { llm: true, concurrency: 2 });
    expect(r.enriched).toBeGreaterThan(0); // fallback guarantees completion
    expect(r.enricher).toBe("llm");
  });
});

describe("telos tour command", () => {
  it("is registered", () => {
    expect(buildProgram().commands.map((c) => c.name())).toContain("tour");
  });
});

describe("telos ask command", () => {
  it("is registered", () => {
    expect(buildProgram().commands.map((c) => c.name())).toContain("ask");
  });
});
