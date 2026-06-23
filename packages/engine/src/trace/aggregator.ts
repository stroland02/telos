import { SpanRecord } from "./otlp.js";
import { NodeIndex, matchSpanToNode } from "./match.js";

// Rolling in-memory aggregation of live trace signal. Ephemeral by design —
// no persistence. A time-window evicts stale events so memory stays bounded
// and the overlay reflects "recent" traffic. Clock is injectable for tests.

export interface TraceNodeSignal { id: string; calls: number; p95Ms: number; errors: number }
export interface TraceEdgeSignal { sourceId: string; targetId: string; calls: number; errors: number }
export interface TraceState {
  nodes: TraceNodeSignal[];
  edges: TraceEdgeSignal[];
  unmapped: number;
  unmappedEdges: number;
  windowMs: number;
}

interface NodeEvent { ts: number; nodeId: string; durationMs: number; isError: boolean }
interface EdgeEvent { ts: number; key: string; sourceId: string; targetId: string; isError: boolean }

function p95(durations: number[]): number {
  if (durations.length === 0) return 0;
  const sorted = [...durations].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export class TraceAggregator {
  private nodeEvents: NodeEvent[] = [];
  private edgeEvents: EdgeEvent[] = [];
  private unmapped = 0;
  private unmappedEdges = 0;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(opts: { windowMs?: number; now?: () => number } = {}) {
    this.windowMs = opts.windowMs ?? 30_000;
    this.now = opts.now ?? (() => Date.now());
  }

  ingest(spans: SpanRecord[], index: NodeIndex): void {
    const ts = this.now();
    // Resolve every span in the batch first so parents can be looked up.
    const nodeOf = new Map<string, string | null>();
    for (const s of spans) nodeOf.set(s.spanId, matchSpanToNode(s, index));

    for (const s of spans) {
      const nodeId = nodeOf.get(s.spanId) ?? null;
      if (!nodeId) { this.unmapped++; continue; }
      this.nodeEvents.push({ ts, nodeId, durationMs: s.durationMs, isError: s.isError });

      if (s.parentSpanId) {
        const parentNode = nodeOf.get(s.parentSpanId);
        if (parentNode && parentNode !== nodeId) {
          const key = `${parentNode} ${nodeId}`;
          if (index.edgePairs.has(key)) {
            this.edgeEvents.push({ ts, key, sourceId: parentNode, targetId: nodeId, isError: s.isError });
          } else {
            this.unmappedEdges++;
          }
        }
      }
    }
  }

  snapshot(): TraceState {
    const cutoff = this.now() - this.windowMs;
    this.nodeEvents = this.nodeEvents.filter((e) => e.ts >= cutoff);
    this.edgeEvents = this.edgeEvents.filter((e) => e.ts >= cutoff);

    const byNode = new Map<string, { durations: number[]; errors: number }>();
    for (const e of this.nodeEvents) {
      let agg = byNode.get(e.nodeId);
      if (!agg) { agg = { durations: [], errors: 0 }; byNode.set(e.nodeId, agg); }
      agg.durations.push(e.durationMs);
      if (e.isError) agg.errors++;
    }
    const nodes: TraceNodeSignal[] = [...byNode.entries()].map(([id, a]) => ({
      id, calls: a.durations.length, p95Ms: p95(a.durations), errors: a.errors,
    }));

    const byEdge = new Map<string, TraceEdgeSignal>();
    for (const e of this.edgeEvents) {
      let agg = byEdge.get(e.key);
      if (!agg) { agg = { sourceId: e.sourceId, targetId: e.targetId, calls: 0, errors: 0 }; byEdge.set(e.key, agg); }
      agg.calls++;
      if (e.isError) agg.errors++;
    }

    return {
      nodes, edges: [...byEdge.values()],
      unmapped: this.unmapped, unmappedEdges: this.unmappedEdges, windowMs: this.windowMs,
    };
  }
}
