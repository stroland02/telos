// packages/server/src/graphService.ts
import {
  GraphStore, aggregate, overview, childrenOf, nodeDetail, resolveNode, buildTour, askGraph,
  TraceAggregator, TraceBuffer, LogBuffer, MetricBuffer, buildNodeIndex,
  TelosGraph, TelosNode, AggregatedGraph, GraphView, NodeDetail,
} from "@telos/engine";
import { recommend } from "@telos/harness";
import { GraphProvider, TraceHub } from "./server.js";

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
      this.hub = { aggregator: new TraceAggregator(), buffer: new TraceBuffer(), logs: new LogBuffer(), metrics: new MetricBuffer(), index: buildNodeIndex(this.graph) };
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
  getChildren(id: string): GraphView | null { return childrenOf(this.graph, this.agg, id); }
  getNode(id: string): NodeDetail | null { return nodeDetail(this.graph, id); }

  getTour(limit?: number) {
    return buildTour(this.graph, { limit }).map((s) => ({
      id: s.node.id, qualifiedName: s.node.qualifiedName, summary: s.node.summary, order: s.order,
    }));
  }

  getAnswers(q: string, limit?: number) {
    return askGraph(this.graph, q, { limit }).map((a) => ({
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
