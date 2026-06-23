import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DetailPanel } from "./DetailPanel";
import { NodeDetail } from "../api/types";

function detail(summary: string | null): NodeDetail {
  return {
    node: {
      id: "a", kind: "function", name: "authenticate", qualifiedName: "authenticate",
      language: "ts", path: "a.ts", layer: "api", lines: 18, complexity: 0, summary,
    } as NodeDetail["node"],
    callers: [], callees: [],
  };
}

describe("DetailPanel summary", () => {
  it("renders the summary when present", () => {
    render(<DetailPanel detail={detail("Authenticates a user.")} onClose={() => {}} />);
    expect(screen.getByText("Authenticates a user.")).toBeTruthy();
  });

  it("omits the summary section when null", () => {
    render(<DetailPanel detail={detail(null)} onClose={() => {}} />);
    expect(screen.queryByText("Summary")).toBeNull();
  });

  it("renders recent logs when present, omits the section when empty", () => {
    const { rerender } = render(<DetailPanel detail={detail(null)} onClose={() => {}} />);
    expect(screen.queryByText(/Recent logs/)).toBeNull();
    rerender(
      <DetailPanel
        detail={detail(null)}
        onClose={() => {}}
        logs={[{ ts: 1, severity: "ERROR", body: "login failed", attrs: {}, nodeId: "a" }]}
      />,
    );
    expect(screen.getByText(/Recent logs/)).toBeTruthy();
    expect(screen.getByText("login failed")).toBeTruthy();
  });
});
