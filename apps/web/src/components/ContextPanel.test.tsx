import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ContextPanel } from "./ContextPanel";
import type { TelosApi } from "../api/client";

function api(brief: string): TelosApi {
  return { contextPack: vi.fn().mockResolvedValue(brief) } as unknown as TelosApi;
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
});
