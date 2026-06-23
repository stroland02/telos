import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTracePlayback } from "./useTracePlayback";
import type { TelosApi } from "../api/client";
import type { TracePathStep } from "../api/types";

function step(nodeId: string | null, order: number): TracePathStep {
  return { order, spanId: `s${order}`, name: nodeId ?? "x", nodeId, durationMs: 5, isError: false, depth: 0 };
}

function apiWith(path: TracePathStep[]): TelosApi {
  return { traceReplay: vi.fn().mockResolvedValue(path) } as unknown as TelosApi;
}

describe("useTracePlayback", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("starts idle", () => {
    const { result } = renderHook(() => useTracePlayback(apiWith([]), { stepMs: 100 }));
    expect(result.current.playing).toBe(false);
    expect(result.current.activeNodeId).toBeNull();
    expect(result.current.step).toBe(-1);
  });

  it("steps the active node forward on the timer and stops at the end", async () => {
    const api = apiWith([step("A", 0), step("B", 1)]);
    const { result } = renderHook(() => useTracePlayback(api, { stepMs: 100 }));

    await act(async () => { await result.current.play("t1"); });
    expect(result.current.activeNodeId).toBe("A");
    expect(result.current.playing).toBe(true);
    expect(result.current.total).toBe(2);

    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.activeNodeId).toBe("B");

    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.playing).toBe(false); // reached the end
    expect(result.current.activeNodeId).toBe("B"); // stays on last
  });

  it("stop() resets to idle", async () => {
    const api = apiWith([step("A", 0), step("B", 1)]);
    const { result } = renderHook(() => useTracePlayback(api, { stepMs: 100 }));
    await act(async () => { await result.current.play("t1"); });
    act(() => { result.current.stop(); });
    expect(result.current.playing).toBe(false);
    expect(result.current.activeNodeId).toBeNull();
    expect(result.current.activeTraceId).toBeNull();
  });
});
