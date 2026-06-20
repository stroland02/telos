import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Layer, TelosEdge, TelosGraph, TelosNode, createNodeId } from "./schema.js";
import { extractQueryPath } from "./languages/registry.js";

interface LayerRule { match: string; layer: Layer }
const hintCache = new Map<string, LayerRule[]>();
function layerRules(language: string): LayerRule[] {
  if (!hintCache.has(language)) {
    const p = join(dirname(extractQueryPath(language)), "layer-hints.json");
    hintCache.set(language, existsSync(p) ? JSON.parse(readFileSync(p, "utf8")).rules : []);
  }
  return hintCache.get(language)!;
}

function assignLayer(node: TelosNode): Layer {
  for (const r of layerRules(node.language)) {
    if (new RegExp(r.match).test(node.path) || new RegExp(r.match).test(node.name)) return r.layer;
  }
  return "unknown";
}

const DEF_KINDS = new Set(["function", "method", "class"]);

export function resolveGraph(graph: TelosGraph): TelosGraph {
  const nodes = graph.nodes.map((n) => ({ ...n, layer: assignLayer(n), fanIn: 0, fanOut: 0 }));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // name → definition ids (only defs participate in call binding)
  const byName = new Map<string, string[]>();
  // placeholder name-id → name (to recover the call target name)
  const nameIdToName = new Map<string, string>();
  for (const n of nodes) {
    if (DEF_KINDS.has(n.kind)) {
      if (!byName.has(n.name)) byName.set(n.name, []);
      byName.get(n.name)!.push(n.id);
      nameIdToName.set(createNodeId("?", n.name), n.name);
    }
  }

  const edges: TelosEdge[] = [];
  for (const e of graph.edges) {
    if (e.kind === "calls" && !e.resolved) {
      const name = nameIdToName.get(e.targetId);
      const candidates = name ? byName.get(name) ?? [] : [];
      if (candidates.length === 1) edges.push({ ...e, targetId: candidates[0], resolved: true });
      continue; // drop unresolved/ambiguous calls
    }
    edges.push(e);
  }

  for (const e of edges) {
    const s = byId.get(e.sourceId); const t = byId.get(e.targetId);
    if (s) s.fanOut++;
    if (t) t.fanIn++;
  }
  return { nodes, edges };
}
