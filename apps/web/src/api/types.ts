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
