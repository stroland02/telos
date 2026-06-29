import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { estimateTokens, recordActivity, readActivity, computeUsage, computeHistory } from "./activity.js";

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

describe("computeHistory", () => {
  it("returns empty history when nothing recorded", () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-hist-"));
    expect(computeHistory(dir)).toEqual({ totalPrompts: 0, totalInjected: 0, distinctAgents: 0, firstTs: null, lastTs: null, days: [] });
    rmSync(dir, { recursive: true, force: true });
  });

  it("aggregates per-day prompts, distinct agents, and injected tokens", () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-hist-"));
    const d1 = Date.parse("2026-06-20T10:00:00Z");
    const d2 = Date.parse("2026-06-21T09:00:00Z");
    recordActivity(dir, { ts: d1, promptSnippet: "a", intent: "feature build", agents: ["ecc:a", "sp:b"], sources: [], injectedTokens: 100 });
    recordActivity(dir, { ts: d1 + 3600_000, promptSnippet: "b", intent: "bug fix", agents: ["ecc:a"], sources: [], injectedTokens: 40 });
    recordActivity(dir, { ts: d2, promptSnippet: "c", intent: "explain", agents: [], sources: [] }); // silent — excluded
    recordActivity(dir, { ts: d2 + 60_000, promptSnippet: "d", intent: "review", agents: ["ecc:c"], sources: [], injectedTokens: 25 });

    const h = computeHistory(dir);
    expect(h.totalPrompts).toBe(3); // the silent one is excluded
    expect(h.totalInjected).toBe(165);
    expect(h.distinctAgents).toBe(3); // ecc:a, sp:b, ecc:c
    expect(h.firstTs).toBe(d1);
    expect(h.lastTs).toBe(d2 + 60_000);
    expect(h.days.map((d) => d.day)).toEqual(["2026-06-20", "2026-06-21"]);
    expect(h.days[0]).toEqual({ day: "2026-06-20", prompts: 2, agents: 2, injectedTokens: 140 });
    expect(h.days[1]).toEqual({ day: "2026-06-21", prompts: 1, agents: 1, injectedTokens: 25 });
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("computeUsage", () => {
  const T = 60 * 60_000; // a base "now" of 1h in ms, so recency math is meaningful

  it("returns empty usage when nothing recorded", () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-usage-"));
    expect(computeUsage(dir)).toEqual({ windowPrompts: 0, activeCount: 0, agents: [], sources: [] });
    rmSync(dir, { recursive: true, force: true });
  });

  it("tallies agents + sources busiest-first, tracks recency, flags active", () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-usage-"));
    recordActivity(dir, { ts: T - 2000, promptSnippet: "a", intent: "feature build", agents: ["ecc:typescript-reviewer", "superpowers:brainstorming"], sources: [] });
    recordActivity(dir, { ts: T - 1000, promptSnippet: "b", intent: "bug fix", agents: ["ecc:typescript-reviewer"], sources: [] });
    recordActivity(dir, { ts: T, promptSnippet: "c", intent: "explain", agents: [], sources: [] }); // silent prompt — ignored

    const u = computeUsage(dir, 20, 6, 30, T);
    expect(u.windowPrompts).toBe(2); // the empty-agents entry is excluded
    expect(u.activeCount).toBe(2);   // both routed within the active window + time
    expect(u.agents[0]).toEqual({ id: "ecc:typescript-reviewer", count: 2, lastTs: T - 1000, active: true });
    expect(u.agents.find((a) => a.id === "superpowers:brainstorming")).toEqual({ id: "superpowers:brainstorming", count: 1, lastTs: T - 2000, active: true });
    expect(u.sources[0]).toEqual({ source: "ecc", count: 2, lastTs: T - 1000 });
    expect(u.sources.find((s) => s.source === "superpowers")!.count).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("honors the rolling window (only the most recent N routed prompts)", () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-usage-"));
    for (let i = 0; i < 5; i++) recordActivity(dir, { ts: T - (5 - i) * 1000, promptSnippet: "p", intent: "x", agents: ["ecc:a"], sources: [] });
    const u = computeUsage(dir, 2, 6, 30, T);
    expect(u.windowPrompts).toBe(2);
    expect(u.agents[0]).toEqual({ id: "ecc:a", count: 2, lastTs: T - 1000, active: true });
    rmSync(dir, { recursive: true, force: true });
  });

  it("retires an agent older than activeMinutes (time cutoff drains on a pause)", () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-usage-"));
    recordActivity(dir, { ts: T - 40 * 60_000, promptSnippet: "old", intent: "x", agents: ["ecc:old-reviewer"], sources: [] }); // 40 min ago
    recordActivity(dir, { ts: T - 1000, promptSnippet: "new", intent: "x", agents: ["ecc:fresh-reviewer"], sources: [] });
    const u = computeUsage(dir, 20, 6, 30, T);
    expect(u.agents.find((a) => a.id === "ecc:old-reviewer")!.active).toBe(false);
    expect(u.agents.find((a) => a.id === "ecc:fresh-reviewer")!.active).toBe(true);
    expect(u.activeCount).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("retires an agent pushed out of the activeWindow prompt count even when recent in time", () => {
    const dir = mkdtempSync(join(tmpdir(), "telos-usage-"));
    for (let i = 0; i < 8; i++) recordActivity(dir, { ts: T - (8 - i) * 1000, promptSnippet: "p", intent: "x", agents: [`ecc:a${i}`], sources: [] });
    const u = computeUsage(dir, 20, 3, 30, T); // activeWindow = 3
    expect(u.activeCount).toBe(3);
    expect(u.agents.find((a) => a.id === "ecc:a7")!.active).toBe(true);  // last prompt
    expect(u.agents.find((a) => a.id === "ecc:a0")!.active).toBe(false); // 8 prompts ago
    rmSync(dir, { recursive: true, force: true });
  });
});
