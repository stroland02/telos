import { createHash } from "node:crypto";

export type NodeKind =
  | "module" | "file" | "class" | "function" | "method" | "interface" | "variable";

export type Layer = "api" | "service" | "data" | "ui" | "infra" | "util" | "unknown";

export type EdgeKind =
  | "calls" | "imports" | "inherits" | "implements" | "contains" | "references";

export interface TelosNode {
  id: string;
  kind: NodeKind;
  name: string;
  qualifiedName: string;
  language: string;
  path: string;
  lineStart: number;
  lineEnd: number;
  layer: Layer;
  fanIn: number;
  fanOut: number;
  lines: number;
  complexity: number;
  summary: string | null; // reserved for Phase 3 LLM enrichment
}

export interface TelosEdge {
  sourceId: string;
  targetId: string;
  kind: EdgeKind;
  resolved: boolean;
}

export interface TelosGraph {
  nodes: TelosNode[];
  edges: TelosEdge[];
}

export function createNodeId(path: string, qualifiedName: string): string {
  return createHash("sha1").update(`${path}::${qualifiedName}`).digest("hex");
}
