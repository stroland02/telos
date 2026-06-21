import { describe, it, expect } from "vitest";

// Pure logic extracted from TourBar — sortable without React dependencies.
// Tests the fan-in descending order that determines tour node sequence.
function tourOrder(nodes: { id: string; data: { fanIn: number; label: string } }[]) {
  return [...nodes].sort((a, b) => {
    if (b.data.fanIn !== a.data.fanIn) return b.data.fanIn - a.data.fanIn;
    return a.data.label.localeCompare(b.data.label);
  });
}

describe("tourOrder", () => {
  it("sorts nodes highest fan-in first", () => {
    const nodes = [
      { id: "a", data: { fanIn: 1, label: "a" } },
      { id: "b", data: { fanIn: 5, label: "b" } },
      { id: "c", data: { fanIn: 3, label: "c" } },
    ];
    const sorted = tourOrder(nodes);
    expect(sorted.map((n) => n.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties by label alphabetically", () => {
    const nodes = [
      { id: "z", data: { fanIn: 2, label: "zebra" } },
      { id: "a", data: { fanIn: 2, label: "alpha" } },
    ];
    const sorted = tourOrder(nodes);
    expect(sorted.map((n) => n.id)).toEqual(["a", "z"]);
  });

  it("returns empty array for empty input", () => {
    expect(tourOrder([])).toEqual([]);
  });

  it("does not mutate the original array", () => {
    const nodes = [
      { id: "x", data: { fanIn: 3, label: "x" } },
      { id: "y", data: { fanIn: 1, label: "y" } },
    ];
    const orig = [...nodes];
    tourOrder(nodes);
    expect(nodes).toEqual(orig);
  });
});
