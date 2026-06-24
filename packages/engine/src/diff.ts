import { TelosGraph, TelosNode } from "./schema.js";

export interface GraphDiff {
  added: { nodes: string[]; edges: string[] };
  removed: { nodes: string[]; edges: string[] };
  changed: string[];
}

const edgeId = (e: { sourceId: string; targetId: string; kind: string }) =>
  `${e.sourceId}>${e.targetId}>${e.kind}`;

// Fields whose change should light up the map.
function nodeChanged(a: TelosNode, b: TelosNode): boolean {
  return a.kind !== b.kind || a.lineStart !== b.lineStart || a.lineEnd !== b.lineEnd
    || a.layer !== b.layer || a.summary !== b.summary;
}

export function diffGraphs(base: TelosGraph, next: TelosGraph): GraphDiff {
  const baseNodes = new Map(base.nodes.map((n) => [n.id, n]));
  const nextNodes = new Map(next.nodes.map((n) => [n.id, n]));
  const baseEdges = new Set(base.edges.map(edgeId));
  const nextEdges = new Set(next.edges.map(edgeId));

  const addedNodes = [...nextNodes.keys()].filter((id) => !baseNodes.has(id));
  const removedNodes = [...baseNodes.keys()].filter((id) => !nextNodes.has(id));
  const changed = [...nextNodes.keys()].filter(
    (id) => baseNodes.has(id) && nodeChanged(baseNodes.get(id)!, nextNodes.get(id)!),
  );
  const addedEdges = [...nextEdges].filter((e) => !baseEdges.has(e));
  const removedEdges = [...baseEdges].filter((e) => !nextEdges.has(e));

  return {
    added: { nodes: addedNodes, edges: addedEdges },
    removed: { nodes: removedNodes, edges: removedEdges },
    changed,
  };
}
