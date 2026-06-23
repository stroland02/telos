import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ProcessPanel } from "./ProcessPanel";
import type { TelosApi } from "../api/client";

function api(procs: any[]): TelosApi {
  return { processes: vi.fn().mockResolvedValue(procs) } as unknown as TelosApi;
}

const sample = [
  { pid: 2, name: "chrome", cmd: "chrome", cpu: 30, memMb: 800, nodeId: null },
  { pid: 1, name: "node", cmd: "node auth.ts", cpu: 3, memMb: 50, nodeId: "F" },
];

describe("ProcessPanel", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<ProcessPanel open={false} api={api(sample)} onOpenNode={() => {}} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("loads and lists processes; node-tagged rows open the node", async () => {
    const onOpenNode = vi.fn();
    const onClose = vi.fn();
    render(<ProcessPanel open api={api(sample)} onOpenNode={onOpenNode} onClose={onClose} />);

    await waitFor(() => expect(screen.getByText("chrome")).toBeTruthy());
    expect(screen.getByText("node")).toBeTruthy();

    // The node-tagged process exposes an "open" affordance.
    fireEvent.click(screen.getByTitle("Open this process's code node"));
    expect(onOpenNode).toHaveBeenCalledWith("F");
    expect(onClose).toHaveBeenCalled();
  });
});
