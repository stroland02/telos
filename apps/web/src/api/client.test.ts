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

  it("tour(limit) GETs /api/tour with the limit and returns stops", async () => {
    const f = mockFetch(200, { stops: [{ id: "a", qualifiedName: "m/a", summary: null, order: 0 }] });
    vi.stubGlobal("fetch", f);
    const api = createApi();
    const stops = await api.tour(5);
    expect(f).toHaveBeenCalledWith("/api/tour?limit=5");
    expect(stops[0].qualifiedName).toBe("m/a");
  });

  it("ask(question) encodes the query and returns answers", async () => {
    const f = mockFetch(200, { answers: [{ id: "a", qualifiedName: "m/a", path: "a.ts", summary: null, score: 2 }] });
    vi.stubGlobal("fetch", f);
    const api = createApi();
    const answers = await api.ask("where is auth");
    expect(f).toHaveBeenCalledWith("/api/ask?q=where%20is%20auth");
    expect(answers[0].id).toBe("a");
  });
});
