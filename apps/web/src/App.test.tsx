import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";

beforeEach(() => {
  // SSE overlays (forge) open an EventSource on mount; stub it for jsdom.
  vi.stubGlobal("EventSource", class { close() {} onmessage = null; onerror = null; } as unknown as typeof EventSource);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true, status: 200,
    json: async () => {
      if (url.includes("/overview")) return { nodes: [{ id: "layer:api", label: "api", level: "layer", layer: "api", symbolCount: 1, fanIn: 0, fanOut: 0, complexity: 0 }], edges: [] };
      if (url.includes("/files")) return { files: [] };
      if (url.includes("/api/stats")) return { nodes: 1, edges: 0, files: 1, languages: ["typescript"], enriched: 0 };
      if (url.includes("/api/harness/activity")) return { entries: [], tally: [] };
      if (url.includes("/api/harness")) return { installed: [], totals: { nodeCapabilities: 0, promptIntents: 0 }, drift: { status: "ok", missing: [], added: [] }, lock: { present: false, path: "" } };
      if (url.includes("/api/trace/state")) return { nodes: [], edges: [], unmapped: 0, unmappedEdges: 0, windowMs: 30000 };
      if (url.includes("/api/processes")) return { processes: [] };
      if (url.includes("/api/measure")) return { baselineTokens: 0, packTokens: 0, reductionPct: 0, ratio: 1, costSavedUsd: 0, files: 0, missing: 0 };
      if (url.includes("/api/context")) return { brief: "" };
      if (url.includes("/api/harness/config")) return { enabled: [] };
      if (url.includes("/api/activate")) return { statusLinePresent: false, harnessLockPresent: false, settingsPath: "" };
      return { results: [] };
    },
  } as Response)));
});

describe("App", () => {
  it("renders the Telos header and loads the overview layer", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Telos" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("api")).toBeInTheDocument());
  });
});
