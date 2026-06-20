import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DetailPanel } from "./DetailPanel";
import { NodeDetail } from "../api/types";

const detail: NodeDetail = {
  node: { id: "s2", kind: "function", name: "findUser", qualifiedName: "src/services/u.ts::findUser", language: "typescript", path: "src/services/u.ts", lineStart: 1, lineEnd: 5, layer: "service", fanIn: 1, fanOut: 0, lines: 5, complexity: 1, summary: null },
  callers: [{ id: "f1", kind: "file", name: "userController.ts", qualifiedName: "src/api/userController.ts", language: "typescript", path: "src/api/userController.ts", lineStart: 1, lineEnd: 1, layer: "api", fanIn: 0, fanOut: 1, lines: 1, complexity: 0, summary: null }],
  callees: [],
};

describe("DetailPanel", () => {
  it("renders nothing when detail is null", () => {
    const { container } = render(<DetailPanel detail={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the node name, path, and its callers", () => {
    render(<DetailPanel detail={detail} onClose={vi.fn()} />);
    expect(screen.getByText("findUser")).toBeInTheDocument();
    expect(screen.getByText("src/services/u.ts")).toBeInTheDocument();
    expect(screen.getByText("userController.ts")).toBeInTheDocument();
  });
});
