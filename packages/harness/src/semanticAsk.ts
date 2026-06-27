/**
 * Semantic code search (LLM phase slice 3 / Feature B). A hybrid upgrade to the
 * engine's keyword `askGraph`: it blends semantic similarity (so "where is auth
 * handled?" finds the auth module even with no shared words) with an exact-keyword
 * component (so "find parseOtlpTraces" pinpoints that symbol) plus a small
 * centrality bonus. In-process, reuses the slice-1 featurizer — no model, no deps.
 *
 * Lives in @telos/harness (which already depends on @telos/engine) so it can read
 * the graph type and reuse `featurize`/`cosine` without a circular dependency.
 */
import type { TelosGraph, TelosNode } from "@telos/engine";
import { featurize } from "./textVector.js";
import { cosine } from "./semantic.js";

export interface SemanticAnswer {
  node: TelosNode;
  score: number;
}

/** Split identifiers so code reads as words: parseOtlpTraces -> "parse otlp traces". */
function splitIdent(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_\-./]+/g, " ");
}

function nodeText(n: TelosNode): string {
  return splitIdent(`${n.name} ${n.qualifiedName} ${n.path} ${n.summary ?? ""}`);
}

const QSTOP = new Set([
  "where", "does", "do", "the", "a", "an", "is", "are", "of", "to", "in", "on",
  "happen", "happens", "what", "which", "how", "and", "or", "for", "this", "that",
  "find", "show", "me", "code", "function", "handle", "handled", "handling",
]);

function queryTokens(q: string): string[] {
  return splitIdent(q).toLowerCase().match(/[a-z0-9]+/g)?.filter((t) => t.length > 2 && !QSTOP.has(t)) ?? [];
}

// The featurized node index is expensive to build over a large graph, so cache it
// per graph object (the served graph is stable for a session).
const indexCache = new WeakMap<TelosGraph, { node: TelosNode; vec: number[] }[]>();

export function buildSemanticIndex(graph: TelosGraph): { node: TelosNode; vec: number[] }[] {
  let idx = indexCache.get(graph);
  if (idx) return idx;
  idx = graph.nodes.map((n) => ({ node: n, vec: featurize(nodeText(n)) }));
  indexCache.set(graph, idx);
  return idx;
}

/**
 * Hybrid semantic + keyword + centrality ranking. `semWeight`/`kwWeight` are the
 * blend; a node is kept only if it has some semantic OR keyword signal.
 */
export function semanticAsk(
  graph: TelosGraph,
  question: string,
  opts: { limit?: number; semWeight?: number; kwWeight?: number } = {},
): SemanticAnswer[] {
  const q = question.trim();
  if (!q) return [];
  const semWeight = opts.semWeight ?? 1;
  const kwWeight = opts.kwWeight ?? 0.6;
  const qVec = featurize(splitIdent(q));
  const qt = queryTokens(q);
  const idx = buildSemanticIndex(graph);

  const out: SemanticAnswer[] = [];
  for (const { node, vec } of idx) {
    const sem = cosine(qVec, vec);
    const hay = nodeText(node).toLowerCase();
    let hits = 0;
    for (const t of qt) if (hay.includes(t)) hits += 1;
    const kw = qt.length ? hits / qt.length : 0;
    // Keep only nodes with a real signal: a meaningful semantic match OR an exact
    // keyword hit. The 0.15 floor sits above the featurizer's char-trigram noise
    // floor (~0.12), so off-topic queries surface nothing strong.
    if (sem < 0.15 && kw === 0) continue;
    const score = semWeight * sem + kwWeight * kw + Math.min(node.fanIn, 10) * 0.02;
    out.push({ node, score });
  }
  out.sort((a, b) => b.score - a.score || b.node.fanIn - a.node.fanIn || (a.node.id < b.node.id ? -1 : 1));
  return out.slice(0, opts.limit ?? 10);
}
