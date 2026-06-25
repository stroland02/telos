import { TelosGraph, TelosNode } from "@telos/engine";
import { recommend } from "@telos/harness";
import { Finding, ResolveState } from "./types.js";
import { ReviewDriver } from "./driver.js";

export interface ResolveOptions {
  graph: TelosGraph;
  driver: ReviewDriver;
  repoDir: string;
  limit?: number;
  signal?: AbortSignal;
  onFinding?: (f: Finding) => void | Promise<void>;
}

const DEFAULT_LIMIT = 20;
const FALLBACK_CAPABILITY = "ecc:typescript-reviewer";

/** Route a node to the most relevant curated review capability. */
export function routeNode(node: TelosNode): string {
  return recommend(node)[0]?.id ?? FALLBACK_CAPABILITY;
}

/** Pick the riskiest symbols: highest complexity, then fan-in. */
function targets(graph: TelosGraph, limit: number): TelosNode[] {
  return graph.nodes
    .filter((n) => n.kind !== "file" && n.kind !== "module")
    .sort((a, b) => b.complexity - a.complexity || b.fanIn - a.fanIn || a.qualifiedName.localeCompare(b.qualifiedName))
    .slice(0, limit);
}

/** Review the top-N nodes with the routed agents; collect findings. Bounded,
 *  read-only, cancellable. `startedAt` is left 0 for the caller to stamp. */
export async function runResolve(opts: ResolveOptions): Promise<ResolveState> {
  const limit = Math.max(1, opts.limit ?? DEFAULT_LIMIT);
  const signal = opts.signal ?? new AbortController().signal;
  const findings: Finding[] = [];
  let scanned = 0;

  for (const node of targets(opts.graph, limit)) {
    if (signal.aborted) break;
    const capability = routeNode(node);
    let produced: Finding[] = [];
    try {
      produced = await opts.driver.review({
        node: { id: node.id, qualifiedName: node.qualifiedName, path: node.path, lineStart: node.lineStart, lineEnd: node.lineEnd },
        repoDir: opts.repoDir,
        capability,
        signal,
      });
    } catch {
      produced = []; // a single node failing never aborts the pass
    }
    scanned += 1;
    for (const f of produced) {
      findings.push(f);
      await opts.onFinding?.(f);
    }
  }

  return { findings, scanned, startedAt: 0, done: true };
}
