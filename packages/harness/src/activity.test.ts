import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { estimateTokens, recordActivity, readActivity, computeUsage } from "./activity.js";

describe("activity log", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "telos-activity-")); });

  it("returns an empty feed when nothing has been recorded", () => {
    expect(readActivity(dir)).toEqual({ entries: [], tally: [] });
    rmSync(dir, { recursive: true, force: true });
  });

  it("appends entries and reads them back newest-first with a tally", () => {
    recordActivity(dir, { ts: 1, promptSnippet: "build x", intent: "feature build", agents: ["superpowers:brainstorming", "ecc:code-reviewer"], sources: ["superpowers", "ecc"] });
    recordActivity(dir, { ts: 2, promptSnippet: "fix y", intent: "bug fix", agents: ["ecc:code-reviewer"], sources: ["ecc"] });

    const feed = readActivity(dir, 10);
    expect(feed.entries.map((e) => e.ts)).toEqual([2, 1]); // newest first
    expect(feed.tally[0]).toEqual({ id: "ecc:code-reviewer", count: 2 });
    expect(feed.tally.find((t) => t.id === "superpowers:brainstorming")!.count).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("estimateTokens", () => {
  it("is ceil(length/4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("activity entry with injected fields", () => {
  it("round-trips injectedTokens and block", () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-act-"));
    recordActivity(dir, {
      ts: 1, promptSnippet: "p", intent: "bug-fix", agents: ["a"], sources: ["x"],
      injectedTokens: 42, block: "PLAN BLOCK",
    });
    const feed = readActivity(dir);
    expect(feed.entries[0].injectedTokens).toBe(42);
    expect(feed.entries[0].block).toBe("PLAN BLOCK");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("computeUsage", () => {
  it("returns empty usage when nothing recorded", () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-usage-"));
    expect(computeUsage(dir)).toEqual({ windowPrompts: 0, agents: [], sources: [] });
    rmSync(dir, { recursive: true, force: true });
  });

  it("tallies agents + sources busiest-first and tracks recency", () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-usage-"));
    recordActivity(dir, { ts: 1, promptSnippet: "a", intent: "feature build", agents: ["ecc:typescript-reviewer", "superpowers:brainstorming"], sources: [] });
    recordActivity(dir, { ts: 2, promptSnippet: "b", intent: "bug fix", agents: ["ecc:typescript-reviewer"], sources: [] });
    recordActivity(dir, { ts: 3, promptSnippet: "c", intent: "explain", agents: [], sources: [] }); // silent prompt — ignored

    const u = computeUsage(dir);
    expect(u.windowPrompts).toBe(2); // the empty-agents entry is excluded
    expect(u.agents[0]).toEqual({ id: "ecc:typescript-reviewer", count: 2, lastTs: 2 });
    expect(u.agents.find((a) => a.id === "superpowers:brainstorming")).toEqual({ id: "superpowers:brainstorming", count: 1, lastTs: 1 });
    expect(u.sources[0]).toEqual({ source: "ecc", count: 2, lastTs: 2 });
    expect(u.sources.find((s) => s.source === "superpowers")!.count).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("honors the rolling window (only the most recent N routed prompts)", () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-usage-"));
    for (let i = 0; i < 5; i++) recordActivity(dir, { ts: i, promptSnippet: "p", intent: "x", agents: ["ecc:a"], sources: [] });
    const u = computeUsage(dir, 2);
    expect(u.windowPrompts).toBe(2);
    expect(u.agents[0]).toEqual({ id: "ecc:a", count: 2, lastTs: 4 });
    rmSync(dir, { recursive: true, force: true });
  });
});
