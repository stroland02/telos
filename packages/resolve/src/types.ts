export type Severity = "info" | "warn" | "error";

/** One issue found by a review agent, anchored to a graph node. */
export interface Finding {
  nodeId: string;
  file: string;
  severity: Severity;
  title: string;       // short
  detail: string;      // what's wrong
  suggestion: string;  // how to resolve (text, not a diff)
  agent: string;       // which capability produced it
}

export interface ResolveState {
  findings: Finding[];
  scanned: number;     // nodes reviewed
  startedAt: number;   // ms epoch (stamped by the caller)
  done: boolean;
}

export const SEVERITY_RANK: Record<Severity, number> = { error: 3, warn: 2, info: 1 };
