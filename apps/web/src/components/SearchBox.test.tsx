import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBox } from "./SearchBox";
import { TelosApi } from "../api/client";

function api(results: any[]): TelosApi {
  return { overview: vi.fn(), cluster: vi.fn(), node: vi.fn(), search: vi.fn().mockResolvedValue(results), files: vi.fn().mockResolvedValue([]), source: vi.fn().mockResolvedValue(null), recommendations: vi.fn().mockResolvedValue([]), tour: vi.fn().mockResolvedValue([]), ask: vi.fn().mockResolvedValue([]), traceState: vi.fn().mockResolvedValue({ nodes: [], edges: [], unmapped: 0, unmappedEdges: 0, windowMs: 30000 }), subscribeTrace: vi.fn().mockReturnValue(() => {}), recentTraces: vi.fn().mockResolvedValue([]), traceReplay: vi.fn().mockResolvedValue([]), nodeLogs: vi.fn().mockResolvedValue([]), nodeMetrics: vi.fn().mockResolvedValue([]), profile: vi.fn().mockResolvedValue({ nodes: [], totalSamples: 0, unmatched: 0 }), processes: vi.fn().mockResolvedValue([]), subscribeForge: vi.fn().mockReturnValue(() => {}), subscribeResolve: vi.fn().mockReturnValue(() => {}), harnessStatus: vi.fn(), contextPack: vi.fn().mockResolvedValue(""), measure: vi.fn().mockResolvedValue({ baselineTokens: 0, packTokens: 0, reductionPct: 0, ratio: 1, costSavedUsd: 0, files: 0, missing: 0 }), stats: vi.fn(), activate: vi.fn(), activationState: vi.fn(), harnessConfig: vi.fn(), harnessSelect: vi.fn(), harnessActivity: vi.fn().mockResolvedValue({ entries: [], tally: [] }) };
}

describe("SearchBox", () => {
  it("searches after typing and lists results that are selectable", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const a = api([{ id: "s1", name: "getUser", path: "src/api/u.ts", layer: "api" }]);
    render(<SearchBox api={a} onSelect={onSelect} />);
    await user.type(screen.getByPlaceholderText(/search/i), "getU");
    expect(await screen.findByText("getUser")).toBeInTheDocument();
    await user.click(screen.getByText("getUser"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }));
  });

  it("does not search for queries shorter than 2 characters", async () => {
    const user = userEvent.setup();
    const a = api([]);
    render(<SearchBox api={a} onSelect={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/search/i), "g");
    expect(a.search).not.toHaveBeenCalled();
  });
});
