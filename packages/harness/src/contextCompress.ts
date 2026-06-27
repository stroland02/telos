/**
 * Focused context compression (LLM phase Feature C). The engine's
 * `buildContextPack` distills a graph into a task-AGNOSTIC brief (entry points,
 * hotspots, summaries). This adds a task-AWARE mode: given a `focus` query, it
 * keeps a minimal structural header (totals + layers) but REPLACES the generic
 * lists with the slice of nodes most relevant to the focus — smaller and more
 * on-target than the full brief. With no focus it returns the full structural
 * pack unchanged (backward compatible).
 *
 * Lives in @telos/harness so it can reuse `semanticAsk` (Feature B) and the
 * engine's pack builder without a circular dependency.
 */
import {
  buildContextPack,
  renderContextPack,
  type ContextPack,
  type ContextPackNode,
  type TelosGraph,
  type TelosNode,
} from "@telos/engine";
import { semanticAsk } from "./semanticAsk.js";

export interface FocusedContextPack extends ContextPack {
  focus: string | null;
  relevant: ContextPackNode[];
}

function toPackNode(n: TelosNode): ContextPackNode {
  const p: ContextPackNode = {
    id: n.id, qualifiedName: n.qualifiedName, kind: n.kind, layer: n.layer,
    path: n.path, fanIn: n.fanIn, fanOut: n.fanOut, complexity: n.complexity,
  };
  if (n.summary && n.summary.trim()) p.summary = n.summary.trim();
  return p;
}

/**
 * Build a context pack. With `focus`, compress to the focus-relevant slice
 * (structural header + relevant nodes, generic lists dropped). Without `focus`,
 * return the full structural pack.
 */
export function buildFocusedContextPack(
  graph: TelosGraph,
  opts: { limit?: number; focus?: string } = {},
): FocusedContextPack {
  const limit = Math.max(1, opts.limit ?? 12);
  const structural = buildContextPack(graph, { limit });
  const focus = (opts.focus ?? "").trim();
  if (!focus) {
    return { ...structural, focus: null, relevant: [] };
  }
  const relevant = semanticAsk(graph, focus, { limit }).map((a) => toPackNode(a.node));
  // Focused-replace: keep totals + layers, drop the generic lists.
  return {
    totals: structural.totals,
    layers: structural.layers,
    entryPoints: [],
    hotspots: [],
    summaries: [],
    focus,
    relevant,
  };
}

/** Render a focused pack. With a focus, render header + the relevant slice;
 *  otherwise delegate to the engine's full structural rendering. */
export function renderFocusedContextPack(pack: FocusedContextPack): string {
  if (!pack.focus) return renderContextPack(pack);
  const t = pack.totals;
  const out: string[] = [];
  out.push("# Architecture context (focused)");
  out.push(`${t.nodes} nodes, ${t.edges} edges, ${t.files} files; languages: ${t.languages.join(", ") || "none"}`);
  out.push("");
  out.push("## Layers");
  for (const l of pack.layers) out.push(`- ${l.layer}: ${l.count}`);
  out.push("");
  out.push(`## Relevant to your task: ${pack.focus}`);
  if (pack.relevant.length === 0) {
    out.push("- (no strongly relevant nodes — broaden the task description)");
  } else {
    for (const n of pack.relevant) {
      out.push(`- ${n.qualifiedName} — ${n.kind}/${n.layer}, fanIn ${n.fanIn} (${n.path})${n.summary ? `: ${n.summary}` : ""}`);
    }
  }
  return out.join("\n") + "\n";
}
