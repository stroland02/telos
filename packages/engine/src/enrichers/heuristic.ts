import { Enricher } from "../enrich.js";

/**
 * Deterministic baseline enricher: composes a one-line structural summary from
 * facts already in the graph. No LLM, no randomness — golden-test stable.
 */
export const heuristicEnricher: Enricher = {
  name: "heuristic",
  enrich(node) {
    const summary =
      `${node.kind} ${node.name} (${node.language}, ${node.layer} layer) — ` +
      `called by ${node.fanIn}, calls ${node.fanOut}, spans ${node.lines} lines.`;
    return { summary };
  },
};
