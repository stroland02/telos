import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Layer, TelosEdge, TelosGraph, TelosNode, createNodeId } from "./schema.js";
import { extractQueryPath } from "./languages/registry.js";

interface LayerRule { match: string; layer: Layer; regex: RegExp }
const hintCache = new Map<string, LayerRule[]>();
function layerRules(language: string): LayerRule[] {
  if (!hintCache.has(language)) {
    const p = join(dirname(extractQueryPath(language)), "layer-hints.json");
    const raw: { match: string; layer: Layer }[] = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")).rules : [];
    hintCache.set(language, raw.map((r) => ({ ...r, regex: new RegExp(r.match) })));
  }
  return hintCache.get(language)!;
}

// Universal directory/role-based layer inference, applied when per-language
// layer-hints don't match — so the map clusters sensibly even for codebases that
// don't follow MVC naming. First match wins; tested against a /-normalized,
// lowercased path. Users can still override via a language's layer-hints.json.
const DEFAULT_LAYER_PATTERNS: { layer: Layer; re: RegExp }[] = [
  { layer: "ui", re: /\.(tsx|jsx|vue|svelte)$|\/(components?|views?|pages?|ui|web|frontend|client|widgets?)\// },
  { layer: "api", re: /\/(controllers?|routes?|api|server|handlers?|endpoints?|graphql|rest|http)\/|(controller|router|handler)\.[a-z]+$/ },
  { layer: "data", re: /\/(models?|repositor(?:y|ies)|entit(?:y|ies)|dao|schemas?|migrations?|database|db|stores?|persistence)\/|(model|repository|entity|schema|dao)\.[a-z]+$/ },
  { layer: "service", re: /\/(services?|usecases?|domain|core|engine|business|logic|application|workers?)\/|service\.[a-z]+$/ },
  { layer: "infra", re: /\/(config|infra(?:structure)?|deploy(?:ment)?|docker|k8s|kubernetes|terraform|ci|ops|pipeline)\/|\.(ya?ml|toml)$|dockerfile/ },
  { layer: "util", re: /\/(utils?|lib|helpers?|common|shared|tools?|support)\// },
];

/** Best-effort layer from a file path when explicit hints miss. */
export function inferLayerFromPath(path: string): Layer {
  const p = path.replace(/\\/g, "/").toLowerCase();
  for (const { layer, re } of DEFAULT_LAYER_PATTERNS) if (re.test(p)) return layer;
  return "unknown";
}

function assignLayer(node: TelosNode): Layer {
  for (const r of layerRules(node.language)) {
    if (r.regex.test(node.path) || r.regex.test(node.name)) return r.layer;
  }
  return inferLayerFromPath(node.path);
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
