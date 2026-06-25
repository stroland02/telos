import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HarnessPanel } from "./HarnessPanel";
import type { TelosApi } from "../api/client";
import type { HarnessStatus } from "../api/types";

function api(status: HarnessStatus): TelosApi {
  return { harnessStatus: vi.fn().mockResolvedValue(status), harnessConfig: vi.fn().mockResolvedValue({ enabled: ["ecc"] }), harnessSelect: vi.fn().mockResolvedValue({ enabled: [] }) } as unknown as TelosApi;
}

const status: HarnessStatus = {
  installed: [
    { source: "ecc", title: "ECC — agents, skills, reviewers", repo: "r1", nodeCapabilities: 8 },
    { source: "superpowers", title: "Superpowers", repo: "r2", nodeCapabilities: 0 },
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

  it("lists installed harnesses with capability counts and drift", async () => {
    render(<HarnessPanel open api={api(status)} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("ECC — agents, skills, reviewers")).toBeTruthy());
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText(/14 prompt intents/)).toBeTruthy();
    expect(screen.getByText("ok")).toBeTruthy();
  });
});
