import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ContextPanel } from "./ContextPanel";
import type { TelosApi } from "../api/client";

const SAVINGS = { baselineTokens: 128626, packTokens: 709, reductionPct: 99.4, ratio: 181, costSavedUsd: 0.384, files: 166, missing: 0 };
function api(brief: string, over: Partial<TelosApi> = {}): TelosApi {
  return {
    contextPack: vi.fn().mockResolvedValue(brief),
    measure: vi.fn().mockResolvedValue(SAVINGS),
    buildMemory: vi.fn().mockResolvedValue({ enriched: 5, total: 5 }),
    ...over,
  } as unknown as TelosApi;
}

describe("ContextPanel", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<ContextPanel open={false} api={api("x")} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("loads and renders the architecture brief", async () => {
    render(<ContextPanel open api={api("# Architecture context\n5 nodes, 2 edges")} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/# Architecture context/)).toBeTruthy());
    expect(screen.getByText(/5 nodes, 2 edges/)).toBeTruthy();
  });

  it("shows the token-savings banner", async () => {
    render(<ContextPanel open api={api("# Architecture context")} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/99.4% fewer tokens/)).toBeTruthy());
    expect(screen.getByText(/181× smaller/)).toBeTruthy();
  });

  it("guides building when no memory exists yet", async () => {
    render(<ContextPanel open api={api("")} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Graph memory not built yet/)).toBeTruthy());
  });

  it("builds graph memory and reports the result", async () => {
    const buildMemory = vi.fn().mockResolvedValue({ enriched: 5, total: 5 });
    render(<ContextPanel open api={api("# Architecture context", { buildMemory })} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /build memory/i }));
    await waitFor(() => expect(buildMemory).toHaveBeenCalled());
    expect(await screen.findByText(/5 \/ 5 nodes summarized/)).toBeTruthy();
  });
});
