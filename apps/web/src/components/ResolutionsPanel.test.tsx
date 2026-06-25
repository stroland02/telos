import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResolutionsPanel } from "./ResolutionsPanel";
import type { Finding } from "../api/types";

const findings: Finding[] = [
  { nodeId: "a", file: "src/a.ts", severity: "info", title: "Minor", detail: "d1", suggestion: "s1", agent: "x" },
  { nodeId: "b", file: "src/b.ts", severity: "error", title: "Bug", detail: "d2", suggestion: "s2", agent: "y" },
];

describe("ResolutionsPanel", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<ResolutionsPanel open={false} findings={findings} onOpenNode={() => {}} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("lists findings (error first) and opens a node on click", () => {
    const onOpenNode = vi.fn();
    const onClose = vi.fn();
    render(<ResolutionsPanel open findings={findings} onOpenNode={onOpenNode} onClose={onClose} />);
    const buttons = screen.getAllByRole("button");
    // first finding button is the highest severity (error → "Bug")
    expect(buttons[0].textContent).toContain("Bug");
    fireEvent.click(screen.getByText("Bug"));
    expect(onOpenNode).toHaveBeenCalledWith("b");
    expect(onClose).toHaveBeenCalled();
  });
});
