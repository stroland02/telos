import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchBox } from "./SearchBox";
import { TelosApi } from "../api/client";

function api(results: any[]): TelosApi {
  return { overview: vi.fn(), cluster: vi.fn(), node: vi.fn(), search: vi.fn().mockResolvedValue(results), files: vi.fn().mockResolvedValue([]), source: vi.fn().mockResolvedValue(null), recommendations: vi.fn().mockResolvedValue([]), tour: vi.fn().mockResolvedValue([]), ask: vi.fn().mockResolvedValue([]) };
}

describe("SearchBox", () => {
  it("searches after typing and lists results that are selectable", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const a = api([{ id: "s1", name: "getUser", path: "src/api/u.ts", layer: "api" }]);
    render(<SearchBox api={a} onSelect={onSelect} />);
    await user.type(screen.getByPlaceholderText(/search/i), "getU");
    expect(await screen.findByText("getUser")).toBeInTheDocument();
    await user.click(screen.getByText("getUser"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "s1" }));
  });

  it("does not search for queries shorter than 2 characters", async () => {
    const user = userEvent.setup();
    const a = api([]);
    render(<SearchBox api={a} onSelect={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/search/i), "g");
    expect(a.search).not.toHaveBeenCalled();
  });
});
