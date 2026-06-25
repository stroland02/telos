import { Finding } from "./types.js";

export interface ReviewDriverArgs {
  node: { id: string; qualifiedName: string; path: string; lineStart: number; lineEnd: number };
  repoDir: string;
  capability: string; // the routed review agent id
  signal: AbortSignal;
}

export interface ReviewDriver {
  readonly id: string;
  review(a: ReviewDriverArgs): Promise<Finding[]>;
}

/** Deterministic, no-network driver — the test seam. Returns one finding per node. */
export const stubReviewDriver: ReviewDriver = {
  id: "stub",
  async review({ node, capability }: ReviewDriverArgs): Promise<Finding[]> {
    return [{
      nodeId: node.id,
      file: node.path,
      severity: "warn",
      title: `Review ${node.qualifiedName}`,
      detail: `Stub review of ${node.qualifiedName} via ${capability}.`,
      suggestion: "Run with --driver claude for real agent findings.",
      agent: capability,
    }];
  },
};
