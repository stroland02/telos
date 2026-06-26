/**
 * Token-savings measurement — the evidence that Telos's graph-as-memory brief
 * is cheaper than orienting an agent the naive way (reading the source cold).
 *
 * We don't ship a full BPE tokenizer (native deps, model-specific); instead we
 * use the well-worn ~4-chars-per-token approximation. The headline number is a
 * RATIO between two texts measured the same way, so the approximation cancels
 * out and the comparison stays fair regardless of the exact tokenizer.
 */

/** Approximate token count for a string (~4 chars/token, the common rule). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export interface SavingsReport {
  /** Estimated tokens to read the source cold (the baseline an agent pays). */
  baselineTokens: number;
  /** Tokens of the Telos warm-start brief. */
  packTokens: number;
  /** Percentage reduction, 0–100 (0 when there's no baseline). */
  reductionPct: number;
  /** How many times smaller the brief is (baseline / pack), 1 when no baseline. */
  ratio: number;
  /** Estimated input-cost saved per warm-start at the given $/Mtok rate. */
  costSavedUsd: number;
  /**
   * HONEST baseline: tokens to read just the handful of most-central files a
   * *smart* agent would open to orient (not the whole repo). 0 when not supplied.
   * The exhaustive `baselineTokens` is a best-case upper bound; this is the
   * realistic, defensible comparison.
   */
  selectiveBaselineTokens: number;
  /** Brief size relative to the selective baseline (selective / pack), 1 when none. */
  selectiveRatio: number;
}

/**
 * Compare the cold-read baseline against the Telos brief. `baselineChars` is the
 * total size (in characters ≈ bytes) of the source an agent would otherwise
 * load; `packText` is the rendered context pack. `usdPerMtokInput` defaults to a
 * representative input price so the dollar figure is illustrative, not billed.
 */
export function measureSavings(args: {
  baselineChars: number;
  packText: string;
  usdPerMtokInput?: number;
  /** Chars of just the most-central files a smart agent reads to orient. */
  selectiveBaselineChars?: number;
}): SavingsReport {
  const usdPerMtok = args.usdPerMtokInput ?? 3.0;
  const baselineTokens = Math.ceil(Math.max(0, args.baselineChars) / 4);
  const packTokens = estimateTokens(args.packText);
  const reductionPct = baselineTokens > 0
    ? Math.max(0, (1 - packTokens / baselineTokens) * 100)
    : 0;
  const ratio = baselineTokens > 0 && packTokens > 0 ? baselineTokens / packTokens : 1;
  const costSavedUsd = Math.max(0, baselineTokens - packTokens) / 1_000_000 * usdPerMtok;
  const selectiveBaselineTokens = Math.ceil(Math.max(0, args.selectiveBaselineChars ?? 0) / 4);
  const selectiveRatio = selectiveBaselineTokens > 0 && packTokens > 0
    ? selectiveBaselineTokens / packTokens : 1;
  return { baselineTokens, packTokens, reductionPct, ratio, costSavedUsd, selectiveBaselineTokens, selectiveRatio };
}
