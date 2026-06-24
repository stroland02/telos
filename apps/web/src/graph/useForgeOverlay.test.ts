import { describe, it, expect } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useForgeOverlay } from "./useForgeOverlay.js";
import { ForgeState } from "../api/types.js";

describe("useForgeOverlay", () => {
  it("exposes the latest forge state pushed by the subscription", async () => {
    let push: (s: ForgeState) => void = () => {};
    const api = {
      subscribeForge(cb: (s: ForgeState) => void) { push = cb; return () => {}; },
    } as never;

    const { result } = renderHook(() => useForgeOverlay(api));
    expect(result.current.forge).toBeNull();

    const state: ForgeState = { run: "r1", turn: 2, costUsd: 0.05, stop: null,
      diff: { added: { nodes: ["n1"], edges: [] }, removed: { nodes: [], edges: [] }, changed: ["n2"] } };
    act(() => push(state));

    await waitFor(() => expect(result.current.forge?.run).toBe("r1"));
    expect(result.current.forge?.diff.added.nodes).toEqual(["n1"]);
  });
});
