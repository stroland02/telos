import Dagre from "@dagrejs/dagre";
import { GraphView, Layer, ViewLevel } from "../api/types";

export interface FlowNodeData extends Record<string, unknown> { label: string; level: ViewLevel; layer: Layer; symbolCount: number; fanIn: number; fanOut: number; width: number; height: number; }
export interface FlowNode { id: string; position: { x: number; y: number }; data: FlowNodeData; type: "telos"; }
export interface FlowEdge { id: string; source: string; target: string; data: { weight: number }; }
export interface FlowGraph { nodes: FlowNode[]; edges: FlowEdge[]; }

// Importance-scaled node sizing. Per data-viz standard, encode importance by
// AREA (side ∝ √weight, i.e. D3 scaleSqrt) so big nodes don't over-dominate,
// clamped to a perceptually-distinct min/max range.
const MIN_W = 168, MAX_W = 300, MIN_H = 58, MAX_H = 104;
const weightOf = (n: GraphView["nodes"][number]) => Math.max(1, n.symbolCount + n.fanIn + n.fanOut);

export function toFlowGraph(view: GraphView): FlowGraph {
  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 48, ranksep: 96 });

  const maxW = Math.max(1, ...view.nodes.map(weightOf));
  const dims = new Map<string, { width: number; height: number }>();
  for (const n of view.nodes) {
    const t = Math.sqrt(weightOf(n)) / Math.sqrt(maxW); // 0..1, area-proportional
    const s = { width: Math.round(MIN_W + (MAX_W - MIN_W) * t), height: Math.round(MIN_H + (MAX_H - MIN_H) * t) };
    dims.set(n.id, s);
    g.setNode(n.id, s);
  }
  for (const e of view.edges) g.setEdge(e.sourceId, e.targetId);

  Dagre.layout(g);

  const nodes: FlowNode[] = view.nodes.map((n) => {
    const p = g.node(n.id);
    const s = dims.get(n.id)!;
    return {
      id: n.id,
      type: "telos",
      position: { x: p.x - s.width / 2, y: p.y - s.height / 2 },
      data: { label: n.label, level: n.level, layer: n.layer, symbolCount: n.symbolCount, fanIn: n.fanIn, fanOut: n.fanOut, width: s.width, height: s.height },
    };
  });

  const edges: FlowEdge[] = view.edges.map((e) => ({
    id: `${e.sourceId}->${e.targetId}`,
    source: e.sourceId,
    target: e.targetId,
    data: { weight: e.weight },
  }));

  return { nodes, edges };
}
