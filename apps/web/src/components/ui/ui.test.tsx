import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SegmentedControl } from "./SegmentedControl";
import { Panel } from "./Panel";

describe("SegmentedControl", () => {
  const opts = [
    { value: "a" as const, label: "Alpha" },
    { value: "b" as const, label: "Beta" },
  ];

  it("marks the selected option and calls onChange on click", () => {
    const onChange = vi.fn();
    render(<SegmentedControl ariaLabel="Test" idBase="t" value="a" onChange={onChange} options={opts} />);
    expect(screen.getByRole("button", { name: "Alpha" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Beta" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("Panel", () => {
  it("renders children only when open, exposes a dialog, and closes on Escape", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Panel open={false} onClose={onClose} ariaLabel="Demo"><p>body</p></Panel>,
    );
    expect(screen.queryByText("body")).toBeNull();

    rerender(<Panel open onClose={onClose} ariaLabel="Demo"><p>body</p></Panel>);
    expect(screen.getByRole("dialog", { name: "Demo" })).toBeTruthy();
    expect(screen.getByText("body")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked but not when the card is", () => {
    const onClose = vi.fn();
    render(<Panel open onClose={onClose} ariaLabel="Demo"><p>body</p></Panel>);
    fireEvent.click(screen.getByText("body"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
