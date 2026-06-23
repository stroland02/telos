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

  it("traceState() GETs /api/trace/state", async () => {
    const state = { nodes: [{ id: "A", calls: 2, p95Ms: 10, errors: 0 }], edges: [], unmapped: 0, unmappedEdges: 0, windowMs: 30000 };
    const f = mockFetch(200, state);
    vi.stubGlobal("fetch", f);
    const api = createApi();
    expect(await api.traceState()).toEqual(state);
    expect(f).toHaveBeenCalledWith("/api/trace/state");
  });

  it("recentTraces() and traceReplay() hit the right endpoints", async () => {
    const f = mockFetch(200, { traces: [{ traceId: "t1", rootName: "A", spanCount: 2, durationMs: 9, hasError: false }] });
    vi.stubGlobal("fetch", f);
    const api = createApi();
    const traces = await api.recentTraces(5);
    expect(f).toHaveBeenCalledWith("/api/trace/recent?limit=5");
    expect(traces[0].traceId).toBe("t1");

    const f2 = mockFetch(200, { steps: [{ order: 0, spanId: "s0", name: "A", nodeId: "A", durationMs: 5, isError: false, depth: 0 }] });
    vi.stubGlobal("fetch", f2);
    const steps = await createApi().traceReplay("t1");
    expect(f2).toHaveBeenCalledWith("/api/trace/replay/t1");
    expect(steps[0].nodeId).toBe("A");
  });

  it("nodeLogs(id) scopes the request to the node", async () => {
    const f = mockFetch(200, { logs: [{ ts: 1, severity: "ERROR", body: "boom", attrs: {}, nodeId: "n1" }] });
    vi.stubGlobal("fetch", f);
    const api = createApi();
    const logs = await api.nodeLogs("n1", 20);
    expect(f).toHaveBeenCalledWith("/api/logs?node=n1&limit=20");
    expect(logs[0].body).toBe("boom");
  });

  it("subscribeTrace() parses SSE frames and unsubscribes by closing", () => {
    let last: FakeES | null = null;
    class FakeES {
      onmessage: ((ev: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      closed = false;
      constructor(public url: string) { last = this; }
      close() { this.closed = true; }
    }
    vi.stubGlobal("EventSource", FakeES as unknown as typeof EventSource);
    const api = createApi();
    const received: unknown[] = [];
    const unsubscribe = api.subscribeTrace((s) => received.push(s));

    expect(last!.url).toBe("/api/trace/stream");
    last!.onmessage!({ data: JSON.stringify({ nodes: [{ id: "A", calls: 1, p95Ms: 5, errors: 0 }], edges: [], unmapped: 0, unmappedEdges: 0, windowMs: 30000 }) });
    last!.onmessage!({ data: "not json" }); // bad frame ignored, no throw
    expect(received).toHaveLength(1);
    expect((received[0] as { nodes: unknown[] }).nodes).toHaveLength(1);

    unsubscribe();
    expect(last!.closed).toBe(true);
  });
});
