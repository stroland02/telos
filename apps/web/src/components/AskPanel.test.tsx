import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AskPanel } from "./AskPanel";
import { TelosApi } from "../api/client";

function stubApi(over: Partial<TelosApi> = {}): TelosApi {
  return {
    overview: vi.fn(), cluster: vi.fn(), node: vi.fn(), search: vi.fn().mockResolvedValue([]),
    files: vi.fn().mockResolvedValue([]), source: vi.fn(), recommendations: vi.fn().mockResolvedValue([]),
    tour: vi.fn().mockResolvedValue([]), ask: vi.fn().mockResolvedValue([]),
    ...over,
  } as TelosApi;
}

describe("AskPanel", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<AskPanel open={false} api={stubApi()} onOpenNode={() => {}} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("asks a question and opens the chosen answer", async () => {
    const onOpenNode = vi.fn();
    const onClose = vi.fn();
    const api = stubApi({
      ask: vi.fn().mockResolvedValue([{ id: "n1", qualifiedName: "auth/login", path: "a.ts", summary: "Logs a user in.", score: 3 }]),
    });
    render(<AskPanel open api={api} onOpenNode={onOpenNode} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "where is login" } });
    fireEvent.click(screen.getByText("Ask"));
    await waitFor(() => expect(api.ask).toHaveBeenCalledWith("where is login"));
    const result = await screen.findByText("auth/login");
    fireEvent.click(result);
    expect(onOpenNode).toHaveBeenCalledWith("n1");
    expect(onClose).toHaveBeenCalled();
  });

  it("loads a dependency-ordered tour", async () => {
    const api = stubApi({
      tour: vi.fn().mockResolvedValue([{ id: "t1", qualifiedName: "core/init", summary: "Boots the app.", order: 0 }]),
    });
    render(<AskPanel open api={api} onOpenNode={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Tour"));
    await waitFor(() => expect(api.tour).toHaveBeenCalled());
    expect(await screen.findByText("1. core/init")).toBeTruthy();
  });
});
