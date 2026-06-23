// Local process/OS telemetry — the "advanced task manager" overlay. A push
// model (a collector POSTs samples) keeps Telos local-first and avoids native
// deps in the server. Processes optionally join to graph nodes when their
// command line references a file node's path. Ephemeral snapshot.

export interface ProcessSample {
  pid: number;
  ppid?: number;    // parent pid, if known (drives the process tree)
  name: string;
  cmd?: string;     // command line, if known (used for the node join)
  cpu: number;      // percent
  memMb: number;    // resident memory, MB
  nodeId?: string | null; // graph node this process is running, if matched
}

export interface ProcessTreeNode extends ProcessSample {
  depth: number;
  children: ProcessTreeNode[];
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

/** Build a parent→child process forest from a flat sample list. A process is a
 *  root when its ppid is missing or points outside the set (orphan). Children
 *  are ordered CPU-desc then mem-desc. Cycle-safe (a process can't be its own
 *  ancestor). */
export function buildProcessTree(samples: ProcessSample[]): ProcessTreeNode[] {
  const byPid = new Map<number, ProcessTreeNode>();
  for (const s of samples) byPid.set(s.pid, { ...s, depth: 0, children: [] });

  const isAncestor = (ancestorPid: number, node: ProcessTreeNode): boolean => {
    let cur: number | undefined = node.ppid;
    const seen = new Set<number>([node.pid]);
    while (cur != null && !seen.has(cur)) {
      if (cur === ancestorPid) return true;
      seen.add(cur);
      cur = byPid.get(cur)?.ppid;
    }
    return false;
  };

  const roots: ProcessTreeNode[] = [];
  for (const node of byPid.values()) {
    const parent = node.ppid != null ? byPid.get(node.ppid) : undefined;
    // attach to parent unless it's missing, is self, or would form a cycle
    if (parent && parent.pid !== node.pid && !isAncestor(node.pid, parent)) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRec = (nodes: ProcessTreeNode[], depth: number) => {
    nodes.sort((a, b) => b.cpu - a.cpu || b.memMb - a.memMb || a.pid - b.pid);
    for (const n of nodes) { n.depth = depth; sortRec(n.children, depth + 1); }
  };
  sortRec(roots, 0);
  return roots;
}

/** Flatten a process forest into depth-annotated rows (pre-order) for table rendering. */
export function flattenProcessTree(roots: ProcessTreeNode[]): ProcessTreeNode[] {
  const out: ProcessTreeNode[] = [];
  const walk = (n: ProcessTreeNode) => { out.push(n); n.children.forEach(walk); };
  roots.forEach(walk);
  return out;
}
