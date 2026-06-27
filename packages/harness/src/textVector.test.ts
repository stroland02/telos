import { describe, it, expect } from "vitest";
import { featurize, centroid, FEATURE_DIM } from "./textVector.js";
import { cosine } from "./semantic.js";

describe("featurize", () => {
  it("is deterministic and unit-length", () => {
    const a = featurize("optimize the slow database query");
    const b = featurize("optimize the slow database query");
    expect(a).toEqual(b);
    expect(a.length).toBe(FEATURE_DIM);
    expect(Math.sqrt(a.reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 5);
  });

  it("scores related text higher than unrelated text", () => {
    const q = featurize("the database is slow, please speed it up");
    const near = featurize("optimize the slow database query performance");
    const far = featurize("write the project documentation and update the readme");
    expect(cosine(q, near)).toBeGreaterThan(cosine(q, far));
  });

  it("generalizes across morphology via char trigrams", () => {
    const a = featurize("optimization");
    const b = featurize("optimize");
    const c = featurize("banana");
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
  });
});

describe("centroid", () => {
  it("is closer to its members than to an outsider", () => {
    const members = ["write unit tests", "add test coverage", "tdd the new module"].map((t) => featurize(t));
    const c = centroid(members);
    const member = featurize("write more unit tests");
    const outsider = featurize("design the marketing landing page");
    expect(cosine(c, member)).toBeGreaterThan(cosine(c, outsider));
  });
});
