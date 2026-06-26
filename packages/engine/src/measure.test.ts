import { describe, it, expect } from "vitest";
import { estimateTokens, measureSavings } from "./measure.js";

describe("estimateTokens", () => {
  it("is ~chars/4 and zero for empty", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});

describe("measureSavings", () => {
  it("reports a reduction when the brief is smaller than the cold read", () => {
    const r = measureSavings({ baselineChars: 400_000, packText: "x".repeat(4_000) });
    expect(r.baselineTokens).toBe(100_000);
    expect(r.packTokens).toBe(1_000);
    expect(Math.round(r.reductionPct)).toBe(99);
    expect(Math.round(r.ratio)).toBe(100);
    expect(r.costSavedUsd).toBeGreaterThan(0);
  });

  it("never goes negative and is safe with no baseline", () => {
    const r = measureSavings({ baselineChars: 0, packText: "anything" });
    expect(r.reductionPct).toBe(0);
    expect(r.ratio).toBe(1);
    expect(r.costSavedUsd).toBe(0);
  });

  it("honors a custom $/Mtok input rate", () => {
    const r = measureSavings({ baselineChars: 4_000_000, packText: "", usdPerMtokInput: 10 });
    // 1,000,000 baseline tokens saved * $10/Mtok = $10
    expect(r.costSavedUsd).toBeCloseTo(10, 5);
  });

  it("reports an HONEST selective baseline alongside the exhaustive one", () => {
    // Exhaustive = all files (400k chars); selective = the few central files (40k chars).
    const r = measureSavings({ baselineChars: 400_000, selectiveBaselineChars: 40_000, packText: "x".repeat(4_000) });
    expect(r.baselineTokens).toBe(100_000);          // read everything
    expect(r.selectiveBaselineTokens).toBe(10_000);  // read just the central files
    expect(Math.round(r.ratio)).toBe(100);           // best-case headline
    expect(Math.round(r.selectiveRatio)).toBe(10);   // honest, realistic ratio
  });

  it("selective fields default to a neutral 0/1 when not supplied", () => {
    const r = measureSavings({ baselineChars: 400_000, packText: "x".repeat(4_000) });
    expect(r.selectiveBaselineTokens).toBe(0);
    expect(r.selectiveRatio).toBe(1);
  });
});
