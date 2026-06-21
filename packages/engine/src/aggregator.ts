import { TelosGraph, TelosNode, Layer } from "./schema.js";

export type ClusterLevel = "layer" | "module" | "file";

export interface ClusterNode {
  id: string;
  level: ClusterLevel;
  label: string;
  layer: Layer;
  parentId: string | null;
  childIds: string[];
  symbolCount: number;
  fanIn: number;
  fanOut: number;
  /** Max cyclomatic complexity of any symbol in this cluster (0 when unknown). */
  maxComplexity: number;
}

export interface ClusterPath { layerId: string; moduleId: string; fileId: string; }

export interface AggregatedGraph {
  clusters: ClusterNode[];
  membership: Record<string, ClusterPath>;
}

function parentDir(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "." : p.slice(0, i);
}
function baseName(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

export function aggregate(graph: TelosGraph): AggregatedGraph {
  const clusters = new Map<string, ClusterNode>();
  const membership: Record<string, ClusterPath> = {};

  const ensureLayer = (layer: Layer): string => {
    const id = `layer:${layer}`;
    if (!clusters.has(id)) {
      clusters.set(id, { id, level: "layer", label: layer, layer, parentId: null, childIds: [], symbolCount: 0, fanIn: 0, fanOut: 0, maxComplexity: 0 });
    }
    return id;
  };
  const ensureModule = (layer: Layer, dir: string): string => {
    const layerId = ensureLayer(layer);
    const id = `module:${layer}:${dir}`;
    if (!clusters.has(id)) {
      clusters.set(id, { id, level: "module", label: dir, layer, parentId: layerId, childIds: [], symbolCount: 0, fanIn: 0, fanOut: 0, maxComplexity: 0 });
      clusters.get(layerId)!.childIds.push(id);
    }
    return id;
  };
  const ensureFile = (file: TelosNode): string => {
    const moduleId = ensureModule(file.layer, parentDir(file.path));
    if (!clusters.has(file.id)) {
      clusters.set(file.id, { id: file.id, level: "file", label: baseName(file.path), layer: file.layer, parentId: moduleId, childIds: [], symbolCount: 0, fanIn: 0, fanOut: 0, maxComplexity: 0 });
      clusters.get(moduleId)!.childIds.push(file.id);
    }
    return file.id;
  };

  const fileNodes = graph.nodes.filter((n) => n.kind === "file");
  const fileByPath = new Map<string, TelosNode>();

  // 1. Materialize all file clusters first, so every symbol has a parent.
  //    Also roll the file node's own fanIn/fanOut into the cluster hierarchy
  //    (calls are file-rooted so file nodes carry real fanOut; symbolCount is
  //    NOT incremented here — it counts leaf symbols only).
  for (const f of fileNodes) {
    fileByPath.set(f.path, f);
    const fileId = ensureFile(f);
    const moduleId = clusters.get(fileId)!.parentId!;
    const layerId = clusters.get(moduleId)!.parentId!;
    membership[f.id] = { layerId, moduleId, fileId };
    for (const id of [fileId, moduleId, layerId]) {
      const c = clusters.get(id)!;
      c.fanIn += f.fanIn;
      c.fanOut += f.fanOut;
    }
  }

  // 2. Attach symbols to their file and roll metrics up the chain.
  for (const sym of graph.nodes) {
    if (sym.kind === "file") continue;
    const file = fileByPath.get(sym.path);
    if (!file) continue; // orphan symbol with no file node — skip
    const fileId = file.id;
    const fileCluster = clusters.get(fileId)!;
    fileCluster.childIds.push(sym.id);
    const moduleId = fileCluster.parentId!;
    const layerId = clusters.get(moduleId)!.parentId!;
    membership[sym.id] = { layerId, moduleId, fileId };
    for (const id of [fileId, moduleId, layerId]) {
      const c = clusters.get(id)!;
      c.symbolCount += 1;
      c.fanIn += sym.fanIn;
      c.fanOut += sym.fanOut;
      if (sym.complexity > c.maxComplexity) c.maxComplexity = sym.complexity;
    }
  }

  return { clusters: [...clusters.values()], membership };
}

export type ViewLevel = ClusterLevel | "symbol";
export interface ViewNode { id: string; label: string; level: ViewLevel; layer: Layer; symbolCount: number; fanIn: number; fanOut: number; complexity: number; }
export interface ViewEdge { sourceId: string; targetId: string; weight: number; }
export interface GraphView { nodes: ViewNode[]; edges: ViewEdge[]; }
export interface NodeDetail { node: TelosNode; callers: TelosNode[]; callees: TelosNode[]; }

function clusterToView(c: ClusterNode): ViewNode {
  return { id: c.id, label: c.label, level: c.level, layer: c.layer, symbolCount: c.symbolCount, fanIn: c.fanIn, fanOut: c.fanOut, complexity: c.maxComplexity };
}

function memberAt(agg: AggregatedGraph, nodeId: string, level: ClusterLevel): string | undefined {
  const m = agg.membership[nodeId];
  if (!m) return undefined;
  return level === "layer" ? m.layerId : level === "module" ? m.moduleId : m.fileId;
}

function aggregateEdges(graph: TelosGraph, agg: AggregatedGraph, level: ClusterLevel, allowed: Set<string>): ViewEdge[] {
  const weights = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.kind === "contains") continue;
    const s = memberAt(agg, e.sourceId, level);
    const t = memberAt(agg, e.targetId, level);
    if (!s || !t || s === t) continue;
    if (!allowed.has(s) || !allowed.has(t)) continue;
    const key = `${s}\0${t}`;
    weights.set(key, (weights.get(key) ?? 0) + 1);
  }
  return [...weights.entries()].map(([k, weight]) => {
    const [sourceId, targetId] = k.split("\0");
    return { sourceId, targetId, weight };
  });
}

