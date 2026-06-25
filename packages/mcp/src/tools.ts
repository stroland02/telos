import {
  GraphStore, TelosGraph, TelosNode,
  callersOf, calleesOf, impactOf, affectedBy, explore, ExploreHit, resolveNode,
  buildTour, askGraph, buildContextPack, renderContextPack,
} from "@telos/engine";
import { recommend } from "@telos/harness";

export interface ToolContext { graph: TelosGraph; store: GraphStore | null }

function matchNodes(ctx: ToolContext, query: string): TelosNode[] {
  if (ctx.store) return ctx.store.search(query);
  const needle = query.toLowerCase();
  return ctx.graph.nodes.filter(
    (n) => n.name.toLowerCase().includes(needle) || n.qualifiedName.toLowerCase().includes(needle),
  );
}

export function runExplore(ctx: ToolContext, args: { query: string; limit?: number }): { hits: ExploreHit[] } {
  return explore(ctx.graph, matchNodes(ctx, args.query), { limit: args.limit });
}
export function runCallers(ctx: ToolContext, args: { symbol: string }): TelosNode[] {
  return callersOf(ctx.graph, args.symbol);
}
export function runCallees(ctx: ToolContext, args: { symbol: string }): TelosNode[] {
  return calleesOf(ctx.graph, args.symbol);
}
export function runImpact(ctx: ToolContext, args: { symbol: string }): TelosNode[] {
  return impactOf(ctx.graph, args.symbol);
}
export function runAffected(ctx: ToolContext, args: { paths: string[] }): { symbols: TelosNode[]; files: string[] } {
  return affectedBy(ctx.graph, args.paths);
}
export function runRecommend(ctx: ToolContext, args: { symbol: string }): { node: string | null; capabilities: { id: string; title: string }[] } {
  const node = resolveNode(ctx.graph, args.symbol);
  if (!node) return { node: null, capabilities: [] };
  return { node: node.qualifiedName, capabilities: recommend(node).map((c) => ({ id: c.id, title: c.title })) };
}
export function runTour(ctx: ToolContext, args: { limit?: number }): { stops: { qualifiedName: string; summary: string | null; order: number }[] } {
  return {
    stops: buildTour(ctx.graph, { limit: args.limit }).map((s) => ({
      qualifiedName: s.node.qualifiedName, summary: s.node.summary, order: s.order,
    })),
  };
}
export function runAsk(ctx: ToolContext, args: { question: string; limit?: number }): { answers: { qualifiedName: string; path: string; summary: string | null; score: number }[] } {
  return {
    answers: askGraph(ctx.graph, args.question, { limit: args.limit }).map((a) => ({
      qualifiedName: a.node.qualifiedName, path: a.node.path, summary: a.node.summary, score: a.score,
    })),
  };
}
/** Warm-start brief: the graph distilled into agent working memory (markdown). */
export function runContext(ctx: ToolContext, args: { limit?: number }): string {
  return renderContextPack(buildContextPack(ctx.graph, { limit: args.limit }));
}
