/**
 * Pure semantic-similarity scoring — no model, no I/O. The embedding model
 * lives in the server; this module only ranks precomputed vectors so it stays
 * trivially testable and dependency-free.
 */

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type SemTarget = { id: string; vec: number[] };

/**
 * Rank targets by cosine similarity to the prompt vector. Targets below `min`
 * are dropped so a low-confidence prompt yields nothing (preserving the
 * "silent when unsure" routing contract). Sorted desc, capped at `limit`.
 */
export function scoreSemantic(
  promptVec: number[], targets: SemTarget[], opts: { min?: number; limit?: number } = {},
): { id: string; score: number }[] {
  const min = opts.min ?? 0.25, limit = opts.limit ?? 5;
  return targets
    .map((t) => ({ id: t.id, score: cosine(promptVec, t.vec) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
