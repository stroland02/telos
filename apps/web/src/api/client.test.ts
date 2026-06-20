import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApi } from "./client";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe("createApi", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("overview() GETs /api/overview and returns the view", async () => {
    const f = mockFetch(200, { nodes: [{ id: "layer:api" }], edges: [] });
    vi.stubGlobal("fetch", f);
    const api = createApi();
    const view = await api.overview();
    expect(f).toHaveBeenCalledWith("/api/overview");
    expect(view.nodes[0].id).toBe("layer:api");
  });

  it("cluster(id) encodes the id and returns null on 404", async () => {
    const f = mockFetch(404, { error: "cluster not found" });
    vi.stubGlobal("fetch", f);
    const api = createApi();
    const result = await api.cluster("module:api:src/api");
    expect(f).toHaveBeenCalledWith("/api/cluster/module%3Aapi%3Asrc%2Fapi");
    expect(result).toBeNull();
  });

  it("node(id) returns the detail on 200", async () => {
    const f = mockFetch(200, { node: { id: "s1", name: "getUser" }, callers: [], callees: [] });
    vi.stubGlobal("fetch", f);
    const api = createApi();
    const detail = await api.node("s1");
    expect(detail?.node.name).toBe("getUser");
  });

  it("search(q) returns results array", async () => {
    const f = mockFetch(200, { results: [{ id: "s1", name: "getUser" }] });
    vi.stubGlobal("fetch", f);
    const api = createApi();
    const hits = await api.search("get");
    expect(f).toHaveBeenCalledWith("/api/search?q=get");
    expect(hits[0].name).toBe("getUser");
  });
});