export function overview(graph: TelosGraph, agg: AggregatedGraph): GraphView {
  const layers = agg.clusters.filter((c) => c.level === "layer");
  const allowed = new Set(layers.map((c) => c.id));
  return { nodes: layers.map(clusterToView), edges: aggregateEdges(graph, agg, "layer", allowed) };
}

export function childrenOf(graph: TelosGraph, agg: AggregatedGraph, clusterId: string): GraphView | null {
  const parent = agg.clusters.find((c) => c.id === clusterId);
  if (!parent) return null;

  if (parent.level === "file") {
    const childSet = new Set(parent.childIds);
    const nodes: ViewNode[] = graph.nodes
      .filter((n) => childSet.has(n.id))
      .map((n) => ({ id: n.id, label: n.name, level: "symbol" as ViewLevel, layer: n.layer, symbolCount: 0, fanIn: n.fanIn, fanOut: n.fanOut, complexity: n.complexity }));
    return { nodes, edges: [] }; // v1 calls are file-rooted: no symbol→symbol edges yet
  }

  const childLevel: ClusterLevel = parent.level === "layer" ? "module" : "file";
  const children = agg.clusters.filter((c) => c.parentId === clusterId);
  const allowed = new Set(children.map((c) => c.id));
  return { nodes: children.map(clusterToView), edges: aggregateEdges(graph, agg, childLevel, allowed) };
}

export function nodeDetail(graph: TelosGraph, nodeId: string): NodeDetail | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const node = byId.get(nodeId);
  if (!node) return null;
  const callers: TelosNode[] = [];
  const callees: TelosNode[] = [];
  for (const e of graph.edges) {
    if (e.kind !== "calls") continue;
    if (e.targetId === nodeId) { const c = byId.get(e.sourceId); if (c) callers.push(c); }
    if (e.sourceId === nodeId) { const c = byId.get(e.targetId); if (c) callees.push(c); }
  }
  return { node, callers, callees };
}
