import { describe, it, expect, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { rmSync } from "node:fs";
import { scan } from "./pipeline.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../fixtures/scan-sample");

afterAll(() => rmSync(resolve(repo, ".telos"), { recursive: true, force: true }));

describe("scan", () => {
  it("builds a graph with nodes from both languages and a resolved call", async () => {
    rmSync(resolve(repo, ".telos"), { recursive: true, force: true });
    const { graph } = await scan(repo);
    const langs = new Set(graph.nodes.map((n) => n.language));
    expect(langs.has("typescript")).toBe(true);
    expect(langs.has("python")).toBe(true);
    expect(graph.nodes.some((n) => n.name === "processOrder" && n.layer === "service")).toBe(true);
    expect(graph.edges.some((e) => e.kind === "calls" && e.resolved)).toBe(true);
  });
});
