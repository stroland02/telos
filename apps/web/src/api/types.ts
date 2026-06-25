export type Layer = "api" | "service" | "data" | "ui" | "infra" | "util" | "unknown";
export type ViewLevel = "layer" | "module" | "file" | "symbol";
export interface ViewNode { id: string; label: string; level: ViewLevel; layer: Layer; symbolCount: number; fanIn: number; fanOut: number; complexity: number; }
export interface ViewEdge { sourceId: string; targetId: string; weight: number; }
export interface GraphView { nodes: ViewNode[]; edges: ViewEdge[]; }
export interface TelosNodeDTO {
  id: string; kind: string; name: string; qualifiedName: string; language: string; path: string;
  lineStart: number; lineEnd: number; layer: Layer; fanIn: number; fanOut: number;
  lines: number; complexity: number; summary: string | null;
}
export interface NodeDetail { node: TelosNodeDTO; callers: TelosNodeDTO[]; callees: TelosNodeDTO[]; }
export interface SourceResult { path: string; content: string; lines: number; }
export interface Recommendation { id: string; title: string; }
export interface TourStop { id: string; qualifiedName: string; summary: string | null; order: number; }
export interface Answer { id: string; qualifiedName: string; path: string; summary: string | null; score: number; }

// ── Phase 2 A1: live OTel trace overlay ──────────────────────────────────────
export interface TraceNodeSignal { id: string; calls: number; p95Ms: number; errors: number; }
export interface TraceEdgeSignal { sourceId: string; targetId: string; calls: number; errors: number; }
export interface TraceState {
  nodes: TraceNodeSignal[];
  edges: TraceEdgeSignal[];
  unmapped: number;
  unmappedEdges: number;
  windowMs: number;
}
export interface TraceSummary { traceId: string; rootName: string; spanCount: number; durationMs: number; hasError: boolean; }
export interface TracePathStep { order: number; spanId: string; name: string; nodeId: string | null; durationMs: number; isError: boolean; depth: number; }
export interface LogLine { ts: number; severity: string; body: string; attrs: Record<string, string>; traceId?: string; spanId?: string; nodeId: string | null; }
export interface MetricSeries { name: string; unit: string; latest: number; points: number[]; }
export interface HotNode { nodeId: string; self: number; total: number; }
export interface ProfileSnapshot { nodes: HotNode[]; totalSamples: number; unmatched: number; }
export interface ProcessSample { pid: number; ppid?: number; name: string; cmd?: string; cpu: number; memMb: number; nodeId?: string | null; }
export interface ForgeDiff { added: { nodes: string[]; edges: string[] }; removed: { nodes: string[]; edges: string[] }; changed: string[]; }
export interface ForgeState { run: string; turn: number; costUsd: number; stop: string | null; diff: ForgeDiff; }

// ── Resolve (scan-for-resolutions): agent findings flagged on the map ────────
export interface Finding { nodeId: string; file: string; severity: "info" | "warn" | "error"; title: string; detail: string; suggestion: string; agent: string; }
export interface ResolveState { findings: Finding[]; scanned: number; startedAt: number; done: boolean; }

// ── Harness cockpit: what's installed / enabled / drifted ────────────────────
export interface HarnessCapabilityRow { id: string; title: string; kind: string; activation: "node" | "prompt"; triggers?: string[]; }
export interface HarnessSourceStatus { source: string; title: string; repo: string; nodeCapabilities: number; capabilities: HarnessCapabilityRow[]; }
export interface HarnessStatus {
  installed: HarnessSourceStatus[];
  totals: { nodeCapabilities: number; promptIntents: number };
  drift: { status: string; missing: string[]; added: string[] };
  lock: { present: boolean; path: string };
}

// ── Token savings: cold-read baseline vs the warm-start brief ────────────────
export interface TokenSavings { baselineTokens: number; packTokens: number; reductionPct: number; ratio: number; costSavedUsd: number; files: number; missing: number; }

// ── Control rail status (assembled from existing reads/streams) ──────────────
export interface GraphStats { nodes: number; edges: number; files: number; languages: string[]; enriched: number; }
export interface TelosStatus {
  graph: GraphStats | null;
  harness: { caps: number; drift: string } | null;
  live: { calls: number } | null;
  procs: number | null;
  forge: { turn: number; costUsd: number; stop: string | null } | null;
}
