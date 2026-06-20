import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true, status: 200,
    json: async () => url.includes("/overview")
      ? { nodes: [{ id: "layer:api", label: "api", level: "layer", layer: "api", symbolCount: 1, fanIn: 0, fanOut: 0 }], edges: [] }
      : { results: [] },
  } as Response)));
});

describe("App", () => {
  it("renders the Telos header and loads the overview layer", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Telos" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("api")).toBeInTheDocument());
  });
});
