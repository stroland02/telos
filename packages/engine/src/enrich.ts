import { TelosGraph, TelosNode, Layer } from "./schema.js";
import { callersOf, calleesOf } from "./query.js";

export interface NodeEnrichment {
  summary: string;
  layer?: Layer;
}

export interface EnrichContext {
  graph: TelosGraph;
  callers: TelosNode[];
  callees: TelosNode[];
}

export interface Enricher {
  readonly name: string;
  enrich(node: TelosNode, ctx: EnrichContext): NodeEnrichment;
}

/** Pure: returns a new graph with summaries (and any refined layers) filled. */
export function enrichGraph(graph: TelosGraph, enricher: Enricher): TelosGraph {
  const nodes = graph.nodes.map((node) => {
    const ctx: EnrichContext = {
      graph,
      callers: callersOf(graph, node.id),
      callees: calleesOf(graph, node.id),
    };
    const e = enricher.enrich(node, ctx);
    return { ...node, summary: e.summary, layer: e.layer ?? node.layer };
  });
  return { nodes, edges: graph.edges };
}
