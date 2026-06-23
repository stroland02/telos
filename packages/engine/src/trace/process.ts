// Local process/OS telemetry — the "advanced task manager" overlay. A push
// model (a collector POSTs samples) keeps Telos local-first and avoids native
// deps in the server. Processes optionally join to graph nodes when their
// command line references a file node's path. Ephemeral snapshot.

export interface ProcessSample {
  pid: number;
  name: string;
  cmd?: string;     // command line, if known (used for the node join)
  cpu: number;      // percent
  memMb: number;    // resident memory, MB
  nodeId?: string | null; // graph node this process is running, if matched
}

/** File-node reference used to join a process to the graph by path. */
export interface FileNodeRef { id: string; path: string }

/** Tag each process with a node whose file path appears in its command line.
 *  Longest path wins (most specific). Honest: no match ⇒ nodeId null. */
export function tagProcesses(samples: ProcessSample[], fileNodes: FileNodeRef[]): ProcessSample[] {
  const byLongest = [...fileNodes].sort((a, b) => b.path.length - a.path.length);
  return samples.map((p) => {
    const cmd = (p.cmd ?? "").replace(/\\/g, "/");
    if (!cmd) return { ...p, nodeId: null };
    const hit = byLongest.find((f) => f.path.length > 0 && cmd.includes(f.path));
    return { ...p, nodeId: hit ? hit.id : null };
  });
}

export class ProcessBuffer {
  private snapshot: ProcessSample[] = [];

  /** Replace the snapshot with the latest sample set. */
  set(samples: ProcessSample[]): void {
    this.snapshot = [...samples];
  }

  /** Latest processes, CPU-descending then memory-descending. */
  latest(limit?: number): ProcessSample[] {
    const sorted = [...this.snapshot].sort((a, b) => b.cpu - a.cpu || b.memMb - a.memMb);
    return limit && limit > 0 ? sorted.slice(0, limit) : sorted;
  }

  count(): number { return this.snapshot.length; }
}
