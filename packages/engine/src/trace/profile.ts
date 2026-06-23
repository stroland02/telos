import { NodeIndex } from "./match.js";

// Continuous-profiling ingest. Accepts "folded stacks" (Brendan Gregg's
// collapsed format: "frameA;frameB;frameC <count>" per line) — the universal
// flame-graph input that py-spy / async-profiler / perf can all emit. Frames
// map to graph nodes by qualifiedName; per-node self/total sample counts feed
// "hot path" intensity on the map. Accumulates across POSTs; ephemeral.

export interface StackSample { frames: string[]; count: number }
export interface HotNode { nodeId: string; self: number; total: number }
export interface ProfileSnapshot { nodes: HotNode[]; totalSamples: number; unmatched: number }

/** Parse folded/collapsed stacks into samples. Tolerant: skips bad lines. */
export function parseFoldedStacks(text: string): StackSample[] {
  const out: StackSample[] = [];
  if (typeof text !== "string") return out;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sp = trimmed.lastIndexOf(" ");
    if (sp <= 0) continue;
    const count = Number(trimmed.slice(sp + 1));
    if (!Number.isFinite(count) || count <= 0) continue;
    const frames = trimmed.slice(0, sp).split(";").map((f) => f.trim()).filter(Boolean);
    if (frames.length === 0) continue;
    out.push({ frames, count });
  }
  return out;
}

export class ProfileBuffer {
  private selfSamples = new Map<string, number>();
  private totalSamples = new Map<string, number>();
  private samples = 0;
  private unmatched = 0;

  /** Accumulate samples: leaf frame → self; any frame in the stack → total
   *  (counted once per sample even if the node recurses). */
  record(samples: StackSample[], index: NodeIndex): void {
    for (const s of samples) {
      this.samples += s.count;
      const ids = s.frames.map((f) => index.byQname.get(f) ?? null);
      const leaf = ids[ids.length - 1];
      if (leaf) this.selfSamples.set(leaf, (this.selfSamples.get(leaf) ?? 0) + s.count);
      else this.unmatched += s.count;
      const seen = new Set<string>();
      for (const id of ids) {
        if (id && !seen.has(id)) {
          seen.add(id);
          this.totalSamples.set(id, (this.totalSamples.get(id) ?? 0) + s.count);
        }
      }
    }
  }

  snapshot(limit?: number): ProfileSnapshot {
    const ids = new Set([...this.selfSamples.keys(), ...this.totalSamples.keys()]);
    let nodes: HotNode[] = [...ids].map((id) => ({
      nodeId: id, self: this.selfSamples.get(id) ?? 0, total: this.totalSamples.get(id) ?? 0,
    }));
    nodes.sort((a, b) => b.total - a.total || b.self - a.self || a.nodeId.localeCompare(b.nodeId));
    if (limit && limit > 0) nodes = nodes.slice(0, limit);
    return { nodes, totalSamples: this.samples, unmatched: this.unmatched };
  }
}
