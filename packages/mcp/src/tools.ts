import {
  GraphStore, TelosGraph, TelosNode,
  callersOf, calleesOf, impactOf, affectedBy, explore, ExploreHit,
} from "@telos/engine";

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
