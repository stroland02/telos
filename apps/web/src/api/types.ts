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
