import { describe, it, expect } from "vitest";
import { mkdtempSync, appendFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordMcpQuery, readMcpActivity } from "./mcpActivity.js";

function tmp() { return mkdtempSync(join(tmpdir(), "telos-mcp-")); }

describe("mcp activity", () => {
  it("returns an empty feed when no log exists", () => {
    const feed = readMcpActivity(tmp());
    expect(feed).toEqual({ entries: [], totals: { queries: 0, tokens: 0 } });
  });

  it("round-trips entries newest-first and totals", () => {
    const dir = tmp();
    recordMcpQuery(dir, { ts: 1, tool: "telos_explore", argsSummary: "auth", resultTokens: 10 });
    recordMcpQuery(dir, { ts: 2, tool: "telos_ask", argsSummary: "where login", resultTokens: 5 });
    const feed = readMcpActivity(dir);
    expect(feed.entries.map((e) => e.tool)).toEqual(["telos_ask", "telos_explore"]);
    expect(feed.totals).toEqual({ queries: 2, tokens: 15 });
  });

  it("skips malformed lines without throwing", () => {
    const dir = tmp();
    const path = join(dir, ".telos-mcp-test"); // ignored; we write the real file below
    void path;
    recordMcpQuery(dir, { ts: 1, tool: "telos_ask", argsSummary: "q", resultTokens: 3 });
    appendFileSync(join(dir, "mcp-activity.jsonl"), "{not json\n");
    const feed = readMcpActivity(dir);
    expect(feed.totals.queries).toBe(1);
  });

  it("honors limit (most recent N)", () => {
    const dir = tmp();
    for (let i = 0; i < 5; i++) recordMcpQuery(dir, { ts: i, tool: "t", argsSummary: "", resultTokens: 1 });
    const feed = readMcpActivity(dir, 2);
    expect(feed.entries.length).toBe(2);
    expect(feed.totals.queries).toBe(5); // totals span the whole log
    void writeFileSync;
  });
});
