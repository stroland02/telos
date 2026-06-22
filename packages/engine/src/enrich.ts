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
  enrich(node: TelosNode, ctx: EnrichContext): NodeEnrichment | Promise<NodeEnrichment>;
}

/** Returns a new graph with summaries (and any refined layers) filled. Async to
 *  support remote/LLM enrichers; bounded concurrency keeps local models sane. */
export async function enrichGraph(
  graph: TelosGraph,
  enricher: Enricher,
  opts: { concurrency?: number } = {},
): Promise<TelosGraph> {
  const concurrency = Math.max(1, opts.concurrency ?? 8);
  const nodes = [...graph.nodes];
  const out: TelosNode[] = new Array(nodes.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= nodes.length) return;
      const node = nodes[i];
      const ctx: EnrichContext = { graph, callers: callersOf(graph, node.id), callees: calleesOf(graph, node.id) };
      const e = await enricher.enrich(node, ctx);
      out[i] = { ...node, summary: e.summary, layer: e.layer ?? node.layer };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, nodes.length) }, worker));
  return { nodes: out, edges: graph.edges };
}
