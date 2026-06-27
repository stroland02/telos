/**
 * Tiny, dependency-free text embedding via feature hashing — the "model" behind
 * semantic routing. No external weights, no native deps, no download: we hash
 * word unigrams + bigrams + character trigrams into a fixed-dim L2-normalized
 * vector. Char trigrams give morphological generalization ("optimize" ≈
 * "optimization"); bigrams capture short phrases. Cosine over these vectors is a
 * real semantic-ish similarity, a large step up from substring keyword matching,
 * while fitting in single-digit KB and running sub-millisecond.
 */

export const FEATURE_DIM = 512;

function hashStr(s: string): number {
  // FNV-1a (32-bit) — fast, stable, no deps.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Common words carry no intent and, left in, inflate generic similarity so that
// "what is the weather today" looks like a bug report. Dropping them sharpens the
// signal to content words ("optimize", "tests", "review"). Kept deliberately
// small — only true function words, never domain terms.
const STOPWORDS = new Set([
  "a", "an", "the", "this", "that", "these", "those", "is", "are", "was", "were",
  "be", "been", "being", "am", "do", "does", "did", "to", "of", "in", "on", "at",
  "for", "with", "and", "or", "but", "if", "then", "so", "it", "its", "i", "me",
  "my", "we", "our", "you", "your", "he", "she", "they", "them", "his", "her",
  "what", "which", "who", "how", "when", "where", "why", "can", "could", "would",
  "should", "will", "shall", "may", "might", "must", "have", "has", "had", "get",
  "got", "as", "by", "from", "into", "out", "up", "down", "about", "please",
  "let", "lets", "us", "there", "here", "now", "today", "really", "just", "some",
]);

function tokens(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const kept = raw.filter((t) => !STOPWORDS.has(t));
  // If a prompt is ALL stopwords, keep the raw tokens rather than emit nothing.
  return kept.length > 0 ? kept : raw;
}

/** Hash text into a fixed-dim L2-normalized feature vector. Deterministic. */
export function featurize(text: string, dim = FEATURE_DIM): number[] {
  const v = new Array<number>(dim).fill(0);
  const add = (feat: string, w: number) => { v[hashStr(feat) % dim] += w; };
  const toks = tokens(text);
  for (const t of toks) add("u:" + t, 1);
  for (let i = 0; i < toks.length - 1; i++) add("b:" + toks[i] + "_" + toks[i + 1], 1);
  for (const t of toks) {
    const s = "#" + t + "#";
    for (let i = 0; i < s.length - 2; i++) add("c:" + s.slice(i, i + 3), 0.5);
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm === 0) return v;
  for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}

/** Mean of several feature vectors, re-normalized — an intent centroid. */
export function centroid(vectors: number[][], dim = FEATURE_DIM): number[] {
  const v = new Array<number>(dim).fill(0);
  if (vectors.length === 0) return v;
  for (const vec of vectors) for (let i = 0; i < dim; i++) v[i] += vec[i];
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm === 0) return v;
  for (let i = 0; i < dim; i++) v[i] /= norm;
  return v;
}
