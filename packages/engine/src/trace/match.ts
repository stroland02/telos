import { TelosGraph } from "../schema.js";
import { SpanRecord } from "./otlp.js";

// Span → node resolution. Prefers OTel semantic-convention code.* attributes
// (the join keys the v1 schema reserved), falling back to the span name.

export interface NodeIndex {
  /** qualifiedName → node id */
  byQname: Map<string, string>;
  /** "<sourceId> <targetId>" for every static graph edge — used to decide
   *  which dynamic call edges we are allowed to animate. */
  edgePairs: Set<string>;
}

export function buildNodeIndex(graph: TelosGraph): NodeIndex {
  const byQname = new Map<string, string>();
  for (const n of graph.nodes) byQname.set(n.qualifiedName, n.id);
  const edgePairs = new Set<string>();
  for (const e of graph.edges) edgePairs.add(`${e.sourceId} ${e.targetId}`);
  return { byQname, edgePairs };
}

/** Resolve OTel `code.*` attributes (with an optional fallback name) to a node
 *  id, or null. Shared by span and log matching. */
export function matchByAttrs(attrs: Record<string, string>, fallbackName: string, index: NodeIndex): string | null {
  const ns = attrs["code.namespace"];
  const fn = attrs["code.function"];
  if (ns && fn) {
    const hit = index.byQname.get(`${ns}.${fn}`);
    if (hit) return hit;
  }
  if (fn) {
    const hit = index.byQname.get(fn);
    if (hit) return hit;
  }
  return fallbackName ? index.byQname.get(fallbackName) ?? null : null;
}

/** Resolve a span to a node id, or null if nothing matches (unmapped). */
export function matchSpanToNode(span: SpanRecord, index: NodeIndex): string | null {
  return matchByAttrs(span.attrs, span.name, index);
}
