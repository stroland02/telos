import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordActivity, readActivity } from "./activity.js";

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
