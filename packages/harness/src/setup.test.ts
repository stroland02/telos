import { describe, it, expect } from "vitest";
import { buildSetupPlan, HARNESS_INSTALLS } from "./setup.js";

describe("buildSetupPlan", () => {
  it("covers all three orchestrated harnesses with install commands", () => {
    const sources = buildSetupPlan().map((h) => h.source).sort();
    expect(sources).toEqual(["ecc", "headroom", "superpowers"]);
    for (const h of HARNESS_INSTALLS) {
      expect(h.install.length).toBeGreaterThan(0);
      expect(h.repo).toMatch(/^https:\/\/github\.com\//);
      expect(h.license.length).toBeGreaterThan(0);
    }
  });
});
