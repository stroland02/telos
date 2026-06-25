import { TelosGraph, TelosNode } from "./schema.js";

// One node as it appears in the context pack — the fields an agent needs to
// orient, nothing more (keeps the brief token-cheap).
export interface ContextPackNode {
  id: string;
  qualifiedName: string;
  kind: string;
  layer: string;
  path: string;
  fanIn: number;
  fanOut: number;
  complexity: number;
  summary?: string;
}

// A token-budgeted, pre-digested architecture brief: the universal graph
// distilled into agent working memory so a session starts warm instead of
// re-exploring file by file.
export interface ContextPack {
  totals: { nodes: number; edges: number; files: number; languages: string[] };
  layers: { layer: string; count: number }[];
  entryPoints: ContextPackNode[];
  hotspots: ContextPackNode[];
  summaries: { qualifiedName: string; summary: string }[];
}

const DEFAULT_LIMIT = 12;

function toPackNode(n: TelosNode): ContextPackNode {
  const p: ContextPackNode = {
    id: n.id,
    qualifiedName: n.qualifiedName,
    kind: n.kind,
    layer: n.layer,
    path: n.path,
    fanIn: n.fanIn,
    fanOut: n.fanOut,
    complexity: n.complexity,
  };
  if (n.summary && n.summary.trim()) p.summary = n.summary;
  return p;
}

/** Distill a graph into a token-bounded context pack. `limit` caps every list
 *  so the pack stays small regardless of repo size. Pure + deterministic. */
export function buildContextPack(graph: TelosGraph, opts?: { limit?: number }): ContextPack {
  const limit = Math.max(1, opts?.limit ?? DEFAULT_LIMIT);
  const nodes = graph.nodes;

  const files = nodes.filter((n) => n.kind === "file").length;
  const languages = [...new Set(nodes.map((n) => n.language))].sort();

  const layerCounts = new Map<string, number>();
  for (const n of nodes) layerCounts.set(n.layer, (layerCounts.get(n.layer) ?? 0) + 1);
  const layers = [...layerCounts.entries()]
    .map(([layer, count]) => ({ layer, count }))
    .sort((a, b) => b.count - a.count || a.layer.localeCompare(b.layer));

  // Symbols only — files/modules are containers, not where behavior lives.
  const symbols = nodes.filter((n) => n.kind !== "file" && n.kind !== "module");

  const entryPoints = [...symbols]
    .sort((a, b) => b.fanIn - a.fanIn || a.qualifiedName.localeCompare(b.qualifiedName))
    .slice(0, limit)
    .map(toPackNode);

  const hotspots = [...symbols]
    .sort((a, b) => b.complexity - a.complexity || b.fanOut - a.fanOut || a.qualifiedName.localeCompare(b.qualifiedName))
    .slice(0, limit)
    .map(toPackNode);

  const summaries = nodes
    .filter((n) => n.summary && n.summary.trim())
    .sort((a, b) => b.fanIn - a.fanIn || a.qualifiedName.localeCompare(b.qualifiedName))
    .slice(0, limit)
    .map((n) => ({ qualifiedName: n.qualifiedName, summary: (n.summary as string).trim() }));

  return {
    totals: { nodes: nodes.length, edges: graph.edges.length, files, languages },
    layers,
    entryPoints,
    hotspots,
    summaries,
  };
}

/** Compact markdown rendering — the warm-start brief an agent (or human) reads. */
export function renderContextPack(pack: ContextPack): string {
  const t = pack.totals;
  const out: string[] = [];
  out.push("# Architecture context");
  out.push(`${t.nodes} nodes, ${t.edges} edges, ${t.files} files; languages: ${t.languages.join(", ") || "none"}`);
  out.push("");
  out.push("## Layers");
  for (const l of pack.layers) out.push(`- ${l.layer}: ${l.count}`);

  if (pack.entryPoints.length) {
    out.push("");
    out.push("## Entry points (most depended-upon)");
    for (const n of pack.entryPoints) out.push(`- ${n.qualifiedName} — ${n.kind}/${n.layer}, fanIn ${n.fanIn} (${n.path})`);
  }
  if (pack.hotspots.length) {
    out.push("");
    out.push("## Hotspots (highest complexity)");
    for (const n of pack.hotspots) out.push(`- ${n.qualifiedName} — complexity ${n.complexity}, fanOut ${n.fanOut} (${n.path})`);
  }
  if (pack.summaries.length) {
    out.push("");
    out.push("## Key summaries");
    for (const s of pack.summaries) out.push(`- ${s.qualifiedName}: ${s.summary}`);
  }
  return out.join("\n") + "\n";
}
