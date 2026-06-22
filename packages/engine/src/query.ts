import { TelosGraph, TelosNode } from "./schema.js";

const byQName = (a: TelosNode, b: TelosNode) => a.qualifiedName.localeCompare(b.qualifiedName);

export function resolveNode(graph: TelosGraph, ref: string): TelosNode | null {
  return (
    graph.nodes.find((n) => n.id === ref) ??
    graph.nodes.find((n) => n.qualifiedName === ref) ??
    [...graph.nodes].sort((a, b) => a.path.localeCompare(b.path)).find((n) => n.name === ref) ??
    null
  );
}

export function calleesOf(graph: TelosGraph, ref: string): TelosNode[] {
  const node = resolveNode(graph, ref);
  if (!node) return [];
  const ids = new Set(graph.edges.filter((e) => e.kind === "calls" && e.sourceId === node.id).map((e) => e.targetId));
  return graph.nodes.filter((n) => ids.has(n.id)).sort(byQName);
}

export function callersOf(graph: TelosGraph, ref: string): TelosNode[] {
  const node = resolveNode(graph, ref);
  if (!node) return [];
  const ids = new Set(graph.edges.filter((e) => e.kind === "calls" && e.targetId === node.id).map((e) => e.sourceId));
  return graph.nodes.filter((n) => ids.has(n.id)).sort(byQName);
}

const DEP_KINDS = new Set(["calls", "imports", "references", "inherits", "implements"]);

export function impactOf(graph: TelosGraph, ref: string): TelosNode[] {
  const node = resolveNode(graph, ref);
  if (!node) return [];
  // reverse adjacency: target -> [sources that depend on it]
  const rev = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!DEP_KINDS.has(e.kind)) continue;
    const list = rev.get(e.targetId) ?? [];
    list.push(e.sourceId);
    rev.set(e.targetId, list);
  }
  const seen = new Set<string>();
  const stack = [node.id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const dep of rev.get(cur) ?? []) {
      if (dep === node.id || seen.has(dep)) continue;
      seen.add(dep);
      stack.push(dep);
    }
  }
  return graph.nodes.filter((n) => seen.has(n.id)).sort(byQName);
}

export function affectedBy(graph: TelosGraph, paths: string[]): { symbols: TelosNode[]; files: string[] } {
  if (paths.length === 0) return { symbols: [], files: [] };
  const pathSet = new Set(paths);
  const seeds = graph.nodes.filter((n) => pathSet.has(n.path));
  const acc = new Map<string, TelosNode>();
  for (const seed of seeds) {
    acc.set(seed.id, seed);
    for (const dep of impactOf(graph, seed.id)) acc.set(dep.id, dep);
  }
  const symbols = [...acc.values()].sort(byQName);
  const files = [...new Set(symbols.map((n) => n.path))].sort();
  return { symbols, files };
}

export interface ExploreHit { node: TelosNode; callers: string[]; callees: string[]; impactCount: number }

export function explore(
  graph: TelosGraph,
  matches: TelosNode[],
  opts: { limit?: number } = {},
): { hits: ExploreHit[] } {
  const limit = opts.limit ?? 8;
  const hits = matches.slice(0, limit).map((node) => ({
    node,
    callers: callersOf(graph, node.id).map((n) => n.qualifiedName),
    callees: calleesOf(graph, node.id).map((n) => n.qualifiedName),
    impactCount: impactOf(graph, node.id).length,
  }));
  return { hits };
}
