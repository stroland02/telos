import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTraceOverlay } from "./useTraceOverlay";
import type { TelosApi } from "../api/client";
import type { TraceState } from "../api/types";

function apiWith(emit: { fn?: (s: TraceState) => void }): TelosApi {
  return {
    overview: vi.fn(), cluster: vi.fn(), node: vi.fn(), search: vi.fn(),
    files: vi.fn(), source: vi.fn(), recommendations: vi.fn(), tour: vi.fn(), ask: vi.fn(),
    traceState: vi.fn(),
    subscribeTrace: vi.fn().mockImplementation((onState: (s: TraceState) => void) => {
      emit.fn = onState;
      return () => { emit.fn = undefined; };
    }),
  } as unknown as TelosApi;
}

const sample: TraceState = {
  nodes: [{ id: "A", calls: 3, p95Ms: 30, errors: 1 }, { id: "B", calls: 1, p95Ms: 5, errors: 0 }],
  edges: [{ sourceId: "A", targetId: "B", calls: 1, errors: 0 }],
  unmapped: 2, unmappedEdges: 0, windowMs: 30000,
};

describe("useTraceOverlay", () => {
  it("returns an empty overlay when disabled", () => {
    const emit = {};
    const { result } = renderHook(() => useTraceOverlay(apiWith(emit), false));
    expect(result.current.state).toBeNull();
    expect(result.current.nodeSignal("A")).toBeUndefined();
    expect(result.current.totalCalls).toBe(0);
  });

  it("applies SSE state to node/edge lookups when enabled", () => {
    const emit: { fn?: (s: TraceState) => void } = {};
    const { result } = renderHook(() => useTraceOverlay(apiWith(emit), true));
    act(() => emit.fn!(sample));
    expect(result.current.nodeSignal("A")).toEqual({ id: "A", calls: 3, p95Ms: 30, errors: 1 });
    expect(result.current.edgeSignal("A", "B")).toEqual({ sourceId: "A", targetId: "B", calls: 1, errors: 0 });
    expect(result.current.edgeSignal("B", "A")).toBeUndefined();
    expect(result.current.totalCalls).toBe(4);
    expect(result.current.state?.unmapped).toBe(2);
  });

  it("unsubscribes when toggled off", () => {
    const emit: { fn?: (s: TraceState) => void } = {};
    const { rerender } = renderHook(({ on }) => useTraceOverlay(apiWith(emit), on), { initialProps: { on: true } });
    expect(emit.fn).toBeTypeOf("function");
    rerender({ on: false });
    expect(emit.fn).toBeUndefined();
  });
});
