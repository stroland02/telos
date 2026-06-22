import { TelosGraph, TelosNode } from "./schema.js";

export interface Answer {
  node: TelosNode;
  score: number;
}

const STOP = new Set([
  "where", "does", "do", "the", "a", "an", "is", "are", "of", "to", "in", "on",
  "happen", "happens", "what", "which", "how", "and", "or", "for", "this", "that",
]);

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));
}

/** Deterministic keyword+structure ranking. No LLM; embeddings are a later upgrade. */
export function askGraph(graph: TelosGraph, question: string, opts: { limit?: number } = {}): Answer[] {
  const qWords = tokens(question);
  if (qWords.length === 0) return [];
  const answers: Answer[] = [];
  for (const node of graph.nodes) {
    const hay = new Set(tokens(`${node.name} ${node.qualifiedName} ${node.path} ${node.summary ?? ""}`));
    let hits = 0;
    for (const w of qWords) if (hay.has(w)) hits += 1;
    if (hits === 0) continue;
    const score = hits + Math.min(node.fanIn, 10) * 0.1;
    answers.push({ node, score });
  }
  answers.sort((x, y) => y.score - x.score || y.node.fanIn - x.node.fanIn || (x.node.id < y.node.id ? -1 : 1));
  return answers.slice(0, opts.limit ?? 10);
}
