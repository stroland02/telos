import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useNavigation } from "./useNavigation";
import { TelosApi } from "../api/client";
import { GraphView } from "../api/types";

const overview: GraphView = {
  nodes: [{ id: "layer:api", label: "api", level: "layer", layer: "api", symbolCount: 1, fanIn: 0, fanOut: 0, complexity: 0 }],
  edges: [],
};
const apiChildren: GraphView = {
  nodes: [{ id: "module:api:src/api", label: "src/api", level: "module", layer: "api", symbolCount: 1, fanIn: 0, fanOut: 0, complexity: 0 }],
  edges: [],
};

function fakeApi(overrides: Partial<TelosApi> = {}): TelosApi {
  return {
    overview: vi.fn().mockResolvedValue(overview),
    cluster: vi.fn().mockResolvedValue(apiChildren),
    node: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue([]),
    files: vi.fn().mockResolvedValue([]),
    source: vi.fn().mockResolvedValue(null),
    recommendations: vi.fn().mockResolvedValue([]),
    tour: vi.fn().mockResolvedValue([]),
    ask: vi.fn().mockResolvedValue([]),
    traceState: vi.fn().mockResolvedValue({ nodes: [], edges: [], unmapped: 0, unmappedEdges: 0, windowMs: 30000 }),
    subscribeTrace: vi.fn().mockReturnValue(() => {}),
    recentTraces: vi.fn().mockResolvedValue([]),
    traceReplay: vi.fn().mockResolvedValue([]),
    nodeLogs: vi.fn().mockResolvedValue([]),
    nodeMetrics: vi.fn().mockResolvedValue([]),
    profile: vi.fn().mockResolvedValue({ nodes: [], totalSamples: 0, unmatched: 0 }),
    processes: vi.fn().mockResolvedValue([]),
    subscribeForge: vi.fn().mockReturnValue(() => {}),
    subscribeResolve: vi.fn().mockReturnValue(() => {}),
    harnessStatus: vi.fn(),
    contextPack: vi.fn().mockResolvedValue(""),
    buildMemory: vi.fn().mockResolvedValue({ enriched: 0, total: 0 }),
    measure: vi.fn().mockResolvedValue({ baselineTokens: 0, packTokens: 0, reductionPct: 0, ratio: 1, costSavedUsd: 0, files: 0, missing: 0 }),
    stats: vi.fn(),
    activate: vi.fn().mockResolvedValue({ statusLinePresent: false }),
    activationState: vi.fn().mockResolvedValue({ statusLinePresent: false }),
    harnessConfig: vi.fn().mockResolvedValue({ enabled: [] }),
    harnessSelect: vi.fn().mockResolvedValue({ enabled: [] }),
    harnessActivity: vi.fn().mockResolvedValue({ entries: [], tally: [] }),
    mcpActivity: vi.fn().mockResolvedValue({ entries: [], totals: { queries: 0, tokens: 0 } }),
    usage: vi.fn().mockResolvedValue({ windowPrompts: 0, agents: [], sources: [] }),
    ...overrides,
  };
}

describe("useNavigation", () => {
  it("loads the overview with a root crumb on mount", async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useNavigation(api));
    await waitFor(() => expect(result.current.view).not.toBeNull());
    expect(result.current.view!.nodes[0].id).toBe("layer:api");
    expect(result.current.crumbs).toEqual([{ id: null, label: "Overview" }]);
  });

  it("drillInto a cluster pushes a crumb and swaps the view", async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useNavigation(api));
    await waitFor(() => expect(result.current.view).not.toBeNull());
    act(() => result.current.drillInto({ id: "layer:api", label: "api", level: "layer" }));
    await waitFor(() => expect(result.current.crumbs).toHaveLength(2));
    expect(api.cluster).toHaveBeenCalledWith("layer:api");
    expect(result.current.view!.nodes[0].id).toBe("module:api:src/api");
    expect(result.current.crumbs[1]).toEqual({ id: "layer:api", label: "api" });
  });

  it("does not drill into a symbol-level leaf", async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useNavigation(api));
    await waitFor(() => expect(result.current.view).not.toBeNull());
    act(() => result.current.drillInto({ id: "s1", label: "getUser", level: "symbol" }));
    expect(api.cluster).not.toHaveBeenCalled();
    expect(result.current.crumbs).toHaveLength(1);
  });

  it("goToCrumb(0) returns to the overview", async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useNavigation(api));
    await waitFor(() => expect(result.current.view).not.toBeNull());
    act(() => result.current.drillInto({ id: "layer:api", label: "api", level: "layer" }));
    await waitFor(() => expect(result.current.crumbs).toHaveLength(2));
    act(() => result.current.goToCrumb(0));
    await waitFor(() => expect(result.current.crumbs).toHaveLength(1));
    expect(result.current.view!.nodes[0].id).toBe("layer:api");
  });
});
