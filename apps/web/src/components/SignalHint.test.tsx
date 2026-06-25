import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignalHint } from "./SignalHint";

describe("SignalHint", () => {
  it("renders nothing when there are no empty signals", () => {
    const { container } = render(<SignalHint items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("explains how to feed an empty live signal", () => {
    render(<SignalHint items={[{ label: "Live", how: "telos trace --demo" }]} />);
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByText(/telos trace --demo/)).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
