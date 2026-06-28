import { describe, it, expect, vi, afterEach } from "vitest";
import { createApi } from "./client";

afterEach(() => vi.restoreAllMocks());

describe("mcpActivity", () => {
  it("GETs /api/harness/mcp-activity", async () => {
    const feed = { entries: [], totals: { queries: 0, tokens: 0 } };
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(feed), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const api = createApi("");
    const out = await api.mcpActivity();
    expect(spy).toHaveBeenCalledWith("/api/harness/mcp-activity");
    expect(out).toEqual(feed);
  });
});
