import { describe, it, expect } from "vitest";
import { cosine, scoreSemantic } from "./semantic.js";

describe("cosine", () => {
  it("is 1 for identical, 0 for orthogonal", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("returns 0 when a vector is zero-length", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("scoreSemantic", () => {
  const targets = [
    { id: "feature-build", vec: [1, 0, 0] },
    { id: "review", vec: [0, 1, 0] },
    { id: "test", vec: [0, 0, 1] },
  ];
  it("ranks the nearest target first", () => {
    const r = scoreSemantic([0.9, 0.1, 0], targets);
    expect(r[0].id).toBe("feature-build");
  });
  it("drops targets below the threshold", () => {
    const r = scoreSemantic([0, 0, 1], targets, { min: 0.5 });
    expect(r.map((x) => x.id)).toEqual(["test"]);
  });
  it("caps at the requested limit", () => {
    const r = scoreSemantic([1, 1, 1], targets, { min: 0, limit: 2 });
    expect(r.length).toBe(2);
  });
});
