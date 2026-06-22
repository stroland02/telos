import { TelosGraph, TelosNode, EdgeKind } from "./schema.js";

export interface TourStop {
  node: TelosNode;
  order: number;
}

const DEP_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  "calls", "imports", "inherits", "implements", "references",
]);

/**
 * Order nodes in dependency order (a node appears after the nodes it depends
 * on) via Kahn topological sort. Cycles are broken deterministically by
 * fewest-remaining-deps then fan-in desc then id. Pure; no LLM.
 */
export function buildTour(graph: TelosGraph, opts: { limit?: number } = {}): TourStop[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const depCount = new Map<string, number>(); // how many things each node still depends on
  const dependents = new Map<string, string[]>(); // target -> sources that depend on it
  for (const n of graph.nodes) depCount.set(n.id, 0);
  for (const e of graph.edges) {
    if (!DEP_KINDS.has(e.kind)) continue;
    if (!byId.has(e.sourceId) || !byId.has(e.targetId) || e.sourceId === e.targetId) continue;
    depCount.set(e.sourceId, (depCount.get(e.sourceId) ?? 0) + 1);
    const list = dependents.get(e.targetId) ?? [];
    list.push(e.sourceId);
    dependents.set(e.targetId, list);
  }

  const cmp = (a: string, b: string) => {
    const na = byId.get(a)!, nb = byId.get(b)!;
    return nb.fanIn - na.fanIn || (a < b ? -1 : a > b ? 1 : 0);
  };

  const ready = graph.nodes.filter((n) => (depCount.get(n.id) ?? 0) === 0).map((n) => n.id);
  const out: TourStop[] = [];
  const visited = new Set<string>();
  while (out.length < graph.nodes.length) {
    if (ready.length === 0) {
      // cycle: release the unvisited node with the fewest remaining deps
      const rest = graph.nodes.filter((n) => !visited.has(n.id))
        .sort((a, b) => (depCount.get(a.id)! - depCount.get(b.id)!) || cmp(a.id, b.id));
      if (rest.length === 0) break;
      ready.push(rest[0].id);
    }
    ready.sort(cmp);
    const id = ready.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    out.push({ node: byId.get(id)!, order: out.length });
    for (const dep of dependents.get(id) ?? []) {
      depCount.set(dep, (depCount.get(dep) ?? 1) - 1);
      if ((depCount.get(dep) ?? 0) <= 0 && !visited.has(dep)) ready.push(dep);
    }
  }
  return typeof opts.limit === "number" ? out.slice(0, opts.limit) : out;
}
