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

// ── Harness activity feed: recent orchestrations + which agents fired most ───
export interface ActivityEntry { ts: number; promptSnippet: string; intent: string; agents: string[]; sources: string[]; injectedTokens?: number; block?: string; }
export interface ActivityFeed { entries: ActivityEntry[]; tally: { id: string; count: number }[]; }
export interface McpActivityEntry { ts: number; tool: string; argsSummary: string; resultTokens: number; }
export interface McpActivityFeed { entries: McpActivityEntry[]; totals: { queries: number; tokens: number }; }
// Rolling "what's actually being used" — distinct agents/harnesses Telos routed
// to over the recent prompt window (dynamic, vs. the static curated catalog).
export interface UsageStats {
  windowPrompts: number;
  activeCount: number; // distinct agents active right now (recency-windowed)
  agents: { id: string; count: number; lastTs: number; active: boolean }[];
  sources: { source: string; count: number; lastTs: number }[];
}
// Longevity view: per-day usage + injected-token trend over the project's whole
// life (not a rolling window) — the History tab's "how Telos shaped tokens" story.
export interface HistoryDay { day: string; prompts: number; agents: number; injectedTokens: number }
export interface HistoryStats {
  totalPrompts: number;
  totalInjected: number;
  distinctAgents: number;
  firstTs: number | null;
  lastTs: number | null;
  days: HistoryDay[];
}

// ── Control rail status (assembled from existing reads/streams) ──────────────
export interface GraphStats { nodes: number; edges: number; files: number; languages: string[]; enriched: number; }
export interface TelosStatus {
  graph: GraphStats | null;
  harness: { caps: number; drift: string } | null;
  live: { calls: number } | null;
  procs: number | null;
  forge: { turn: number; costUsd: number; stop: string | null } | null;
}
