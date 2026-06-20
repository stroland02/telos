// packages/server/src/graphService.ts
import {
  GraphStore, aggregate, overview, childrenOf, nodeDetail,
  TelosGraph, TelosNode, AggregatedGraph, GraphView, NodeDetail,
} from "@telos/engine";
import { GraphProvider } from "./server.js";

export class GraphService implements GraphProvider {
  private constructor(
    private readonly graph: TelosGraph,
    private readonly agg: AggregatedGraph,
    private readonly store: GraphStore | null,
  ) {}

  static fromDb(dbPath: string): GraphService {
    const store = GraphStore.open(dbPath);
    const graph = store.loadGraph();
    return new GraphService(graph, aggregate(graph), store);
  }

  static fromGraph(graph: TelosGraph): GraphService {
    return new GraphService(graph, aggregate(graph), null);
  }

  getOverview(): GraphView { return overview(this.graph, this.agg); }
  getChildren(id: string): GraphView | null { return childrenOf(this.graph, this.agg, id); }
  getNode(id: string): NodeDetail | null { return nodeDetail(this.graph, id); }

  search(q: string): TelosNode[] {
    if (this.store) return this.store.search(q);
    const needle = q.toLowerCase();
    return this.graph.nodes.filter(
      (n) => n.name.toLowerCase().includes(needle) || n.qualifiedName.toLowerCase().includes(needle),
    );
  }

  close(): void { this.store?.close(); }
}
