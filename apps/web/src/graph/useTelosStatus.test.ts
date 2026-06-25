import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTelosStatus } from "./useTelosStatus";
import type { TelosApi } from "../api/client";

function api(over: Partial<TelosApi> = {}): TelosApi {
  return {
    stats: vi.fn().mockResolvedValue({ nodes: 10, edges: 20, files: 3, languages: ["typescript"], enriched: 4 }),
    harnessStatus: vi.fn().mockResolvedValue({ installed: [], totals: { nodeCapabilities: 8, promptIntents: 14 }, drift: { status: "ok", missing: [], added: [] }, lock: { present: false, path: "" } }),
    traceState: vi.fn().mockResolvedValue({ nodes: [{ id: "A", calls: 5, p95Ms: 1, errors: 0 }, { id: "B", calls: 2, p95Ms: 1, errors: 0 }], edges: [], unmapped: 0, unmappedEdges: 0, windowMs: 30000 }),
    processes: vi.fn().mockResolvedValue([{ pid: 1 }, { pid: 2 }]),
    subscribeForge: vi.fn().mockReturnValue(() => {}),
    ...over,
  } as unknown as TelosApi;
}

describe("useTelosStatus", () => {
  it("assembles status from the existing reads", async () => {
    const { result } = renderHook(() => useTelosStatus(api()));
    await waitFor(() => expect(result.current.graph).not.toBeNull());
    expect(result.current.graph).toEqual({ nodes: 10, edges: 20, files: 3, languages: ["typescript"], enriched: 4 });
    expect(result.current.harness).toEqual({ caps: 8, drift: "ok" });
    expect(result.current.live).toEqual({ calls: 7 });
    expect(result.current.procs).toBe(2);
  });

  it("leaves a field null when its read fails, without blanking the others", async () => {
    const { result } = renderHook(() => useTelosStatus(api({ harnessStatus: vi.fn().mockRejectedValue(new Error("down")) })));
    await waitFor(() => expect(result.current.graph).not.toBeNull());
    expect(result.current.harness).toBeNull();
    expect(result.current.procs).toBe(2);
  });
});
