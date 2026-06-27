// packages/server/src/graphService.ts
import { statSync } from "node:fs";
import { join } from "node:path";
import {
  GraphStore, aggregate, overview, childrenOf, nodeDetail, resolveNode, buildTour,
  TraceAggregator, TraceBuffer, LogBuffer, MetricBuffer, ProfileBuffer, ProcessBuffer, buildNodeIndex,
  buildContextPack, renderContextPack, measureSavings, type SavingsReport,
  TelosGraph, TelosNode, AggregatedGraph, GraphView, NodeDetail,
} from "@telos/engine";
import { recommend, readActivity, semanticAsk, type ActivityFeed } from "@telos/harness";
import { GraphProvider, TraceHub } from "./server.js";

export interface MeasureResult extends SavingsReport { files: number; missing: number }

export class GraphService implements GraphProvider {
  private constructor(
    private readonly graph: TelosGraph,
    private readonly agg: AggregatedGraph,
    private readonly store: GraphStore | null,
    readonly repoRoot: string | null,
  ) {}

  /** Lazily-built live trace hub: one aggregator + node index per service. */
  private hub: TraceHub | null = null;
  getTraceHub(): TraceHub {
    if (!this.hub) {
      const fileNodes = this.graph.nodes.filter((n) => n.kind === "file").map((n) => ({ id: n.id, path: n.path }));
      this.hub = { aggregator: new TraceAggregator(), buffer: new TraceBuffer(), logs: new LogBuffer(), metrics: new MetricBuffer(), profile: new ProfileBuffer(), processes: new ProcessBuffer(), fileNodes, index: buildNodeIndex(this.graph), forge: { state: null, subscribers: new Set() }, resolve: { state: null, subscribers: new Set() } };
    }
    return this.hub;
  }

  static fromDb(dbPath: string, repoRoot?: string): GraphService {
    const store = GraphStore.open(dbPath);
    const graph = store.loadGraph();
    return new GraphService(graph, aggregate(graph), store, repoRoot ?? null);
  }

  static fromGraph(graph: TelosGraph): GraphService {
    return new GraphService(graph, aggregate(graph), null, null);
  }

  getOverview(): GraphView { return overview(this.graph, this.agg); }
  getContext(limit?: number): string { return renderContextPack(buildContextPack(this.graph, { limit })); }

  /** Token savings: cold-read source baseline vs the warm-start brief. Needs
   *  repoRoot to size files on disk; returns a zeroed baseline if it's unset. */
  getMeasure(limit?: number): MeasureResult {
    let baselineChars = 0, files = 0, missing = 0;
    for (const n of this.graph.nodes) {
      if (n.kind !== "file") continue;
      files++;
      if (!this.repoRoot) { missing++; continue; }
      try { baselineChars += statSync(join(this.repoRoot, n.path)).size; }
      catch { missing++; }
    }
    const packText = renderContextPack(buildContextPack(this.graph, { limit }));
    return { ...measureSavings({ baselineChars, packText }), files, missing };
  }

  /** Recent harness orchestrations + agent tally, read from .telos/activity.jsonl. */
  getActivity(limit?: number): ActivityFeed {
    if (!this.repoRoot) return { entries: [], tally: [] };
    return readActivity(join(this.repoRoot, ".telos"), limit);
  }
  getStats(): { nodes: number; edges: number; files: number; languages: string[]; enriched: number } {
    const nodes = this.graph.nodes;
    return {
      nodes: nodes.length,
      edges: this.graph.edges.length,
      files: nodes.filter((n) => n.kind === "file").length,
      languages: [...new Set(nodes.map((n) => n.language))].sort(),
      enriched: nodes.filter((n) => n.summary && n.summary.trim()).length,
    };
  }
  getChildren(id: string): GraphView | null { return childrenOf(this.graph, this.agg, id); }
  getNode(id: string): NodeDetail | null { return nodeDetail(this.graph, id); }

  getTour(limit?: number) {
    return buildTour(this.graph, { limit }).map((s) => ({
      id: s.node.id, qualifiedName: s.node.qualifiedName, summary: s.node.summary, order: s.order,
    }));
  }

  getAnswers(q: string, limit?: number) {
    // Hybrid semantic + keyword search (LLM phase B). Replaces keyword-only
    // askGraph here; askGraph stays in the engine for MCP/keyword consumers.
    return semanticAsk(this.graph, q, { limit }).map((a) => ({
      id: a.node.id, qualifiedName: a.node.qualifiedName, path: a.node.path,
      summary: a.node.summary, score: a.score,
    }));
  }

  getRecommendations(id: string): { id: string; title: string }[] {
    const node = resolveNode(this.graph, id);
    if (!node) return [];
    return recommend(node).map((c) => ({ id: c.id, title: c.title }));
  }

  getFiles(): TelosNode[] {
    return this.graph.nodes
      .filter((n) => n.kind === "file")
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Returns the set of paths belonging to file-kind nodes (for security allow-list). */
  getFilePaths(): Set<string> {
    return new Set(this.graph.nodes.filter((n) => n.kind === "file").map((n) => n.path));
  }

  search(q: string): TelosNode[] {
    if (this.store) return this.store.search(q);
    const needle = q.toLowerCase();
    return this.graph.nodes.filter(
      (n) => n.name.toLowerCase().includes(needle) || n.qualifiedName.toLowerCase().includes(needle),
    );
  }

  close(): void { this.store?.close(); }
}
