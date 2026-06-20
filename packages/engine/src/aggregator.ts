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
      clusters.set(id, { id, level: "layer", label: layer, layer, parentId: null, childIds: [], symbolCount: 0, fanIn: 0, fanOut: 0 });
    }
    return id;
  };
  const ensureModule = (layer: Layer, dir: string): string => {
    const layerId = ensureLayer(layer);
    const id = `module:${layer}:${dir}`;
    if (!clusters.has(id)) {
      clusters.set(id, { id, level: "module", label: dir, layer, parentId: layerId, childIds: [], symbolCount: 0, fanIn: 0, fanOut: 0 });
      clusters.get(layerId)!.childIds.push(id);
    }
    return id;
  };
  const ensureFile = (file: TelosNode): string => {
    const moduleId = ensureModule(file.layer, parentDir(file.path));
    if (!clusters.has(file.id)) {
      clusters.set(file.id, { id: file.id, level: "file", label: baseName(file.path), layer: file.layer, parentId: moduleId, childIds: [], symbolCount: 0, fanIn: 0, fanOut: 0 });
      clusters.get(moduleId)!.childIds.push(file.id);
    }
    return file.id;
  };

  const fileNodes = graph.nodes.filter((n) => n.kind === "file");
  const fileByPath = new Map<string, TelosNode>();

  // 1. Materialize all file clusters first, so every symbol has a parent.
  for (const f of fileNodes) {
    fileByPath.set(f.path, f);
    const fileId = ensureFile(f);
    const moduleId = clusters.get(fileId)!.parentId!;
    const layerId = clusters.get(moduleId)!.parentId!;
    membership[f.id] = { layerId, moduleId, fileId };
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
    }
  }

  return { clusters: [...clusters.values()], membership };
}
