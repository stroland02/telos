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
