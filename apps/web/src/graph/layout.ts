import Dagre from "@dagrejs/dagre";
import { GraphView, Layer, ViewLevel } from "../api/types";

export interface FlowNodeData { label: string; level: ViewLevel; layer: Layer; symbolCount: number; fanIn: number; fanOut: number; }
export interface FlowNode { id: string; position: { x: number; y: number }; data: FlowNodeData; type: "telos"; }
export interface FlowEdge { id: string; source: string; target: string; data: { weight: number }; }
export interface FlowGraph { nodes: FlowNode[]; edges: FlowEdge[]; }

export const LAYER_COLORS: Record<Layer, string> = {
  api: "#3b82f6",
  service: "#8b5cf6",
  data: "#10b981",
  ui: "#ec4899",
  infra: "#f59e0b",
  util: "#6b7280",
  unknown: "#94a3b8",
};

const NODE_W = 180;
const NODE_H = 56;

export function toFlowGraph(view: GraphView): FlowGraph {
  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80 });

  for (const n of view.nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of view.edges) g.setEdge(e.sourceId, e.targetId);

  Dagre.layout(g);

  const nodes: FlowNode[] = view.nodes.map((n) => {
    const p = g.node(n.id);
    return {
      id: n.id,
      type: "telos",
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
      data: { label: n.label, level: n.level, layer: n.layer, symbolCount: n.symbolCount, fanIn: n.fanIn, fanOut: n.fanOut },
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
