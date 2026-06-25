import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HarnessPanel } from "./HarnessPanel";
import type { TelosApi } from "../api/client";
import type { HarnessStatus } from "../api/types";

function api(status: HarnessStatus): TelosApi {
  return { harnessStatus: vi.fn().mockResolvedValue(status), harnessConfig: vi.fn().mockResolvedValue({ enabled: ["ecc"] }), harnessSelect: vi.fn().mockResolvedValue({ enabled: [] }) } as unknown as TelosApi;
}

const status: HarnessStatus = {
  installed: [
    { source: "ecc", title: "ECC — agents, skills, reviewers", repo: "r1", nodeCapabilities: 1, capabilities: [
      { id: "ecc:database-reviewer", title: "Database/SQL review", kind: "agent", activation: "node" },
      { id: "ecc:performance-optimizer", title: "Optimize performance", kind: "agent", activation: "prompt", triggers: ["optimize", "slow"] },
    ] },
    { source: "superpowers", title: "Superpowers", repo: "r2", nodeCapabilities: 0, capabilities: [] },
  ],
  totals: { nodeCapabilities: 8, promptIntents: 14 },
  drift: { status: "ok", missing: [], added: [] },
  lock: { present: false, path: ".telos/harness.lock" },
};

describe("HarnessPanel", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<HarnessPanel open={false} api={api(status)} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("lists installed harnesses with agent counts and drift", async () => {
    render(<HarnessPanel open api={api(status)} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("ECC — agents, skills, reviewers")).toBeTruthy());
    expect(screen.getByText(/14 prompt intents/)).toBeTruthy();
    expect(screen.getByText("ok")).toBeTruthy();
    // Roster is collapsed by default — agent ids are not shown yet.
    expect(screen.queryByText("ecc:database-reviewer")).toBeNull();
  });

  it("expands a harness to reveal its agents and what they fire on", async () => {
    const user = userEvent.setup();
    render(<HarnessPanel open api={api(status)} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("ECC — agents, skills, reviewers")).toBeTruthy());
    await user.click(screen.getByLabelText(/Show ecc agents/i));
    expect(await screen.findByText("ecc:database-reviewer")).toBeTruthy();
    expect(screen.getByText("ecc:performance-optimizer")).toBeTruthy();
    expect(screen.getByText(/fires on: optimize, slow/)).toBeTruthy();
  });
});
