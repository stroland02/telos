import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HarnessPanel } from "./HarnessPanel";
import type { TelosApi } from "../api/client";
import type { ActivityFeed, HarnessStatus } from "../api/types";

const status: HarnessStatus = {
  installed: [
    {
      source: "ecc",
      title: "ECC — agents, skills, reviewers",
      repo: "r1",
      nodeCapabilities: 1,
      capabilities: [
        { id: "ecc:database-reviewer", title: "Database/SQL review", kind: "agent", activation: "node" },
        { id: "ecc:performance-optimizer", title: "Optimize performance", kind: "agent", activation: "prompt", triggers: ["optimize", "slow"] },
      ],
    },
    { source: "superpowers", title: "Superpowers", repo: "r2", nodeCapabilities: 0, capabilities: [] },
  ],
  totals: { nodeCapabilities: 8, promptIntents: 14 },
  drift: { status: "ok", missing: [], added: [] },
  lock: { present: false, path: ".telos/harness.lock" },
};

const emptyFeed: ActivityFeed = { entries: [], tally: [] };

function fakeApi(over: Partial<TelosApi> = {}): TelosApi {
  return {
    harnessStatus: vi.fn().mockResolvedValue(status),
    harnessConfig: vi.fn().mockResolvedValue({ enabled: ["ecc", "superpowers"] }),
    harnessSelect: vi.fn().mockResolvedValue({ enabled: ["ecc", "superpowers"] }),
    harnessActivity: vi.fn().mockResolvedValue(emptyFeed),
    mcpActivity: vi.fn().mockResolvedValue({
      entries: [{ ts: Date.now(), tool: "telos_ask", argsSummary: "q", resultTokens: 7 }],
      totals: { queries: 1, tokens: 7 },
    }),
    usage: vi.fn().mockResolvedValue({
      windowPrompts: 3,
      agents: [{ id: "ecc:database-reviewer", count: 2, lastTs: Date.now() }],
      sources: [{ source: "ecc", count: 2, lastTs: Date.now() }],
    }),
    measure: vi.fn().mockResolvedValue({
      baselineTokens: 9000, packTokens: 100, reductionPct: 98, ratio: 90, costSavedUsd: 0.03, files: 5, missing: 0,
    }),
    activationState: vi.fn().mockResolvedValue({ statusLinePresent: false }),
    activate: vi.fn().mockResolvedValue({ statusLinePresent: true }),
    ...over,
  } as unknown as TelosApi;
}

describe("HarnessPanel control panel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Existing tests (preserved) ────────────────────────────────────────────

  it("renders nothing when closed", () => {
    const { container } = render(<HarnessPanel open={false} api={fakeApi()} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("lists installed harnesses with agent counts and drift", async () => {
    render(<HarnessPanel open api={fakeApi()} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("ECC — agents, skills, reviewers")).toBeTruthy());
    expect(screen.getByText(/14 prompt intents/)).toBeTruthy();
    expect(screen.getByText("ok")).toBeTruthy();
    // Roster is collapsed by default — agent ids are not shown yet.
    expect(screen.queryByText("ecc:database-reviewer")).toBeNull();
  });

  it("expands a harness to reveal its agents and what they fire on", async () => {
    const user = userEvent.setup();
    render(<HarnessPanel open api={fakeApi()} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("ECC — agents, skills, reviewers")).toBeTruthy());
    await user.click(screen.getByLabelText(/Show ecc agents/i));
    expect(await screen.findByText("ecc:database-reviewer")).toBeTruthy();
    expect(screen.getByText("ecc:performance-optimizer")).toBeTruthy();
    expect(screen.getByText(/fires on: optimize, slow/)).toBeTruthy();
  });

  it("polls the activity feed while open so new orchestrations appear live", async () => {
    const a = fakeApi();
    render(<HarnessPanel open api={a} onClose={() => {}} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // flush the mount refresh
    });
    const initial = (a.harnessActivity as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(initial).toBeGreaterThanOrEqual(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000); // one poll interval later
    });
    expect((a.harnessActivity as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(initial);
  });

  it("shows the activity feed and an agents-fired leaderboard", async () => {
    const feed: ActivityFeed = {
      entries: [{
        ts: Date.now(), promptSnippet: "build a feature", intent: "feature build",
        agents: ["superpowers:brainstorming", "ecc:code-reviewer"], sources: ["superpowers", "ecc"],
      }],
      tally: [{ id: "ecc:code-reviewer", count: 3 }],
    };
    render(
      <HarnessPanel
        open
        api={fakeApi({ harnessActivity: vi.fn().mockResolvedValue(feed) })}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText("feature build")).toBeTruthy());
    expect(screen.getByText(/ecc:code-reviewer · 3/)).toBeTruthy();
  });

  // ── New tests (Task 8) ────────────────────────────────────────────────────

  it("shows the Activate switch and toggles engagement", async () => {
    const activate = vi.fn(async () => ({ statusLinePresent: true }));
    render(<HarnessPanel open api={fakeApi({ activate })} onClose={() => {}} />);
    // Switch renders as role="switch" with aria-label "Telos engaged"
    const sw = await screen.findByRole("switch", { name: /telos/i });
    fireEvent.click(sw);
    await waitFor(() => expect(activate).toHaveBeenCalled());
  });

  it("switches to the MCP tab and lists queries", async () => {
    render(<HarnessPanel open api={fakeApi()} onClose={() => {}} />);
    // SegmentedControl renders plain <button aria-pressed=...> — NOT role="tab"
    fireEvent.click(await screen.findByRole("button", { name: /^mcp$/i }));
    expect(await screen.findByText(/telos_ask/)).toBeInTheDocument();
  });

  it("shows injected vs saved token impact in the header", async () => {
    render(<HarnessPanel open api={fakeApi()} onClose={() => {}} />);
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });

  // ── Usage-driven metrics ──────────────────────────────────────────────────

  it("shows active-of-curated agents in the header", async () => {
    render(<HarnessPanel open api={fakeApi()} onClose={() => {}} />);
    // usage has 1 distinct agent; curated total = 8 + 14 = 22
    expect(await screen.findByText(/1 of 22 agents active/i)).toBeInTheDocument();
  });

  it("shows per-harness used/curated and flags an idle enabled harness", async () => {
    render(<HarnessPanel open api={fakeApi()} onClose={() => {}} />);
    // ecc used 1 of its 2 curated capabilities
    expect(await screen.findByText("1 / 2")).toBeInTheDocument();
    // superpowers is enabled but unused → idle badge
    expect(screen.getByText("idle")).toBeInTheDocument();
  });

  it("marks used vs idle agents in the expanded roster", async () => {
    const user = userEvent.setup();
    render(<HarnessPanel open api={fakeApi()} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("ECC — agents, skills, reviewers")).toBeTruthy());
    await user.click(screen.getByLabelText(/Show ecc agents/i));
    expect(await screen.findByText(/● 2×/)).toBeInTheDocument();   // database-reviewer used twice
    expect(screen.getAllByText(/○ idle/).length).toBeGreaterThanOrEqual(1); // performance-optimizer idle
  });
});
