import { SpanRecord } from "./otlp.js";
import { NodeIndex, matchSpanToNode } from "./match.js";

// Retains the last N complete traces so a single request can be "played back"
// as a path through the map. Bounded ring — ephemeral, like the aggregator.
// Spans for one traceId may arrive across batches, so traces are merged by id.

export interface TraceSummary {
  traceId: string;
  rootName: string;
  spanCount: number;
  durationMs: number;
  hasError: boolean;
}

export interface TracePathStep {
  order: number;
  spanId: string;
  name: string;
  nodeId: string | null; // null = span did not map to a graph node
  durationMs: number;
  isError: boolean;
  depth: number;
}

interface TraceEntry { spans: Map<string, SpanRecord>; seq: number }

export class TraceBuffer {
  private traces = new Map<string, TraceEntry>();
  private seq = 0;
  private readonly capacity: number;

  constructor(opts: { capacity?: number } = {}) {
    this.capacity = Math.max(1, opts.capacity ?? 50);
  }

  /** Merge a batch of spans into their traces (by traceId), newest-touched last. */
  record(spans: SpanRecord[]): void {
    for (const s of spans) {
      if (!s.traceId) continue;
      let entry = this.traces.get(s.traceId);
      if (!entry) { entry = { spans: new Map(), seq: 0 }; this.traces.set(s.traceId, entry); }
      entry.spans.set(s.spanId, s);
      // Bump recency: re-insert so Map iteration order tracks last-touched.
      entry.seq = ++this.seq;
      this.traces.delete(s.traceId);
      this.traces.set(s.traceId, entry);
    }
    while (this.traces.size > this.capacity) {
      const oldest = this.traces.keys().next().value as string;
      this.traces.delete(oldest);
    }
  }

  /** Recent traces, newest first. */
  recent(limit = 20): TraceSummary[] {
    const out: TraceSummary[] = [];
    for (const [traceId, entry] of this.traces) out.push({ traceId, ...summarize(entry) });
    out.reverse(); // Map order is oldest→newest; we want newest first
    return out.slice(0, Math.max(0, limit));
  }

  /** Chronological node-by-node path for one trace, or null if unknown. */
  path(traceId: string, index: NodeIndex): TracePathStep[] | null {
    const entry = this.traces.get(traceId);
    if (!entry) return null;
    const spans = [...entry.spans.values()].sort((a, b) => a.startNs - b.startNs);
    const depthOf = buildDepths(entry.spans);
    return spans.map((s, i) => ({
      order: i,
      spanId: s.spanId,
      name: s.name,
      nodeId: matchSpanToNode(s, index),
      durationMs: s.durationMs,
      isError: s.isError,
      depth: depthOf.get(s.spanId) ?? 0,
    }));
  }
}

function summarize(entry: TraceEntry): Omit<TraceSummary, "traceId"> {
  const spans = [...entry.spans.values()];
  const root = spans.find((s) => !s.parentSpanId || !entry.spans.has(s.parentSpanId))
    ?? spans.slice().sort((a, b) => a.startNs - b.startNs)[0];
  return {
    rootName: root?.name ?? "(unknown)",
    spanCount: spans.length,
    durationMs: root?.durationMs ?? 0,
    hasError: spans.some((s) => s.isError),
  };
}

/** Depth = number of ancestors reachable via parentSpanId within the trace. */
function buildDepths(spans: Map<string, SpanRecord>): Map<string, number> {
  const depths = new Map<string, number>();
  const compute = (id: string, seen: Set<string>): number => {
    if (depths.has(id)) return depths.get(id)!;
    const s = spans.get(id);
    if (!s || !s.parentSpanId || !spans.has(s.parentSpanId) || seen.has(id)) { depths.set(id, 0); return 0; }
    seen.add(id);
    const d = 1 + compute(s.parentSpanId, seen);
    depths.set(id, d);
    return d;
  };
  for (const id of spans.keys()) compute(id, new Set());
  return depths;
}
