import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useProfileOverlay } from "./useProfileOverlay";
import type { TelosApi } from "../api/client";
import type { ProfileSnapshot } from "../api/types";

function apiWith(snap: ProfileSnapshot): TelosApi {
  return { profile: vi.fn().mockResolvedValue(snap) } as unknown as TelosApi;
}
const snap: ProfileSnapshot = {
  nodes: [{ nodeId: "A", self: 2, total: 10 }, { nodeId: "B", self: 5, total: 5 }],
  totalSamples: 12, unmatched: 1,
};

describe("useProfileOverlay", () => {
  it("is empty when disabled", () => {
    const { result } = renderHook(() => useProfileOverlay(apiWith(snap), false));
    expect(result.current.snapshot).toBeNull();
    expect(result.current.intensity("A")).toBe(0);
  });

  it("normalizes intensity by the hottest node when enabled", async () => {
    const { result } = renderHook(() => useProfileOverlay(apiWith(snap), true));
    await waitFor(() => expect(result.current.snapshot).not.toBeNull());
    expect(result.current.intensity("A")).toBe(1);   // total 10 = max
    expect(result.current.intensity("B")).toBe(0.5);  // total 5 / 10
    expect(result.current.intensity("nope")).toBe(0);
    expect(result.current.totalSamples).toBe(12);
  });
});
